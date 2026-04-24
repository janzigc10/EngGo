import type { ExamScopeCode } from "@/features/content/import-types";
import type {
  AnswerStyle,
  QueryMode,
  RetrievalResolution,
} from "@/features/retrieval/types";

export type ProviderSmokeCase = {
  name: string;
  query: string;
  activeExamTarget: ExamScopeCode;
  expectedQueryMode: QueryMode;
  expectedResolution: RetrievalResolution;
  expectedAnswerStyle: AnswerStyle;
  expectedGroundingIncludes?: string[];
  forbiddenGroundingIncludes?: string[];
  expectedRootFamilyViewId?: string | null;
  maxAnswerChars: number;
  manualChecks: string[];
};

export type ProviderSmokePayload = {
  status: number;
  providerRequestId: string | null;
  answer?: string;
  error?: { code?: string; message?: string } | null;
  grounding?: {
    queryMode?: QueryMode;
    resolution?: RetrievalResolution;
    answerStyle?: AnswerStyle;
    mainAnswer?: Array<{ lemma?: string }>;
    confusionBoundary?: Array<{ lemma?: string }>;
    rootFamilyView?: {
      id?: string;
      members?: Array<{ lemma?: string }>;
    } | null;
  };
};

export type ProviderSmokeResult = {
  name: string;
  autoVerdict: "pass" | "manual" | "fail";
  hardFailures: string[];
  manualChecks: string[];
  manualFlags: string[];
};

export type ProviderSmokeSummary = {
  total: number;
  pass: number;
  manual: number;
  fail: number;
};

const DEFAULT_CONFUSION_MANUAL_CHECKS = [
  "检查回答是否列出当前考试范围内召回到的相似词",
  "检查回答是否给每个列出的词都配中文核心义",
  "检查回答是否优先区分最容易混的 2 个，而不是平均铺开",
  "检查回答是否给出一个具体做题抓手",
];

const DEFAULT_ROOT_MANUAL_CHECKS = [
  "检查回答是否先讲碎片能抓什么，不要把词根硬讲成万能规则",
  "检查回答是否带出前缀方向、优先级和谨慎提醒",
];

const DEFAULT_NO_MATCH_MANUAL_CHECKS = [
  "检查 no_match 回答是否明确保守，不要硬猜用户本意",
];

function createCase(
  item: Omit<ProviderSmokeCase, "maxAnswerChars" | "manualChecks">
    & Pick<Partial<ProviderSmokeCase>, "maxAnswerChars" | "manualChecks">,
): ProviderSmokeCase {
  return {
    maxAnswerChars: 220,
    manualChecks: [],
    ...item,
  };
}

