import type { ExamScopeCode } from "../../src/features/content/import-types";
import type { SourceLemmaMembership } from "../../src/features/content/source-lemma-sources";
import {
  STANDARD_LOOKUP_FORBIDDEN_ANSWER_TEXT,
  type ProviderSmokeCase,
} from "./answer-style-provider-smoke";
import type {
  RunnerCaseResult,
  RunnerSummary,
} from "../run-answer-style-provider-smoke";

type SourceOnlySampleScope = Exclude<ExamScopeCode, "postgrad">;
type SourceOnlySampleMode = "window" | "stratified";
type SourceOnlyResultAction =
  | "direct_usable"
  | "prompt_or_cleaning_issue"
  | "retrieval_or_source_issue"
  | "structured_entry_candidate";

export type SourceOnlyLookupSampleOptions = {
  datasetName: string;
  limit: number;
  offset: number;
  scopes: SourceOnlySampleScope[];
  sampleMode: SourceOnlySampleMode;
  seed: string;
  outputDir: string;
  reportName: string | null;
};

export type BuildSourceOnlyLookupSamplePlanOptions = {
  memberships: SourceLemmaMembership[];
  structuredLemmas: string[];
  scopes: SourceOnlySampleScope[];
  limit: number;
  offset: number;
  sampleMode?: SourceOnlySampleMode;
  seed?: string;
};

export type SourceOnlyLookupSamplePlan = {
  totalCandidates: number;
  returnedCandidates: number;
  cases: ProviderSmokeCase[];
};

export type BuildSourceOnlyLookupSampleReportOptions = {
  generatedAt: string;
  options: SourceOnlyLookupSampleOptions;
  plan: SourceOnlyLookupSamplePlan;
  results: RunnerCaseResult[];
  summary: RunnerSummary;
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
  sampleMode: "stratified",
  seed: "source-only-scale-v1",
  outputDir: "output/source-only-lookup-sample",
  reportName: null,
};

const SAMPLE_SCOPES: SourceOnlySampleScope[] = ["gaokao", "cet4", "cet6"];
const SCOPE_PRIORITY = new Map<SourceOnlySampleScope, number>(
  SAMPLE_SCOPES.map((scope, index) => [scope, index]),
);

