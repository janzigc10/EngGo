import type { ExamScopeCode } from "@/features/content/import-types";
import type {
  AnswerStyle,
  QueryMode,
  RetrievalResolution,
} from "@/features/retrieval/types";

export type BlackBoxProductSmokeCategory =
  | "standard_lookup"
  | "fuzzy_typo"
  | "shape_neighbor"
  | "confusion"
  | "expression_recall"
  | "root_family"
  | "no_match";

export type BlackBoxProductSmokeCase = {
  name: string;
  category: BlackBoxProductSmokeCategory;
  source: "existing" | "batch3";
  query: string;
  activeExamTarget: ExamScopeCode;
  expectedQueryMode: QueryMode;
  expectedResolution: RetrievalResolution;
  expectedAnswerStyle: AnswerStyle;
  expectedGroundingIncludes?: string[];
  forbiddenGroundingIncludes?: string[];
  expectedComparisonViewId?: string | null;
  expectedRootFamilyViewId?: string | null;
};

export type BlackBoxProductSmokeObservation = {
  queryMode: QueryMode;
  resolution: RetrievalResolution;
  answerStyle: AnswerStyle;
  groundingLemmas: string[];
  comparisonViewId: string | null;
  rootFamilyViewId: string | null;
  providerCalled: boolean;
};

export type BlackBoxProductSmokeResult = {
  name: string;
  category: BlackBoxProductSmokeCategory;
  verdict: "pass" | "fail";
  failures: string[];
};

export type BlackBoxProductSmokeSummary = {
  total: number;
  pass: number;
  fail: number;
  byCategory: Partial<Record<
    BlackBoxProductSmokeCategory,
    {
      total: number;
      pass: number;
      fail: number;
    }
  >>;
};

function createCase(item: BlackBoxProductSmokeCase) {
  return item;
}

