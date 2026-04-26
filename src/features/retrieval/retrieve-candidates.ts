import { Client } from "pg";
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { ExamScopeCode } from "@/features/content/import-types";
import {
  confusionClusterLabels,
  confusionClusterPurposes,
  type ConfusionClusterLabel,
  type ConfusionClusterPurpose,
} from "@/features/content/import-types";
import { normalizeQuery } from "@/features/retrieval/normalize-query";
import { findRootFamilyPrototype } from "@/features/retrieval/root-family-prototypes";
import { rankCandidates } from "@/features/retrieval/rank-candidates";
import {
  findEnglishCandidateRows,
  findInScopeLookalikeRows,
} from "@/features/retrieval/retrieval-sql";
import type {
  ComparisonView,
  NoMatchReason,
  RankableCandidate,
  RankedCandidate,
  RetrievalCandidate,
  RetrievalResult,
  RootFamilyView,
} from "@/features/retrieval/types";

const directLookupThreshold = {
  minScore: 0.62,
  minGap: 0.08,
};

const fuzzyRecallThreshold = {
  minScore: 0.68,
  minGap: 0.12,
};

const retrievalEntryInclude = {
  aliases: true,
  meanings: true,
  scopes: true,
  confusionGroups: {
    include: {
      confusionGroup: true,
    },
  },
} satisfies Prisma.VocabularyEntryInclude;

type RetrievalEntryRecord = Prisma.VocabularyEntryGetPayload<{
  include: typeof retrievalEntryInclude;
}>;

const confusionGroupInclude = {
  members: {
    orderBy: {
      ordinal: "asc",
    },
    include: {
      entry: {
        include: retrievalEntryInclude,
      },
    },
  },
  teachFirstEntry: {
    include: retrievalEntryInclude,
  },
} satisfies Prisma.ConfusionGroupInclude;

type ConfusionGroupRecord = Prisma.ConfusionGroupGetPayload<{
  include: typeof confusionGroupInclude;
}>;

type RetrieveCandidatesInput = {
  activeExamTarget: ExamScopeCode;
  query: string;
};

type StableSelection = {
  candidate: RankedCandidate | null;
  matchType: "exact" | "fuzzy" | null;
  noMatchReason: NoMatchReason;
};

type TermResolution = {
  term: string;
  candidate: RankedCandidate | null;
  matchType: "exact" | "fuzzy" | null;
  noMatchReason: NoMatchReason;
  candidates: RankedCandidate[];
};

type GroupSelectionPolicy = "default" | "ordinary_lookup" | "expression_recall";

function shouldUseGroupForOrdinaryLookup(group: ConfusionGroupRecord) {
  const labels = new Set(group.labels);
  const purposes = new Set(group.purposes);

  if (
    purposes.has("expression_recall")
    && !labels.has("shape_like")
    && !labels.has("root_family")
    && !labels.has("prefix_family")
  ) {
    return false;
  }

  if (!labels.has("meaning_near")) {
    return true;
  }

  return (
    labels.has("shape_like")
    || labels.has("root_family")
    || labels.has("prefix_family")
    || labels.has("collocation_boundary")
    || labels.has("exam_high_value")
  );
}

function shouldUseGroupForExpressionRecall(group: ConfusionGroupRecord) {
  const labels = new Set(group.labels);
  const purposes = new Set(group.purposes);

  return purposes.has("expression_recall") || labels.has("meaning_near");
}

function uniqueValues<T>(values: T[]) {
  return [...new Set(values)];
}

function toRankableCandidate(
  entry: RetrievalEntryRecord,
  overrides?: Partial<RankableCandidate>,
): RankableCandidate {
  const scopeCodes = entry.scopes.map((scope) => scope.scopeCode as ExamScopeCode);

  return {
    entryId: entry.id,
    lemma: entry.lemma,
    meaningsZh: entry.meanings.map((meaning) => meaning.zh),
    matchedAlias: null,
    scopeCodes,
    confusionGroupIds: entry.confusionGroups.map((member) => member.confusionGroupId),
    exactLemma: false,
    exactAlias: false,
    textScore: 0,
    meaningMatch: false,
    fromConfusionGroup: false,
    provenance: [],
    ...overrides,
  };
}

function toRetrievalCandidate(candidate: RankedCandidate): RetrievalCandidate {
  return {
    entryId: candidate.entryId,
    lemma: candidate.lemma,
    meaningsZh: candidate.meaningsZh,
    matchedAlias: candidate.matchedAlias,
    scopeCodes: candidate.scopeCodes,
    inScope: candidate.inScope,
    reason: candidate.reason,
    score: candidate.score,
  };
}

function buildConfusionGroupReason(
  activeExamTarget: ExamScopeCode,
  entry: RetrievalEntryRecord,
) {
  const inScope = entry.scopes.some((scope) => scope.scopeCode === activeExamTarget);

  return inScope ? "当前考试范围命中，来自同一易混词组" : "来自同一易混词组";
}

