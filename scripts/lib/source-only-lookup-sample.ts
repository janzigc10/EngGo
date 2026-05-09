import type { ExamScopeCode } from "../../src/features/content/import-types";
import type { SourceLemmaMembership } from "../../src/features/content/source-lemma-sources";
import {
  STANDARD_LOOKUP_FORBIDDEN_ANSWER_TEXT,
  type ProviderSmokeCase,
} from "./answer-style-provider-smoke";

type SourceOnlySampleScope = Exclude<ExamScopeCode, "postgrad">;

export type SourceOnlyLookupSampleOptions = {
  datasetName: string;
  limit: number;
  offset: number;
  scopes: SourceOnlySampleScope[];
};

export type BuildSourceOnlyLookupSamplePlanOptions = {
  memberships: SourceLemmaMembership[];
  structuredLemmas: string[];
  scopes: SourceOnlySampleScope[];
  limit: number;
  offset: number;
};

export type SourceOnlyLookupSamplePlan = {
  totalCandidates: number;
  returnedCandidates: number;
  cases: ProviderSmokeCase[];
};

type SourceOnlyCandidate = {
  lemma: string;
  scopeCode: SourceOnlySampleScope;
};

const DEFAULT_SAMPLE_OPTIONS: SourceOnlyLookupSampleOptions = {
  datasetName: "real-smoke",
  limit: 20,
  offset: 0,
  scopes: ["gaokao", "cet4", "cet6"],
};

const SAMPLE_SCOPES: SourceOnlySampleScope[] = ["gaokao", "cet4", "cet6"];
const SCOPE_PRIORITY = new Map<SourceOnlySampleScope, number>(
  SAMPLE_SCOPES.map((scope, index) => [scope, index]),
);

function normalizeLemma(lemma: string) {
  return lemma.trim().toLowerCase();
}

function isLookupFriendlyLemma(lemma: string) {
  return /^[a-z][a-z-]{2,}$/.test(lemma);
}

function parsePositiveIntegerOption(value: string | undefined, flagName: string) {
  const parsed = Number(value);

  if (!value || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer after ${flagName}.`);
  }

  return parsed;
}

function parseNonNegativeIntegerOption(value: string | undefined, flagName: string) {
  const parsed = Number(value);

  if (!value || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer after ${flagName}.`);
  }

  return parsed;
}

function parseScopes(rawValue: string | undefined) {
  if (!rawValue) {
    throw new Error("Expected comma-separated scopes after --scopes.");
  }

  const scopes = rawValue
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (scopes.length === 0) {
    throw new Error("Expected comma-separated scopes after --scopes.");
  }

  for (const scope of scopes) {
    if (!SAMPLE_SCOPES.includes(scope as SourceOnlySampleScope)) {
      throw new Error(`Unsupported source-only sample scope: ${scope}.`);
    }
  }

  return [...new Set(scopes)] as SourceOnlySampleScope[];
}

function compareSourceOnlyCandidates(
  left: SourceOnlyCandidate,
  right: SourceOnlyCandidate,
) {
  return (
    left.lemma.localeCompare(right.lemma)
    || (SCOPE_PRIORITY.get(left.scopeCode) ?? 99)
      - (SCOPE_PRIORITY.get(right.scopeCode) ?? 99)
  );
}

function chooseBestMembership(
  memberships: SourceLemmaMembership[],
  scopes: SourceOnlySampleScope[],
) {
  return memberships
    .filter((membership) =>
      scopes.includes(membership.scopeCode as SourceOnlySampleScope)
    )
    .sort(
      (left, right) =>
        (SCOPE_PRIORITY.get(left.scopeCode as SourceOnlySampleScope) ?? 99)
        - (SCOPE_PRIORITY.get(right.scopeCode as SourceOnlySampleScope) ?? 99),
    )[0];
}

function toProviderSmokeCase(candidate: SourceOnlyCandidate): ProviderSmokeCase {
  return {
    name: `source-only: ${candidate.lemma} [${candidate.scopeCode}]`,
    query: candidate.lemma,
    activeExamTarget: candidate.scopeCode,
    expectedQueryMode: "direct_lookup",
    expectedResolution: "resolved",
    expectedAnswerStyle: "standard_lookup",
    expectedGroundingIncludes: [candidate.lemma],
    expectedAnswerIncludes: ["核心义"],
    forbiddenAnswerIncludes: STANDARD_LOOKUP_FORBIDDEN_ANSWER_TEXT,
    expectedComparisonViewId: null,
    expectedRootFamilyViewId: null,
    maxAnswerChars: 220,
    manualChecks: [
      "检查 source-only 回答是否像短查词，而不是百科讲义",
      "检查回答是否没有例句、范围尾巴、Markdown 或易混词话术",
      "检查词性是否使用 n./v./adj./adv. 等缩写，而不是中文词性名",
    ],
  };
}

export function buildSourceOnlyLookupSamplePlan({
  memberships,
  structuredLemmas,
  scopes,
  limit,
  offset,
}: BuildSourceOnlyLookupSamplePlanOptions): SourceOnlyLookupSamplePlan {
  const structuredLemmaSet = new Set(structuredLemmas.map(normalizeLemma));
  const membershipsByLemma = new Map<string, SourceLemmaMembership[]>();

  for (const membership of memberships) {
    const lemma = normalizeLemma(membership.lemma);

    if (!isLookupFriendlyLemma(lemma) || structuredLemmaSet.has(lemma)) {
      continue;
    }

    const current = membershipsByLemma.get(lemma) ?? [];

    current.push(membership);
    membershipsByLemma.set(lemma, current);
  }

  const candidates = [...membershipsByLemma.entries()]
    .map(([lemma, lemmaMemberships]) => {
      const bestMembership = chooseBestMembership(lemmaMemberships, scopes);

      return bestMembership
        ? { lemma, scopeCode: bestMembership.scopeCode as SourceOnlySampleScope }
        : null;
    })
    .filter((candidate): candidate is SourceOnlyCandidate => Boolean(candidate))
    .sort(compareSourceOnlyCandidates);

  const selectedCandidates = candidates.slice(offset, offset + limit);

  return {
    totalCandidates: candidates.length,
    returnedCandidates: selectedCandidates.length,
    cases: selectedCandidates.map(toProviderSmokeCase),
  };
}

export function parseSourceOnlyLookupSampleArgs(
  argv: string[],
): SourceOnlyLookupSampleOptions {
  const options: SourceOnlyLookupSampleOptions = {
    ...DEFAULT_SAMPLE_OPTIONS,
    scopes: [...DEFAULT_SAMPLE_OPTIONS.scopes],
  };
  const args = argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--dataset") {
      const value = args[index + 1];

      if (!value || value.startsWith("--")) {
        throw new Error("Expected a dataset name after --dataset.");
      }

      options.datasetName = value;
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      options.limit = parsePositiveIntegerOption(args[index + 1], "--limit");
      index += 1;
      continue;
    }

    if (arg === "--offset") {
      options.offset = parseNonNegativeIntegerOption(args[index + 1], "--offset");
      index += 1;
      continue;
    }

    if (arg === "--scopes") {
      options.scopes = parseScopes(args[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}.`);
  }

  return options;
}