export function buildBlackBoxProductSmokeCases(): BlackBoxProductSmokeCase[] {
  return [
    createCase({
      name: "standard: gain",
      category: "standard_lookup",
      source: "batch3",
      query: "gain 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["gain"],
    }),
    createCase({
      name: "standard: generate",
      category: "standard_lookup",
      source: "batch3",
      query: "generate 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["generate"],
    }),
    createCase({
      name: "standard: genuine",
      category: "standard_lookup",
      source: "batch3",
      query: "genuine 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["genuine"],
    }),
    createCase({
      name: "standard: gravity",
      category: "standard_lookup",
      source: "batch3",
      query: "gravity 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["gravity"],
    }),
    createCase({
      name: "standard: horizon",
      category: "standard_lookup",
      source: "batch3",
      query: "horizon 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["horizon"],
    }),
    createCase({
      name: "standard: income",
      category: "standard_lookup",
      source: "batch3",
      query: "income 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["income"],
    }),
    createCase({
      name: "standard: justice",
      category: "standard_lookup",
      source: "batch3",
      query: "justice 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["justice"],
    }),
    createCase({
      name: "standard: garage",
      category: "standard_lookup",
      source: "batch3",
      query: "garage 是什么意思",
      activeExamTarget: "cet4",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["garage"],
    }),
    createCase({
      name: "standard: institute",
      category: "standard_lookup",
      source: "existing",
      query: "institute 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["institute"],
      forbiddenGroundingIncludes: [
        "institution",
        "constitute",
        "substitute",
        "restitute",
        "prostitute",
      ],
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
    }),
    createCase({
      name: "standard: institution",
      category: "standard_lookup",
      source: "existing",
      query: "institution 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["institution"],
      forbiddenGroundingIncludes: ["institute", "constitute", "substitute"],
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
    }),
    createCase({
      name: "standard: effect",
      category: "standard_lookup",
      source: "existing",
      query: "effect 是什么意思",
      activeExamTarget: "cet4",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["effect"],
      forbiddenGroundingIncludes: ["affect", "impact"],
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
    }),
    createCase({
      name: "standard: respect",
      category: "standard_lookup",
      source: "existing",
      query: "respect 是什么意思",
      activeExamTarget: "cet4",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["respect"],
      forbiddenGroundingIncludes: [
        "respective",
        "respectful",
        "respectable",
      ],
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
    }),
    createCase({
      name: "typo: generte",
      category: "fuzzy_typo",
      source: "existing",
      query: "generte 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["generate"],
    }),
    createCase({
      name: "typo: genuin",
      category: "fuzzy_typo",
      source: "existing",
      query: "genuin 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["genuine"],
    }),
    createCase({
      name: "typo: horizen",
      category: "fuzzy_typo",
      source: "existing",
      query: "horizen 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["horizon"],
    }),
    createCase({
      name: "typo: reqeust",
      category: "fuzzy_typo",
      source: "existing",
      query: "有个像 reqeust 的词",
      activeExamTarget: "cet4",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["request"],
    }),
    createCase({
      name: "typo: recomand",
      category: "fuzzy_typo",
      source: "existing",
      query: "有个像 recomand 的词",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["recommend"],
    }),
    createCase({
      name: "shape: recent lookalikes",
      category: "shape_neighbor",
      source: "existing",
      query: "跟 recent 很像的词有哪些",
      activeExamTarget: "cet6",
      expectedQueryMode: "shape_neighbor_search",
      expectedResolution: "resolved",
      expectedAnswerStyle: "confusion_untangle",
      expectedGroundingIncludes: ["recent", "resent"],
    }),
    createCase({
      name: "shape: statue scope",
      category: "shape_neighbor",
      source: "existing",
      query: "跟 statue 很像的词有哪些",
      activeExamTarget: "cet6",
      expectedQueryMode: "shape_neighbor_search",
      expectedResolution: "resolved",
      expectedAnswerStyle: "confusion_untangle",
      expectedGroundingIncludes: ["statue", "status", "statute"],
    }),
    createCase({
      name: "shape: breath lookalikes",
      category: "shape_neighbor",
      source: "existing",
      query: "跟 breath 很像的词有哪些",
      activeExamTarget: "cet4",
      expectedQueryMode: "shape_neighbor_search",
      expectedResolution: "resolved",
      expectedAnswerStyle: "confusion_untangle",
      expectedGroundingIncludes: ["breath", "breathe"],
    }),
    createCase({
      name: "confusion: access assess excess",
      category: "confusion",
      source: "existing",
      query: "access assess excess 怎么区分",
      activeExamTarget: "cet6",
      expectedQueryMode: "direct_compare",
      expectedResolution: "resolved",
      expectedAnswerStyle: "confusion_untangle",
      expectedComparisonViewId: "access-assess-excess",
      expectedGroundingIncludes: ["access", "assess", "excess"],
    }),
    createCase({
      name: "confusion: comply conform defer",
      category: "confusion",
      source: "existing",
      query: "comply conform defer 怎么区分",
      activeExamTarget: "cet6",
      expectedQueryMode: "direct_compare",
      expectedResolution: "resolved",
      expectedAnswerStyle: "confusion_untangle",
      expectedComparisonViewId: "comply-conform-defer",
      expectedGroundingIncludes: ["comply", "conform", "defer"],
    }),
    createCase({
      name: "confusion: stationery choice",
      category: "confusion",
      source: "existing",
      query: "stationary 和 stationery 哪个是文具",
      activeExamTarget: "cet4",
      expectedQueryMode: "direct_compare",
      expectedResolution: "resolved",
      expectedAnswerStyle: "confusion_untangle",
      expectedGroundingIncludes: ["stationary", "stationery"],
    }),
    createCase({
      name: "confusion: stitute family compare",
      category: "confusion",
      source: "existing",
      query: "institute substitute constitute 怎么分",
      activeExamTarget: "cet6",
      expectedQueryMode: "direct_compare",
      expectedResolution: "resolved",
      expectedAnswerStyle: "confusion_untangle",
      expectedComparisonViewId: "root-stitute",
      expectedGroundingIncludes: ["institute", "institution", "constitute", "substitute"],
      forbiddenGroundingIncludes: ["restitute", "prostitute"],
    }),
    createCase({
      name: "expression: comply conform defer",
      category: "expression_recall",
      source: "existing",
      query: "遵从怎么说",
      activeExamTarget: "cet6",
      expectedQueryMode: "meaning_lookup",
      expectedResolution: "resolved",
      expectedAnswerStyle: "expression_recall",
      expectedComparisonViewId: "comply-conform-defer",
      expectedGroundingIncludes: ["comply", "conform", "defer"],
    }),
    createCase({
      name: "expression: recommend suggest propose",
      category: "expression_recall",
      source: "existing",
      query: "建议怎么说",
      activeExamTarget: "cet6",
      expectedQueryMode: "meaning_lookup",
      expectedResolution: "resolved",
      expectedAnswerStyle: "expression_recall",
      expectedComparisonViewId: "recommend-suggest-propose",
      expectedGroundingIncludes: ["recommend", "suggest", "propose"],
    }),
    createCase({
      name: "expression: require demand request",
      category: "expression_recall",
      source: "existing",
      query: "要求怎么说",
      activeExamTarget: "cet6",
      expectedQueryMode: "meaning_lookup",
      expectedResolution: "resolved",
      expectedAnswerStyle: "expression_recall",
      expectedComparisonViewId: "require-demand-request",
      expectedGroundingIncludes: ["require", "demand", "request"],
    }),
    createCase({
      name: "root: institute memory group",
      category: "root_family",
      source: "existing",
      query: "跟 institute 一样那几个词怎么记",
      activeExamTarget: "cet6",
      expectedQueryMode: "root_family_summary",
      expectedResolution: "resolved",
      expectedAnswerStyle: "root_family_summary",
      expectedRootFamilyViewId: "root-stitute",
      expectedComparisonViewId: "root-stitute",
      expectedGroundingIncludes: ["institute", "institution", "constitute", "substitute"],
    }),
    createCase({
      name: "root: tempt family",
      category: "root_family",
      source: "existing",
      query: "tempt 这一族怎么记",
      activeExamTarget: "cet6",
      expectedQueryMode: "root_family_summary",
      expectedResolution: "resolved",
      expectedAnswerStyle: "root_family_summary",
      expectedRootFamilyViewId: "root-tempt",
      expectedGroundingIncludes: ["attempt", "tempt", "temptation", "contempt"],
    }),
    createCase({
      name: "root: inter prefix fragment",
      category: "root_family",
      source: "existing",
      query: "inter 开头的词有哪些",
      activeExamTarget: "cet6",
      expectedQueryMode: "root_family_summary",
      expectedResolution: "resolved",
      expectedAnswerStyle: "root_family_summary",
      expectedRootFamilyViewId: "fragment-prefix-inter",
      expectedComparisonViewId: null,
      expectedGroundingIncludes: ["international", "interpret", "interrupt"],
    }),
    createCase({
      name: "root: re nt fragment pattern",
      category: "root_family",
      source: "existing",
      query: "re...nt 这种词",
      activeExamTarget: "cet6",
      expectedQueryMode: "root_family_summary",
      expectedResolution: "resolved",
      expectedAnswerStyle: "root_family_summary",
      expectedRootFamilyViewId: "fragment-pattern-re-nt",
      expectedComparisonViewId: null,
      expectedGroundingIncludes: ["recent", "resent"],
    }),
    createCase({
      name: "no-match: unsupported root combination",
      category: "no_match",
      source: "existing",
      query: "re+con 的词根有什么词",
      activeExamTarget: "cet6",
      expectedQueryMode: "root_family_summary",
      expectedResolution: "no_match",
      expectedAnswerStyle: "root_family_summary",
      expectedRootFamilyViewId: null,
    }),
    createCase({
      name: "root: broad con prefix",
      category: "root_family",
      source: "existing",
      query: "con 开头的词有哪些",
      activeExamTarget: "cet6",
      expectedQueryMode: "root_family_summary",
      expectedResolution: "resolved",
      expectedAnswerStyle: "root_family_summary",
      expectedRootFamilyViewId: "fragment-prefix-con",
      expectedComparisonViewId: null,
      expectedGroundingIncludes: ["concept", "conform", "construct", "convenient"],
    }),
  ];
}

