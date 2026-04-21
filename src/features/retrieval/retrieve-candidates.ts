import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { ExamScopeCode } from "@/features/content/import-types";
import { normalizeQuery } from "@/features/retrieval/normalize-query";
import { rankCandidates } from "@/features/retrieval/rank-candidates";
import { findEnglishCandidateRows } from "@/features/retrieval/retrieval-sql";
import type {
  ComparisonView,
  RankableCandidate,
  RetrievalResult,
} from "@/features/retrieval/types";

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

type RetrieveCandidatesInput = {
  activeExamTarget: ExamScopeCode;
  query: string;
};

function toRankableCandidate(
  activeExamTarget: ExamScopeCode,
  entry: RetrievalEntryRecord,
  overrides?: Partial<RankableCandidate>,
) {
  const scopeCodes = entry.scopes.map((scope) => scope.scopeCode as ExamScopeCode);

  return {
    entryId: entry.id,
    lemma: entry.lemma,
    meaningsZh: entry.meanings.map((meaning) => meaning.zh),
    matchedAlias: null,
    scopeCodes,
    exactLemma: false,
    exactAlias: false,
    textScore: 0,
    meaningMatch: false,
    fromConfusionGroup: false,
    ...overrides,
  } satisfies RankableCandidate;
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
    include: {
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
    },
  });
}

function buildComparisonView(
  activeExamTarget: ExamScopeCode,
  group: Awaited<ReturnType<typeof findConfusionGroupsForEntryIds>>[number],
): ComparisonView {
  return {
    id: group.id,
    whyConfusing: group.whyConfusing,
    commonMisusePoints: group.commonMisusePoints,
    semanticBoundaryNotes: group.semanticBoundaryNotes,
    members: group.members.map((member) => ({
      entryId: member.entry.id,
      lemma: member.entry.lemma,
      meaningsZh: member.entry.meanings.map((meaning) => meaning.zh),
      emphasisNote: member.emphasisNote ?? null,
      inScope: member.entry.scopes.some((scope) => scope.scopeCode === activeExamTarget),
    })),
  };
}

async function handleMeaningLookup(input: RetrieveCandidatesInput) {
  const normalizedQuery = normalizeQuery(input.query);
  const meaningKeyword = normalizedQuery.meaningHint || normalizedQuery.normalizedText;

  const primaryEntries = await db.vocabularyEntry.findMany({
    where: {
      meanings: {
        some: {
          zh: {
            contains: meaningKeyword,
          },
        },
      },
    },
    include: retrievalEntryInclude,
    take: 8,
  });

  const confusionGroups = await findConfusionGroupsForEntryIds(
    primaryEntries.map((entry) => entry.id),
  );
  const groupEntries = confusionGroups.flatMap((group) =>
    group.members.map((member) => member.entry),
  );

  const candidateMap = new Map<string, RankableCandidate>();

  for (const entry of primaryEntries) {
    candidateMap.set(
      entry.id,
      toRankableCandidate(input.activeExamTarget, entry, {
        meaningMatch: true,
        textScore: 1,
      }),
    );
  }

  for (const entry of groupEntries) {
    if (!candidateMap.has(entry.id)) {
      candidateMap.set(
        entry.id,
        toRankableCandidate(input.activeExamTarget, entry, {
          fromConfusionGroup: true,
        }),
      );
    }
  }

  return {
    queryMode: normalizedQuery.queryMode,
    normalizedQuery,
    candidates: rankCandidates(input.activeExamTarget, [...candidateMap.values()]),
    comparisonView: null,
  } satisfies RetrievalResult;
}