function createConfusionGroupCandidate(
  activeExamTarget: ExamScopeCode,
  entry: RetrievalEntryRecord,
): RetrievalCandidate {
  const inScope = entry.scopes.some((scope) => scope.scopeCode === activeExamTarget);

  return {
    entryId: entry.id,
    lemma: entry.lemma,
    meaningsZh: entry.meanings.map((meaning) => meaning.zh),
    matchedAlias: null,
    scopeCodes: entry.scopes.map((scope) => scope.scopeCode as ExamScopeCode),
    inScope,
    reason: buildConfusionGroupReason(activeExamTarget, entry),
    score: inScope ? 25 : 0,
  };
}

function uniqueRetrievalCandidates(candidates: RetrievalCandidate[]) {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    if (seen.has(candidate.entryId)) {
      return false;
    }

    seen.add(candidate.entryId);
    return true;
  });
}

function uniqueRankedCandidates(candidates: RankedCandidate[]) {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    if (seen.has(candidate.entryId)) {
      return false;
    }

    seen.add(candidate.entryId);
    return true;
  });
}

async function findEntriesByIds(entryIds: string[]) {
  if (entryIds.length === 0) {
    return [];
  }

  const entries = await db.vocabularyEntry.findMany({
    where: { id: { in: entryIds } },
    include: retrievalEntryInclude,
  });

  const entryMap = new Map(entries.map((entry) => [entry.id, entry]));

  return entryIds
    .map((entryId) => entryMap.get(entryId))
    .filter((entry): entry is RetrievalEntryRecord => Boolean(entry));
}

async function findEntriesByLemmas(lemmas: string[]) {
  if (lemmas.length === 0) {
    return [];
  }

  const entries = await db.vocabularyEntry.findMany({
    where: { lemma: { in: lemmas } },
    include: retrievalEntryInclude,
  });

  const entryMap = new Map(entries.map((entry) => [entry.lemma, entry]));

  return lemmas
    .map((lemma) => entryMap.get(lemma))
    .filter((entry): entry is RetrievalEntryRecord => Boolean(entry));
}

async function findConfusionGroupsForEntryIds(entryIds: string[]) {
  if (entryIds.length === 0) {
    return [];
  }

  return db.confusionGroup.findMany({
    where: {
      members: {
        some: {
          entryId: { in: entryIds },
        },
      },
    },
    include: confusionGroupInclude,
  });
}

async function findConfusionGroupById(groupId: string) {
  return db.confusionGroup.findUnique({
    where: {
      id: groupId,
    },
    include: confusionGroupInclude,
  });
}

function buildComparisonView(
  activeExamTarget: ExamScopeCode,
  group: ConfusionGroupRecord,
): ComparisonView {
  const validLabelSet = new Set(confusionClusterLabels);
  const validPurposeSet = new Set(confusionClusterPurposes);
  const isConfusionClusterLabel = (label: string): label is ConfusionClusterLabel =>
    validLabelSet.has(label as ConfusionClusterLabel);
  const isConfusionClusterPurpose = (
    purpose: string,
  ): purpose is ConfusionClusterPurpose =>
    validPurposeSet.has(purpose as ConfusionClusterPurpose);

  return {
    id: group.id,
    whyConfusing: group.whyConfusing,
    commonMisusePoints: group.commonMisusePoints,
    semanticBoundaryNotes: group.semanticBoundaryNotes,
    labels: group.labels.filter(isConfusionClusterLabel),
    purposes: group.purposes.filter(isConfusionClusterPurpose),
    anchorPattern: group.anchorPattern ?? null,
    quickDistinction: group.quickDistinction ?? null,
    examHook: group.examHook ?? null,
    members: group.members.map((member) => ({
      entryId: member.entry.id,
      lemma: member.entry.lemma,
      meaningsZh: member.entry.meanings.map((meaning) => meaning.zh),
      emphasisNote: member.emphasisNote ?? null,
      inScope: member.entry.scopes.some((scope) => scope.scopeCode === activeExamTarget),
    })),
  };
}

function createNoMatchResult(
  normalizedQuery: ReturnType<typeof normalizeQuery>,
  candidates: RankedCandidate[],
  noMatchReason: NoMatchReason,
  rootFamilyView: RootFamilyView | null = null,
): RetrievalResult {
  return {
    queryMode: normalizedQuery.queryMode,
    normalizedQuery,
    resolution: "no_match",
    noMatchReason,
    candidates: candidates.map(toRetrievalCandidate),
    mainAnswer: [],
    confusionBoundary: [],
    comparisonView: null,
    rootFamilyView,
  };
}

function createResolvedResult(
  normalizedQuery: ReturnType<typeof normalizeQuery>,
  candidates: RankedCandidate[],
  mainAnswer: RetrievalCandidate[],
  confusionBoundary: RetrievalCandidate[],
  comparisonView: ComparisonView | null,
  rootFamilyView: RootFamilyView | null = null,
): RetrievalResult {
  return {
    queryMode: normalizedQuery.queryMode,
    normalizedQuery,
    resolution: "resolved",
    noMatchReason: null,
    candidates: candidates.map(toRetrievalCandidate),
    mainAnswer,
    confusionBoundary,
    comparisonView,
    rootFamilyView,
  };
}