function normalizeLemma(lemma: string) {
  return lemma.trim().toLowerCase();
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function isLookupFriendlyLemma(lemma: string) {
  return /^[a-z]{3,}$/.test(lemma);
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

function parseSampleMode(rawValue: string | undefined) {
  if (rawValue !== "window" && rawValue !== "stratified") {
    throw new Error("Expected --sample to be window or stratified.");
  }

  return rawValue;
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

function compareCandidatesBySeed(seed: string, scopeCode: SourceOnlySampleScope) {
  return (left: SourceOnlyCandidate, right: SourceOnlyCandidate) => {
    const leftScore = hashString(`${seed}:${scopeCode}:${left.lemma}`);
    const rightScore = hashString(`${seed}:${scopeCode}:${right.lemma}`);

    return leftScore - rightScore || compareSourceOnlyCandidates(left, right);
  };
}

function applyStratifiedOrdering(
  candidates: SourceOnlyCandidate[],
  scopes: SourceOnlySampleScope[],
  seed: string,
) {
  const groups = scopes.map((scopeCode) =>
    candidates
      .filter((candidate) => candidate.scopeCode === scopeCode)
      .sort(compareCandidatesBySeed(seed, scopeCode))
  );
  const ordered: SourceOnlyCandidate[] = [];
  const maxGroupSize = groups.reduce(
    (max, group) => Math.max(max, group.length),
    0,
  );

  for (let groupIndex = 0; groupIndex < maxGroupSize; groupIndex += 1) {
    for (const group of groups) {
      const candidate = group[groupIndex];

      if (candidate) {
        ordered.push(candidate);
      }
    }
  }

  return ordered;
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
  sampleMode = "window",
  seed = DEFAULT_SAMPLE_OPTIONS.seed,
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
  const orderedCandidates = sampleMode === "stratified"
    ? applyStratifiedOrdering(candidates, scopes, seed)
    : candidates;

  const selectedCandidates = orderedCandidates.slice(offset, offset + limit);

  return {
    totalCandidates: candidates.length,
    returnedCandidates: selectedCandidates.length,
    cases: selectedCandidates.map(toProviderSmokeCase),
  };
}

export function classifySourceOnlyLookupResult(
  result: RunnerCaseResult,
): SourceOnlyResultAction {
  if (result.autoVerdict === "pass") {
    return "direct_usable";
  }

  if (result.autoVerdict === "manual" || result.manualFlags.length > 0) {
    return "structured_entry_candidate";
  }

  if (
    result.hardFailures.some((failure) =>
      failure.includes("resolution expected")
      || failure.includes("queryMode expected")
      || failure.includes("grounding missing")
      || failure.includes("status expected")
    )
  ) {
    return "retrieval_or_source_issue";
  }

  if (
    result.hardFailures.some((failure) =>
      failure.includes("answer should not include")
      || failure.includes("answer missing")
      || failure.includes("resolved case should return")
    )
  ) {
    return "prompt_or_cleaning_issue";
  }

  return "structured_entry_candidate";
}

function createActionCounts(results: RunnerCaseResult[]) {
  const actionCounts: Record<SourceOnlyResultAction, number> = {
    direct_usable: 0,
    prompt_or_cleaning_issue: 0,
    retrieval_or_source_issue: 0,
    structured_entry_candidate: 0,
  };

  for (const result of results) {
    actionCounts[classifySourceOnlyLookupResult(result)] += 1;
  }

  return actionCounts;
}

function formatReportIssue(result: RunnerCaseResult) {
  return [
    ...result.hardFailures,
    ...result.manualFlags,
    result.errorMessage,
  ]
    .filter((item): item is string => Boolean(item))
    .join("; ");
}

export function buildSourceOnlyLookupSampleReport({
  generatedAt,
  options,
  plan,
  results,
  summary,
}: BuildSourceOnlyLookupSampleReportOptions) {
  const actionCounts = createActionCounts(results);
  const annotatedResults = results.map((result) => ({
    name: result.name,
    action: classifySourceOnlyLookupResult(result),
    verdict: result.autoVerdict,
    elapsedMs: result.elapsedMs,
    answerChars: result.answerChars,
    grounding: result.groundingSummary,
    answerPreview: result.answerPreview,
    issues: formatReportIssue(result),
  }));
  const structuredEntryCandidates = annotatedResults.filter(
    (result) => result.action === "structured_entry_candidate",
  );
  const json = {
    generatedAt,
    options,
    totalCandidates: plan.totalCandidates,
    returnedCandidates: plan.returnedCandidates,
    summary,
    actionCounts,
    results: annotatedResults,
    structuredEntryCandidates,
  };
  const nonDirectResults = annotatedResults.filter(
    (result) => result.action !== "direct_usable",
  );
  const markdown = [
    "# Source-Only Lookup Sample Report",
    "",
    `Generated: ${generatedAt}`,
    `Dataset: ${options.datasetName}`,
    `Sample: ${options.sampleMode}, seed=${options.seed}, limit=${options.limit}, offset=${options.offset}`,
    `Scopes: ${options.scopes.join(", ")}`,
    `Candidate pool: ${plan.totalCandidates}; returned: ${plan.returnedCandidates}`,
    "",
    "## Summary",
    "",
    `- pass: ${summary.pass}/${summary.total}`,
    `- manual: ${summary.manual}`,
    `- fail: ${summary.fail}`,
    `- avgElapsedMs: ${summary.avgElapsedMs}`,
    "",
    "## Action Counts",
    "",
    ...Object.entries(actionCounts).map(([action, count]) => `- ${action}: ${count}`),
    "",
    "## Non-Direct Results",
    "",
    ...(nonDirectResults.length === 0
      ? ["- none"]
      : nonDirectResults.map(
          (result) =>
            `- ${result.name}: ${result.action}; issues=${result.issues || "-"}`,
        )),
    "",
    "## Structured Entry Candidates",
    "",
    ...(structuredEntryCandidates.length === 0
      ? ["- none"]
      : structuredEntryCandidates.map((result) => `- ${result.name}`)),
    "",
  ].join("\n");

  return {
    json,
    markdown,
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

    if (arg === "--sample") {
      options.sampleMode = parseSampleMode(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--seed") {
      const value = args[index + 1];

      if (!value || value.startsWith("--")) {
        throw new Error("Expected a seed after --seed.");
      }

      options.seed = value;
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      const value = args[index + 1];

      if (!value || value.startsWith("--")) {
        throw new Error("Expected an output directory after --output-dir.");
      }

      options.outputDir = value;
      index += 1;
      continue;
    }

    if (arg === "--report-name") {
      const value = args[index + 1];

      if (!value || value.startsWith("--")) {
        throw new Error("Expected a report name after --report-name.");
      }

      options.reportName = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}.`);
  }

  return options;
}