async function handleEnglishLookup(input: RetrieveCandidatesInput) {
  const normalizedQuery = normalizeQuery(input.query);
  const needle =
    normalizedQuery.englishTerms.join(" ").trim() || normalizedQuery.normalizedText;

  const rawRows = await findEnglishCandidateRows(input.activeExamTarget, needle);
  const primaryEntries = await findEntriesByIds(rawRows.map((row) => row.entryId));
  const confusionGroups = await findConfusionGroupsForEntryIds(
    primaryEntries.map((entry) => entry.id),
  );

  const rawRowMap = new Map(rawRows.map((row) => [row.entryId, row]));
  const candidateMap = new Map<string, RankableCandidate>();

  for (const entry of primaryEntries) {
    const row = rawRowMap.get(entry.id);
    const textScore = Math.max(
      row?.lemmaSimilarity ?? 0,
      row?.lemmaWordSimilarity ?? 0,
      row?.aliasSimilarity ?? 0,
      row?.aliasWordSimilarity ?? 0,
    );

    candidateMap.set(
      entry.id,
      toRankableCandidate(input.activeExamTarget, entry, {
        matchedAlias: row?.matchedAlias ?? null,
        exactLemma: row?.exactLemma ?? false,
        exactAlias: row?.exactAlias ?? false,
        textScore,
      }),
    );
  }

  for (const group of confusionGroups) {
    for (const member of group.members) {
      if (!candidateMap.has(member.entry.id)) {
        candidateMap.set(
          member.entry.id,
          toRankableCandidate(input.activeExamTarget, member.entry, {
            fromConfusionGroup: true,
          }),
        );
      } else {
        const existingCandidate = candidateMap.get(member.entry.id);

        if (existingCandidate) {
          existingCandidate.fromConfusionGroup = true;
          candidateMap.set(member.entry.id, existingCandidate);
        }
      }
    }
  }

  return {
    queryMode: normalizedQuery.queryMode,
    normalizedQuery,
    candidates: rankCandidates(input.activeExamTarget, [...candidateMap.values()]),
    comparisonView: null,
  } satisfies RetrievalResult;
}

async function handleDirectCompare(input: RetrieveCandidatesInput) {
  const normalizedQuery = normalizeQuery(input.query);

  if (!normalizedQuery.compareTerms) {
    return handleEnglishLookup(input);
  }

  const [leftTerm, rightTerm] = normalizedQuery.compareTerms;
  const [leftEntry, rightEntry] = await Promise.all([
    db.vocabularyEntry.findFirst({
      where: {
        OR: [{ lemma: leftTerm }, { aliases: { some: { alias: leftTerm } } }],
      },
      include: retrievalEntryInclude,
    }),
    db.vocabularyEntry.findFirst({
      where: {
        OR: [{ lemma: rightTerm }, { aliases: { some: { alias: rightTerm } } }],
      },
      include: retrievalEntryInclude,
    }),
  ]);

  const matchingGroup =
    leftEntry && rightEntry
      ? await db.confusionGroup.findFirst({
          where: {
            AND: [
              { members: { some: { entryId: leftEntry.id } } },
              { members: { some: { entryId: rightEntry.id } } },
            ],
          },
          include: {
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
          },
        })
      : null;

  const comparisonEntries = matchingGroup
    ? matchingGroup.members.map((member) => member.entry)
    : [leftEntry, rightEntry].filter((entry): entry is RetrievalEntryRecord => Boolean(entry));

  const candidates = comparisonEntries.map((entry) =>
    toRankableCandidate(input.activeExamTarget, entry, {
      exactLemma: entry.lemma === leftTerm || entry.lemma === rightTerm,
      exactAlias: entry.aliases.some(
        (alias) => alias.alias === leftTerm || alias.alias === rightTerm,
      ),
      fromConfusionGroup: Boolean(matchingGroup),
      textScore: entry.lemma === leftTerm || entry.lemma === rightTerm ? 1 : 0.35,
    }),
  );

  return {
    queryMode: normalizedQuery.queryMode,
    normalizedQuery,
    candidates: rankCandidates(input.activeExamTarget, candidates),
    comparisonView: matchingGroup
      ? buildComparisonView(input.activeExamTarget, matchingGroup)
      : null,
  } satisfies RetrievalResult;
}

export async function retrieveCandidates(input: RetrieveCandidatesInput) {
  const normalizedQuery = normalizeQuery(input.query);

  if (normalizedQuery.queryMode === "direct_compare") {
    return handleDirectCompare(input);
  }

  if (normalizedQuery.queryMode === "meaning_lookup") {
    return handleMeaningLookup(input);
  }

  return handleEnglishLookup(input);
}