function shareConfusionGroup(left: RankedCandidate, right: RankedCandidate) {
  return left.confusionGroupIds.some((groupId) => right.confusionGroupIds.includes(groupId));
}

function createRootFamilyRankedCandidate(
  activeExamTarget: ExamScopeCode,
  entry: RetrievalEntryRecord,
): RankedCandidate {
  const inScope = entry.scopes.some((scope) => scope.scopeCode === activeExamTarget);

  return {
    ...toRankableCandidate(entry),
    inScope,
    reason: inScope ? "当前考试范围命中，来自词根家族原型" : "来自词根家族原型",
    score: inScope ? 30 : 8,
  };
}

function hydrateRootFamilyView(
  activeExamTarget: ExamScopeCode,
  prototype: RootFamilyView,
  entries: RetrievalEntryRecord[],
) {
  const entryMap = new Map(entries.map((entry) => [entry.lemma, entry]));

  return {
    ...prototype,
    members: prototype.members
      .map((member) => {
        const entry = entryMap.get(member.lemma);
        const inScope = entry
          ? entry.scopes.some((scope) => scope.scopeCode === activeExamTarget)
          : false;

        return {
          ...member,
          entryId: entry?.id ?? null,
          inScope,
        };
      })
      .filter((member) => member.entryId && member.inScope),
  };
}

function selectStableEnglishCandidate(
  candidates: RankedCandidate[],
  threshold: typeof directLookupThreshold,
): StableSelection {
  const exactCandidate = candidates.find(
    (candidate) => candidate.exactLemma || candidate.exactAlias,
  );

  if (exactCandidate) {
    return {
      candidate: exactCandidate,
      matchType: "exact",
      noMatchReason: "low_confidence",
    };
  }

  const [topCandidate] = candidates;

  if (!topCandidate) {
    return {
      candidate: null,
      matchType: null,
      noMatchReason: "out_of_kb",
    };
  }

  const competingCandidate = candidates.find(
    (candidate) =>
      candidate.entryId !== topCandidate.entryId
      && !shareConfusionGroup(topCandidate, candidate),
  );
  const competingScore = competingCandidate?.textScore ?? 0;

  if (
    topCandidate.textScore >= threshold.minScore
    && topCandidate.textScore - competingScore >= threshold.minGap
  ) {
    return {
      candidate: topCandidate,
      matchType: "fuzzy",
      noMatchReason: "low_confidence",
    };
  }

  return {
    candidate: null,
    matchType: null,
    noMatchReason: topCandidate.textScore >= threshold.minScore ? "low_confidence" : "out_of_kb",
  };
}

async function findEnglishRankedCandidates(
  activeExamTarget: ExamScopeCode,
  needle: string,
) {
  const rawRows = await findEnglishCandidateRows(activeExamTarget, needle);
  const primaryEntries = await findEntriesByIds(rawRows.map((row) => row.entryId));
  const rawRowMap = new Map(rawRows.map((row) => [row.entryId, row]));

  return rankCandidates(
    activeExamTarget,
    primaryEntries.map((entry) => {
      const row = rawRowMap.get(entry.id);
      const textScore = Math.max(
        row?.lemmaSimilarity ?? 0,
        row?.lemmaWordSimilarity ?? 0,
        row?.aliasSimilarity ?? 0,
        row?.aliasWordSimilarity ?? 0,
      );
      const provenance = uniqueValues(
        [
          row?.exactLemma ? "exact_lemma" : null,
          row?.exactAlias ? "exact_alias" : null,
          textScore > 0 ? "fuzzy_text" : null,
        ].filter(
          (
            provenance,
          ): provenance is NonNullable<RankableCandidate["provenance"][number]> =>
            Boolean(provenance),
        ),
      );

      return toRankableCandidate(entry, {
        matchedAlias: row?.matchedAlias ?? null,
        exactLemma: row?.exactLemma ?? false,
        exactAlias: row?.exactAlias ?? false,
        textScore,
        provenance,
      });
    }),
  );
}

async function findDynamicLookalikeRankedCandidates(
  activeExamTarget: ExamScopeCode,
  needle: string,
) {
  const rawRows = await findInScopeLookalikeRows(activeExamTarget, needle);
  const primaryEntries = await findEntriesByIds(rawRows.map((row) => row.entryId));
  const rawRowMap = new Map(rawRows.map((row) => [row.entryId, row]));

  return rankCandidates(
    activeExamTarget,
    primaryEntries
      .filter((entry) => entry.meanings.length > 0)
      .map((entry) => {
        const row = rawRowMap.get(entry.id);
        const textScore = Math.max(
          row?.lemmaSimilarity ?? 0,
          row?.lemmaWordSimilarity ?? 0,
        );

        return toRankableCandidate(entry, {
          exactLemma: row?.exactLemma ?? false,
          textScore,
          provenance: uniqueValues(
            [
              row?.exactLemma ? "exact_lemma" : null,
              textScore > 0 ? "fuzzy_text" : null,
            ].filter(
              (
                provenance,
              ): provenance is NonNullable<RankableCandidate["provenance"][number]> =>
                Boolean(provenance),
            ),
          ),
        });
      }),
  );
}