function addIfMismatch<T>(
  failures: string[],
  label: string,
  actual: T,
  expected: T,
) {
  if (actual !== expected) {
    failures.push(`${label} expected ${String(expected)}, received ${String(actual)}`);
  }
}

export function evaluateBlackBoxProductSmoke(
  caseDef: BlackBoxProductSmokeCase,
  observation: BlackBoxProductSmokeObservation,
): BlackBoxProductSmokeResult {
  const failures: string[] = [];

  addIfMismatch(
    failures,
    "queryMode",
    observation.queryMode,
    caseDef.expectedQueryMode,
  );
  addIfMismatch(
    failures,
    "resolution",
    observation.resolution,
    caseDef.expectedResolution,
  );
  addIfMismatch(
    failures,
    "answerStyle",
    observation.answerStyle,
    caseDef.expectedAnswerStyle,
  );

  if (
    "expectedComparisonViewId" in caseDef
    && observation.comparisonViewId !== (caseDef.expectedComparisonViewId ?? null)
  ) {
    failures.push(
      `comparisonView expected ${caseDef.expectedComparisonViewId ?? "null"}, received ${
        observation.comparisonViewId ?? "null"
      }`,
    );
  }

  if (
    "expectedRootFamilyViewId" in caseDef
    && observation.rootFamilyViewId !== (caseDef.expectedRootFamilyViewId ?? null)
  ) {
    failures.push(
      `rootFamilyView expected ${caseDef.expectedRootFamilyViewId ?? "null"}, received ${
        observation.rootFamilyViewId ?? "null"
      }`,
    );
  }

  for (const lemma of caseDef.expectedGroundingIncludes ?? []) {
    if (!observation.groundingLemmas.includes(lemma)) {
      failures.push(`grounding missing ${lemma}`);
    }
  }

  for (const lemma of caseDef.forbiddenGroundingIncludes ?? []) {
    if (observation.groundingLemmas.includes(lemma)) {
      failures.push(`grounding should not include ${lemma}`);
    }
  }

  if (caseDef.expectedResolution === "resolved" && !observation.providerCalled) {
    failures.push("resolved case did not reach chat provider");
  }

  if (caseDef.expectedResolution === "no_match" && observation.providerCalled) {
    failures.push("no-match case should short-circuit chat provider");
  }

  return {
    name: caseDef.name,
    category: caseDef.category,
    verdict: failures.length === 0 ? "pass" : "fail",
    failures,
  };
}

export function summarizeBlackBoxProductSmoke(
  results: BlackBoxProductSmokeResult[],
): BlackBoxProductSmokeSummary {
  const summary: BlackBoxProductSmokeSummary = {
    total: results.length,
    pass: results.filter((item) => item.verdict === "pass").length,
    fail: results.filter((item) => item.verdict === "fail").length,
    byCategory: {},
  };

  for (const result of results) {
    const bucket = summary.byCategory[result.category] ?? {
      total: 0,
      pass: 0,
      fail: 0,
    };

    bucket.total += 1;

    if (result.verdict === "pass") {
      bucket.pass += 1;
    } else {
      bucket.fail += 1;
    }

    summary.byCategory[result.category] = bucket;
  }

  return summary;
}