export function buildAnswerStyleProviderSmokeCases(): ProviderSmokeCase[] {
  return [
    createCase({
      name: "confusion: stationery choice",
      query: "stationary 和 stationery 哪个是文具",
      activeExamTarget: "cet4",
      expectedQueryMode: "direct_compare",
      expectedResolution: "resolved",
      expectedAnswerStyle: "confusion_untangle",
      expectedGroundingIncludes: ["stationary", "stationery"],
      manualChecks: DEFAULT_CONFUSION_MANUAL_CHECKS,
    }),
    createCase({
      name: "confusion: access assess excess",
      query: "access assess excess 怎么区分",
      activeExamTarget: "cet6",
      expectedQueryMode: "direct_compare",
      expectedResolution: "resolved",
      expectedAnswerStyle: "confusion_untangle",
      expectedGroundingIncludes: ["access", "assess", "excess"],
      maxAnswerChars: 260,
      manualChecks: DEFAULT_CONFUSION_MANUAL_CHECKS,
    }),
    createCase({
      name: "shape: recent lookalikes",
      query: "跟 recent 很像的词有哪些",
      activeExamTarget: "cet6",
      expectedQueryMode: "shape_neighbor_search",
      expectedResolution: "resolved",
      expectedAnswerStyle: "confusion_untangle",
      expectedGroundingIncludes: ["recent", "resent"],
      maxAnswerChars: 240,
      manualChecks: DEFAULT_CONFUSION_MANUAL_CHECKS,
    }),
    createCase({
      name: "confusion: comply conform defer",
      query: "comply conform defer 怎么区分",
      activeExamTarget: "cet6",
      expectedQueryMode: "direct_compare",
      expectedResolution: "resolved",
      expectedAnswerStyle: "confusion_untangle",
      expectedGroundingIncludes: ["comply", "conform", "defer"],
      maxAnswerChars: 260,
      manualChecks: DEFAULT_CONFUSION_MANUAL_CHECKS,
    }),
    createCase({
      name: "confusion: respect family",
      query: "respect 那组词怎么分",
      activeExamTarget: "cet4",
      expectedQueryMode: "direct_compare",
      expectedResolution: "resolved",
      expectedAnswerStyle: "confusion_untangle",
      expectedGroundingIncludes: [
        "respect",
        "respective",
        "respectful",
        "respectable",
      ],
      maxAnswerChars: 260,
      manualChecks: DEFAULT_CONFUSION_MANUAL_CHECKS,
    }),
    createCase({
      name: "root: stitute",
      query: "stitute 是什么",
      activeExamTarget: "cet6",
      expectedQueryMode: "root_family_summary",
      expectedResolution: "resolved",
      expectedAnswerStyle: "root_family_summary",
      expectedGroundingIncludes: ["institute", "institution", "constitute"],
      expectedRootFamilyViewId: "root-stitute",
      maxAnswerChars: 260,
      manualChecks: DEFAULT_ROOT_MANUAL_CHECKS,
    }),
    createCase({
      name: "root: tempt",
      query: "tempt 这一族怎么记",
      activeExamTarget: "cet6",
      expectedQueryMode: "root_family_summary",
      expectedResolution: "resolved",
      expectedAnswerStyle: "root_family_summary",
      expectedGroundingIncludes: ["tempt", "temptation", "attempt", "contempt"],
      expectedRootFamilyViewId: "root-tempt",
      maxAnswerChars: 280,
      manualChecks: DEFAULT_ROOT_MANUAL_CHECKS,
    }),
    createCase({
      name: "root: unsupported combination",
      query: "re+con 的词根有什么词",
      activeExamTarget: "cet6",
      expectedQueryMode: "root_family_summary",
      expectedResolution: "no_match",
      expectedAnswerStyle: "root_family_summary",
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_NO_MATCH_MANUAL_CHECKS,
    }),
    createCase({
      name: "typo: reqeust still no-match",
      query: "有个像 reqeust 的词",
      activeExamTarget: "cet4",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "no_match",
      expectedAnswerStyle: "standard_lookup",
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_NO_MATCH_MANUAL_CHECKS,
    }),
  ];
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function collectGroundingLemmas(payload: ProviderSmokePayload) {
  return unique([
    ...(payload.grounding?.mainAnswer?.map((item) => item.lemma) ?? []),
    ...(payload.grounding?.confusionBoundary?.map((item) => item.lemma) ?? []),
    ...(payload.grounding?.rootFamilyView?.members?.map((item) => item.lemma) ?? []),
  ]);
}

export function evaluateAnswerStyleProviderSmoke(
  caseDef: ProviderSmokeCase,
  payload: ProviderSmokePayload,
): ProviderSmokeResult {
  const hardFailures: string[] = [];
  const manualFlags: string[] = [];
  const answer = payload.answer?.trim() ?? "";
  const groundingLemmas = collectGroundingLemmas(payload);
  const expectedRootFamilyViewId = caseDef.expectedRootFamilyViewId ?? null;
  const rootFamilyView = payload.grounding?.rootFamilyView;

  if (payload.status !== 200) {
    hardFailures.push(`status expected 200, received ${payload.status}`);
  }

  if (payload.status === 200 && payload.error) {
    hardFailures.push("status 200 response should not include error payload");
  }

  if (payload.grounding?.queryMode !== caseDef.expectedQueryMode) {
    hardFailures.push(
      `queryMode expected ${caseDef.expectedQueryMode}, received ${payload.grounding?.queryMode ?? "missing"}`,
    );
  }

  if (payload.grounding?.resolution !== caseDef.expectedResolution) {
    hardFailures.push(
      `resolution expected ${caseDef.expectedResolution}, received ${payload.grounding?.resolution ?? "missing"}`,
    );
  }

  if (payload.grounding?.answerStyle !== caseDef.expectedAnswerStyle) {
    hardFailures.push(
      `answerStyle expected ${caseDef.expectedAnswerStyle}, received ${payload.grounding?.answerStyle ?? "missing"}`,
    );
  }

  for (const lemma of caseDef.expectedGroundingIncludes ?? []) {
    if (!groundingLemmas.includes(lemma)) {
      hardFailures.push(`grounding missing ${lemma}`);
    }
  }

  for (const lemma of caseDef.forbiddenGroundingIncludes ?? []) {
    if (groundingLemmas.includes(lemma)) {
      hardFailures.push(`grounding should not include ${lemma}`);
    }
  }

  if (expectedRootFamilyViewId !== (rootFamilyView?.id ?? null)) {
    hardFailures.push(
      `rootFamilyView expected ${expectedRootFamilyViewId ?? "null"}, received ${rootFamilyView?.id ?? "null"}`,
    );
  }

  if (caseDef.expectedResolution === "resolved" && answer.length === 0) {
    hardFailures.push("resolved case should return non-empty answer");
  }

  if (caseDef.expectedResolution === "resolved" && !payload.providerRequestId) {
    hardFailures.push("resolved case should return providerRequestId");
  }

  if (caseDef.expectedResolution === "no_match" && answer.length === 0) {
    hardFailures.push("no_match case should return non-empty answer");
  }

  if (caseDef.expectedResolution === "no_match" && payload.providerRequestId) {
    hardFailures.push("no_match case should not return providerRequestId");
  }

  if (expectedRootFamilyViewId === null && rootFamilyView) {
    hardFailures.push(
      "rootFamilyView should be absent when expectedRootFamilyViewId is null",
    );
  }

  if (answer.length > caseDef.maxAnswerChars) {
    manualFlags.push(
      `answer may be too long: ${answer.length} chars exceeds ${caseDef.maxAnswerChars}`,
    );
  }

  return {
    name: caseDef.name,
    autoVerdict: hardFailures.length > 0
      ? "fail"
      : manualFlags.length > 0
        ? "manual"
        : "pass",
    hardFailures,
    manualChecks: [...caseDef.manualChecks],
    manualFlags,
  };
}

export function summarizeAnswerStyleProviderSmoke(
  results: ProviderSmokeResult[],
): ProviderSmokeSummary {
  return {
    total: results.length,
    pass: results.filter((item) => item.autoVerdict === "pass").length,
    manual: results.filter((item) => item.autoVerdict === "manual").length,
    fail: results.filter((item) => item.autoVerdict === "fail").length,
  };
}