async function findMeaningRankedCandidates(
  activeExamTarget: ExamScopeCode,
  meaningKeyword: string,
) {
  const trimmedKeyword = meaningKeyword.trim();

  if (!trimmedKeyword) {
    return [];
  }

  // This two-step lookup avoids a Prisma relation-filter query that is unstable
  // against the local Prisma Postgres dev server on Windows.
  const connectionString = env.databaseUrl ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for meaning lookup.");
  }

  const client = new Client({ connectionString });
  let entryIds: string[] = [];

  try {
    await client.connect();

    const result = await client.query<{ entryId: string }>(
      `
        SELECT
          vm."entryId"
        FROM "vocabulary_meaning" AS vm
        WHERE vm."zh" ILIKE $1
        GROUP BY vm."entryId"
        ORDER BY
          MIN(
            CASE
              WHEN vm."zh" = $2 THEN 0
              WHEN vm."zh" LIKE $3 THEN 1
              ELSE 2
            END
          ) ASC,
          MIN(LENGTH(vm."zh")) ASC,
          vm."entryId" ASC
        LIMIT 8
      `,
      [`%${trimmedKeyword}%`, trimmedKeyword, `${trimmedKeyword}%`],
    );
    entryIds = uniqueValues(result.rows.map((row) => row.entryId));
  } finally {
    await client.end();
  }

  const primaryEntries = await findEntriesByIds(entryIds);

  return rankCandidates(
    activeExamTarget,
    primaryEntries.map((entry) =>
      toRankableCandidate(entry, {
        meaningMatch: true,
        provenance: ["meaning_match"],
      }),
    ),
  );
}

function sortGroupsForEntry(
  activeExamTarget: ExamScopeCode,
  entryId: string,
  groups: Awaited<ReturnType<typeof findConfusionGroupsForEntryIds>>,
  policy: GroupSelectionPolicy = "default",
) {
  return groups
    .filter(
      (group) =>
        group.members.some((member) => member.entryId === entryId)
        && (
          policy === "ordinary_lookup"
            ? shouldUseGroupForOrdinaryLookup(group)
            : policy === "expression_recall"
              ? shouldUseGroupForExpressionRecall(group)
              : true
        ),
    )
    .sort((left, right) => {
      const leftTeachFirst = left.teachFirstEntryId === entryId ? 1 : 0;
      const rightTeachFirst = right.teachFirstEntryId === entryId ? 1 : 0;

      if (rightTeachFirst !== leftTeachFirst) {
        return rightTeachFirst - leftTeachFirst;
      }

      if (policy === "ordinary_lookup") {
        const leftIsRootFamily = left.labels.includes("root_family");
        const rightIsRootFamily = right.labels.includes("root_family");

        if (leftIsRootFamily !== rightIsRootFamily) {
          return leftIsRootFamily ? 1 : -1;
        }
      }

      const leftInScopeCount = left.members.filter((member) =>
        member.entry.scopes.some((scope) => scope.scopeCode === activeExamTarget),
      ).length;
      const rightInScopeCount = right.members.filter((member) =>
        member.entry.scopes.some((scope) => scope.scopeCode === activeExamTarget),
      ).length;

      if (rightInScopeCount !== leftInScopeCount) {
        return rightInScopeCount - leftInScopeCount;
      }

      const leftOrdinal =
        left.members.find((member) => member.entryId === entryId)?.ordinal ?? Number.MAX_SAFE_INTEGER;
      const rightOrdinal =
        right.members.find((member) => member.entryId === entryId)?.ordinal ?? Number.MAX_SAFE_INTEGER;

      if (leftOrdinal !== rightOrdinal) {
        return leftOrdinal - rightOrdinal;
      }

      return left.id.localeCompare(right.id);
    });
}

function characterBigrams(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.length < 2) {
    return [normalized];
  }

  return Array.from({ length: normalized.length - 1 }, (_, index) =>
    normalized.slice(index, index + 2),
  );
}

function diceCoefficient(left: string, right: string) {
  if (left === right) {
    return 1;
  }

  const leftBigrams = characterBigrams(left);
  const rightBigrams = characterBigrams(right);
  const rightCounts = new Map<string, number>();

  for (const bigram of rightBigrams) {
    rightCounts.set(bigram, (rightCounts.get(bigram) ?? 0) + 1);
  }

  const matches = leftBigrams.reduce((total, bigram) => {
    const count = rightCounts.get(bigram) ?? 0;

    if (count === 0) {
      return total;
    }

    rightCounts.set(bigram, count - 1);
    return total + 1;
  }, 0);

  return (2 * matches) / (leftBigrams.length + rightBigrams.length);
}

function scoreLookalikeGroup(
  activeExamTarget: ExamScopeCode,
  seedEntryId: string,
  seedLemma: string,
  group: ConfusionGroupRecord,
) {
  const otherMembers = group.members.filter((member) => member.entryId !== seedEntryId);
  const bestLemmaSimilarity = Math.max(
    ...otherMembers.map((member) => diceCoefficient(seedLemma, member.entry.lemma)),
    0,
  );
  const inScopeCount = group.members.filter((member) =>
    member.entry.scopes.some((scope) => scope.scopeCode === activeExamTarget),
  ).length;

  return {
    bestLemmaSimilarity,
    inScopeCount,
    memberCount: group.members.length,
  };
}

function pickBestLookalikeGroup(
  activeExamTarget: ExamScopeCode,
  seedEntryId: string,
  seedLemma: string,
  groups: Awaited<ReturnType<typeof findConfusionGroupsForEntryIds>>,
) {
  return groups
    .filter((group) => group.members.some((member) => member.entryId === seedEntryId))
    .sort((left, right) => {
      const leftScore = scoreLookalikeGroup(
        activeExamTarget,
        seedEntryId,
        seedLemma,
        left,
      );
      const rightScore = scoreLookalikeGroup(
        activeExamTarget,
        seedEntryId,
        seedLemma,
        right,
      );

      if (rightScore.bestLemmaSimilarity !== leftScore.bestLemmaSimilarity) {
        return rightScore.bestLemmaSimilarity - leftScore.bestLemmaSimilarity;
      }

      if (rightScore.inScopeCount !== leftScore.inScopeCount) {
        return rightScore.inScopeCount - leftScore.inScopeCount;
      }

      if (leftScore.memberCount !== rightScore.memberCount) {
        return leftScore.memberCount - rightScore.memberCount;
      }

      return left.id.localeCompare(right.id);
    })[0] ?? null;
}

function pickBestGroupForEntry(
  activeExamTarget: ExamScopeCode,
  entryId: string,
  groups: Awaited<ReturnType<typeof findConfusionGroupsForEntryIds>>,
  policy: GroupSelectionPolicy = "default",
) {
  return sortGroupsForEntry(activeExamTarget, entryId, groups, policy)[0] ?? null;
}

function pickBestExpressionRecallGroup(
  activeExamTarget: ExamScopeCode,
  rankedCandidates: RankedCandidate[],
  groups: Awaited<ReturnType<typeof findConfusionGroupsForEntryIds>>,
) {
  const candidateIndexById = new Map(
    rankedCandidates.map((candidate, index) => [candidate.entryId, index]),
  );

  return groups
    .filter(shouldUseGroupForExpressionRecall)
    .map((group) => ({
      group,
      matchedMembers: group.members.filter((member) =>
        candidateIndexById.has(member.entryId),
      ),
    }))
    .filter(({ matchedMembers }) => matchedMembers.length >= 2)
    .sort((left, right) => {
      const leftHasExpressionPurpose = left.group.purposes.includes("expression_recall");
      const rightHasExpressionPurpose = right.group.purposes.includes("expression_recall");

      if (leftHasExpressionPurpose !== rightHasExpressionPurpose) {
        return leftHasExpressionPurpose ? -1 : 1;
      }

      if (right.matchedMembers.length !== left.matchedMembers.length) {
        return right.matchedMembers.length - left.matchedMembers.length;
      }

      const leftTeachFirstRank =
        candidateIndexById.get(left.group.teachFirstEntryId) ?? Number.MAX_SAFE_INTEGER;
      const rightTeachFirstRank =
        candidateIndexById.get(right.group.teachFirstEntryId) ?? Number.MAX_SAFE_INTEGER;

      if (leftTeachFirstRank !== rightTeachFirstRank) {
        return leftTeachFirstRank - rightTeachFirstRank;
      }

      const leftInScopeCount = left.group.members.filter((member) =>
        member.entry.scopes.some((scope) => scope.scopeCode === activeExamTarget),
      ).length;
      const rightInScopeCount = right.group.members.filter((member) =>
        member.entry.scopes.some((scope) => scope.scopeCode === activeExamTarget),
      ).length;

      if (rightInScopeCount !== leftInScopeCount) {
        return rightInScopeCount - leftInScopeCount;
      }

      const leftBestCandidateRank = Math.min(
        ...left.matchedMembers.map((member) =>
          candidateIndexById.get(member.entryId) ?? Number.MAX_SAFE_INTEGER
        ),
      );
      const rightBestCandidateRank = Math.min(
        ...right.matchedMembers.map((member) =>
          candidateIndexById.get(member.entryId) ?? Number.MAX_SAFE_INTEGER
        ),
      );

      if (leftBestCandidateRank !== rightBestCandidateRank) {
        return leftBestCandidateRank - rightBestCandidateRank;
      }

      return left.group.id.localeCompare(right.group.id);
    })[0]?.group ?? null;
}

function pickExpressionRecallMainCandidate(
  group: ConfusionGroupRecord,
  rankedCandidates: RankedCandidate[],
) {
  const candidateById = new Map(
    rankedCandidates.map((candidate) => [candidate.entryId, candidate]),
  );

  return (
    candidateById.get(group.teachFirstEntryId)
    ?? group.members
      .map((member) => candidateById.get(member.entryId))
      .find((candidate): candidate is RankedCandidate => Boolean(candidate))
    ?? null
  );
}

function pickSharedGroup(
  activeExamTarget: ExamScopeCode,
  entryIds: string[],
  groups: Awaited<ReturnType<typeof findConfusionGroupsForEntryIds>>,
) {
  return groups
    .filter((group) =>
      entryIds.every((entryId) => group.members.some((member) => member.entryId === entryId)),
    )
    .sort((left, right) => {
      const leftExactMemberCount = left.members.length === entryIds.length ? 1 : 0;
      const rightExactMemberCount = right.members.length === entryIds.length ? 1 : 0;

      if (rightExactMemberCount !== leftExactMemberCount) {
        return rightExactMemberCount - leftExactMemberCount;
      }

      const leftTeachFirst = entryIds.includes(left.teachFirstEntryId) ? 1 : 0;
      const rightTeachFirst = entryIds.includes(right.teachFirstEntryId) ? 1 : 0;

      if (rightTeachFirst !== leftTeachFirst) {
        return rightTeachFirst - leftTeachFirst;
      }

      const leftInScopeCount = left.members.filter((member) =>
        member.entry.scopes.some((scope) => scope.scopeCode === activeExamTarget),
      ).length;
      const rightInScopeCount = right.members.filter((member) =>
        member.entry.scopes.some((scope) => scope.scopeCode === activeExamTarget),
      ).length;

      if (rightInScopeCount !== leftInScopeCount) {
        return rightInScopeCount - leftInScopeCount;
      }

      const leftOrdinalSum = entryIds.reduce(
        (total, entryId) =>
          total + (left.members.find((member) => member.entryId === entryId)?.ordinal ?? 100),
        0,
      );
      const rightOrdinalSum = entryIds.reduce(
        (total, entryId) =>
          total + (right.members.find((member) => member.entryId === entryId)?.ordinal ?? 100),
        0,
      );

      if (leftOrdinalSum !== rightOrdinalSum) {
        return leftOrdinalSum - rightOrdinalSum;
      }

      return left.id.localeCompare(right.id);
    })[0] ?? null;
}

function buildBoundaryCandidates(
  activeExamTarget: ExamScopeCode,
  group: ConfusionGroupRecord,
  rankedCandidates: RankedCandidate[],
  excludedEntryIds: Set<string>,
) {
  const rankedById = new Map(
    rankedCandidates.map((candidate) => [candidate.entryId, toRetrievalCandidate(candidate)]),
  );

  return uniqueRetrievalCandidates(
    group.members
      .filter((member) => !excludedEntryIds.has(member.entryId))
      .map((member) =>
        rankedById.get(member.entryId)
        ?? createConfusionGroupCandidate(activeExamTarget, member.entry),
      ),
  );
}

function buildOrderedGroupMembers(
  activeExamTarget: ExamScopeCode,
  group: ConfusionGroupRecord,
  rankedCandidates: RankedCandidate[],
) {
  const rankedById = new Map(
    rankedCandidates.map((candidate) => [candidate.entryId, toRetrievalCandidate(candidate)]),
  );

  return group.members.map((member) =>
    rankedById.get(member.entryId)
    ?? createConfusionGroupCandidate(activeExamTarget, member.entry),
  );
}

function flattenCandidateLists(candidateLists: RankedCandidate[][]) {
  return uniqueRankedCandidates(candidateLists.flat());
}

async function handleMeaningLookup(
  input: RetrieveCandidatesInput,
  normalizedQuery: ReturnType<typeof normalizeQuery>,
) {
  const meaningKeyword = normalizedQuery.meaningHint || normalizedQuery.normalizedText;
  const rankedCandidates = await findMeaningRankedCandidates(
    input.activeExamTarget,
    meaningKeyword,
  );

  if (rankedCandidates.length === 0) {
    return createNoMatchResult(normalizedQuery, rankedCandidates, "out_of_kb");
  }

  const confusionGroups = await findConfusionGroupsForEntryIds(
    rankedCandidates.map((candidate) => candidate.entryId),
  );
  const expressionGroup = pickBestExpressionRecallGroup(
    input.activeExamTarget,
    rankedCandidates,
    confusionGroups,
  );
  const selectedMainCandidate =
    expressionGroup
      ? pickExpressionRecallMainCandidate(expressionGroup, rankedCandidates)
      : rankedCandidates[0];

  if (!selectedMainCandidate) {
    return createNoMatchResult(normalizedQuery, rankedCandidates, "out_of_kb");
  }

  const bestGroup = expressionGroup ?? pickBestGroupForEntry(
    input.activeExamTarget,
    selectedMainCandidate.entryId,
    confusionGroups,
    "expression_recall",
  );
  const mainAnswer = [toRetrievalCandidate(selectedMainCandidate)];
  const confusionBoundary = bestGroup
    ? buildBoundaryCandidates(
        input.activeExamTarget,
        bestGroup,
        rankedCandidates,
        new Set([selectedMainCandidate.entryId]),
      )
    : [];

  return createResolvedResult(
    normalizedQuery,
    rankedCandidates,
    mainAnswer,
    confusionBoundary,
    bestGroup ? buildComparisonView(input.activeExamTarget, bestGroup) : null,
  );
}

async function handleEnglishLookup(
  input: RetrieveCandidatesInput,
  normalizedQuery: ReturnType<typeof normalizeQuery>,
) {
  if (normalizedQuery.queryMode === "fuzzy_recall" && normalizedQuery.englishTerms.length !== 1) {
    return createNoMatchResult(normalizedQuery, [], "low_confidence");
  }

  const needle =
    normalizedQuery.queryMode === "direct_lookup"
      ? normalizedQuery.englishTerms.join(" ").trim() || normalizedQuery.normalizedText
      : normalizedQuery.englishTerms[0] ?? normalizedQuery.normalizedText;
  const rankedCandidates = await findEnglishRankedCandidates(input.activeExamTarget, needle);
  const selection = selectStableEnglishCandidate(
    rankedCandidates,
    normalizedQuery.queryMode === "direct_lookup"
      ? directLookupThreshold
      : fuzzyRecallThreshold,
  );

  if (!selection.candidate) {
    return createNoMatchResult(
      normalizedQuery,
      rankedCandidates,
      selection.noMatchReason,
    );
  }

  const confusionGroups = await findConfusionGroupsForEntryIds([selection.candidate.entryId]);
  const bestGroup = pickBestGroupForEntry(
    input.activeExamTarget,
    selection.candidate.entryId,
    confusionGroups,
    "ordinary_lookup",
  );
  const mainAnswer = [toRetrievalCandidate(selection.candidate)];
  const confusionBoundary = bestGroup
    ? buildBoundaryCandidates(
        input.activeExamTarget,
        bestGroup,
        rankedCandidates,
        new Set([selection.candidate.entryId]),
      )
    : [];

  return createResolvedResult(
    normalizedQuery,
    rankedCandidates,
    mainAnswer,
    confusionBoundary,
    null,
  );
}

async function resolveEnglishTerm(
  activeExamTarget: ExamScopeCode,
  term: string,
): Promise<TermResolution> {
  const rankedCandidates = await findEnglishRankedCandidates(activeExamTarget, term);
  const selection = selectStableEnglishCandidate(rankedCandidates, fuzzyRecallThreshold);

  return {
    term,
    ...selection,
    candidates: rankedCandidates,
  };
}

async function handleGroupCompare(
  input: RetrieveCandidatesInput,
  normalizedQuery: ReturnType<typeof normalizeQuery>,
) {
  if (!normalizedQuery.groupSeedTerm) {
    return createNoMatchResult(normalizedQuery, [], "low_confidence");
  }

  const seedResolution = await resolveEnglishTerm(
    input.activeExamTarget,
    normalizedQuery.groupSeedTerm,
  );

  if (!seedResolution.candidate) {
    return createNoMatchResult(
      normalizedQuery,
      seedResolution.candidates,
      seedResolution.noMatchReason,
    );
  }

  const confusionGroups = await findConfusionGroupsForEntryIds([seedResolution.candidate.entryId]);
  const bestGroup = pickBestGroupForEntry(
    input.activeExamTarget,
    seedResolution.candidate.entryId,
    confusionGroups,
  );

  if (!bestGroup) {
    return createNoMatchResult(normalizedQuery, seedResolution.candidates, "low_confidence");
  }

  return createResolvedResult(
    normalizedQuery,
    seedResolution.candidates,
    buildOrderedGroupMembers(input.activeExamTarget, bestGroup, seedResolution.candidates),
    [],
    buildComparisonView(input.activeExamTarget, bestGroup),
  );
}

async function handleShapeNeighborSearch(
  input: RetrieveCandidatesInput,
  normalizedQuery: ReturnType<typeof normalizeQuery>,
) {
  if (normalizedQuery.englishTerms.length !== 1) {
    return createNoMatchResult(normalizedQuery, [], "low_confidence");
  }

  const seedResolution = await resolveEnglishTerm(
    input.activeExamTarget,
    normalizedQuery.englishTerms[0],
  );

  if (!seedResolution.candidate) {
    return createNoMatchResult(
      normalizedQuery,
      seedResolution.candidates,
      seedResolution.noMatchReason,
    );
  }

  const confusionGroups = await findConfusionGroupsForEntryIds([seedResolution.candidate.entryId]);
  const bestGroup = pickBestLookalikeGroup(
    input.activeExamTarget,
    seedResolution.candidate.entryId,
    seedResolution.candidate.lemma,
    confusionGroups,
  );

  if (!bestGroup) {
    const dynamicLookalikes = await findDynamicLookalikeRankedCandidates(
      input.activeExamTarget,
      normalizedQuery.englishTerms[0],
    );
    const inScopeLookalikes = dynamicLookalikes.filter(
      (candidate) => candidate.inScope && candidate.meaningsZh.length > 0,
    );

    if (inScopeLookalikes.length < 2) {
      return createNoMatchResult(
        normalizedQuery,
        uniqueRankedCandidates([...seedResolution.candidates, ...dynamicLookalikes]),
        "low_confidence",
      );
    }

    return createResolvedResult(
      normalizedQuery,
      inScopeLookalikes,
      inScopeLookalikes.slice(0, 6).map(toRetrievalCandidate),
      [],
      null,
    );
  }

  return createResolvedResult(
    normalizedQuery,
    seedResolution.candidates,
    buildOrderedGroupMembers(input.activeExamTarget, bestGroup, seedResolution.candidates),
    [],
    buildComparisonView(input.activeExamTarget, bestGroup),
  );
}

async function handleRootFamilySummary(
  input: RetrieveCandidatesInput,
  normalizedQuery: ReturnType<typeof normalizeQuery>,
) {
  const prototype = findRootFamilyPrototype(normalizedQuery.normalizedText);

  if (!prototype) {
    return createNoMatchResult(normalizedQuery, [], "low_confidence", null);
  }

  const entries = await findEntriesByLemmas(prototype.members.map((member) => member.lemma));
  const rootFamilyView = hydrateRootFamilyView(input.activeExamTarget, prototype, entries);
  const comparisonGroup = await findConfusionGroupById(prototype.id);
  const rankedCandidates = entries.map((entry) =>
    createRootFamilyRankedCandidate(input.activeExamTarget, entry),
  );

  return createResolvedResult(
    normalizedQuery,
    rankedCandidates,
    rankedCandidates.map(toRetrievalCandidate),
    [],
    comparisonGroup ? buildComparisonView(input.activeExamTarget, comparisonGroup) : null,
    rootFamilyView,
  );
}

async function handleDirectCompare(
  input: RetrieveCandidatesInput,
  normalizedQuery: ReturnType<typeof normalizeQuery>,
) {
  if (normalizedQuery.groupSeedTerm && normalizedQuery.compareTerms.length < 2) {
    return handleGroupCompare(input, normalizedQuery);
  }

  const compareTerms = normalizedQuery.compareTerms.slice(0, 4);

  if (compareTerms.length < 2) {
    return createNoMatchResult(normalizedQuery, [], "low_confidence");
  }

  const termResolutions = await Promise.all(
    compareTerms.map((term) => resolveEnglishTerm(input.activeExamTarget, term)),
  );
  const rankedCandidates = flattenCandidateLists(
    termResolutions.map((resolution) => resolution.candidates),
  );
  const seenResolvedEntryIds = new Set<string>();
  const resolvedTerms = termResolutions
    .filter(
      (
        resolution,
      ): resolution is TermResolution & {
        candidate: RankedCandidate;
        matchType: "exact" | "fuzzy";
      } => Boolean(resolution.candidate && resolution.matchType),
    )
    .filter((resolution) => {
      if (seenResolvedEntryIds.has(resolution.candidate.entryId)) {
        return false;
      }

      seenResolvedEntryIds.add(resolution.candidate.entryId);
      return true;
    });

  if (resolvedTerms.length < 2) {
    const noMatchReason = termResolutions.every(
      (resolution) => resolution.noMatchReason === "out_of_kb",
    )
      ? "out_of_kb"
      : "low_confidence";

    return createNoMatchResult(normalizedQuery, rankedCandidates, noMatchReason);
  }

  const resolvedEntryIds = resolvedTerms.map((resolution) => resolution.candidate.entryId);
  const confusionGroups = await findConfusionGroupsForEntryIds(resolvedEntryIds);
  const sharedGroup = pickSharedGroup(
    input.activeExamTarget,
    resolvedEntryIds,
    confusionGroups,
  );

  if (sharedGroup) {
    const mainAnswer = resolvedTerms.map((resolution) =>
      toRetrievalCandidate(resolution.candidate),
    );
    const confusionBoundary = buildBoundaryCandidates(
      input.activeExamTarget,
      sharedGroup,
      rankedCandidates,
      new Set(mainAnswer.map((candidate) => candidate.entryId)),
    );

    return createResolvedResult(
      normalizedQuery,
      rankedCandidates,
      mainAnswer,
      confusionBoundary,
      buildComparisonView(input.activeExamTarget, sharedGroup),
    );
  }

  if (resolvedTerms.every((resolution) => resolution.matchType === "exact")) {
    return createResolvedResult(
      normalizedQuery,
      rankedCandidates,
      resolvedTerms.map((resolution) => toRetrievalCandidate(resolution.candidate)),
      [],
      null,
    );
  }

  return createNoMatchResult(normalizedQuery, rankedCandidates, "low_confidence");
}

export async function retrieveCandidates(input: RetrieveCandidatesInput) {
  const normalizedQuery = normalizeQuery(input.query);

  if (normalizedQuery.queryMode === "direct_compare") {
    return handleDirectCompare(input, normalizedQuery);
  }

  if (normalizedQuery.queryMode === "shape_neighbor_search") {
    return handleShapeNeighborSearch(input, normalizedQuery);
  }

  if (normalizedQuery.queryMode === "root_family_summary") {
    return handleRootFamilySummary(input, normalizedQuery);
  }

  if (normalizedQuery.queryMode === "meaning_lookup") {
    return handleMeaningLookup(input, normalizedQuery);
  }

  return handleEnglishLookup(input, normalizedQuery);
}
