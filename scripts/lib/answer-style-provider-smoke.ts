import type { ExamScopeCode } from "@/features/content/import-types";
import type {
  AnswerStyle,
  ConfusionClusterLabel,
  ConfusionClusterPurpose,
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
  expectedAnswerIncludes?: string[];
  forbiddenGroundingIncludes?: string[];
  expectedRootFamilyViewId?: string | null;
  expectedComparisonViewId?: string | null;
  expectedComparisonLabels?: ConfusionClusterLabel[];
  expectedComparisonPurposes?: ConfusionClusterPurpose[];
  forbiddenAnswerIncludes?: string[];
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
    comparisonView?: {
      id?: string;
      labels?: ConfusionClusterLabel[];
      purposes?: ConfusionClusterPurpose[];
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
  "检查回答是否讲清语义、词性、搭配或对象边界，而不是只说字母差异",
  "检查回答是否给出一个具体做题抓手",
];

const DEFAULT_ROOT_MANUAL_CHECKS = [
  "检查回答是否把当前范围内召回到的同根/碎片家族成员都列出来",
  "检查回答是否给每个成员都配中文核心义",
  "检查回答是否讲清前缀、后缀或现代义分流，而不是只排背诵优先级",
  "检查回答是否没有把内部防御性提醒写成正文",
];

const DEFAULT_BROAD_ROOT_MANUAL_CHECKS = [
  ...DEFAULT_ROOT_MANUAL_CHECKS,
  "检查回答是否用表格列出全部成员，而不是只写部分词或用“等”省略",
];

const DEFAULT_EXPRESSION_MANUAL_CHECKS = [
  "检查回答是否像写作/翻译表达扩展，而不是误写成易混词纠错课",
  "检查回答是否给出首选表达和可替换表达",
  "检查回答是否讲清使用边界和常见搭配",
  "检查回答是否没有主动扩展未召回的新词",
];

const DEFAULT_NO_MATCH_MANUAL_CHECKS = [
  "检查 no_match 回答是否明确保守，不要硬猜用户本意",
];

const DEFAULT_TYPO_MANUAL_CHECKS = [
  "检查回答第一句是否先说明“你可能想查的是 X。”",
  "检查回答是否先纠错再解释核心义，而不是把 X 当普通查词直接开头",
  "检查回答是否没有主动扩展未召回的新词",
];

const DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS = [
  "检查回答是否没有可见标题、例句、范围尾巴或主动扩词",
  "检查回答是否只围绕 grounding 主答案解释核心义",
  "检查回答是否像短查词，而不是百科讲义或易混词课",
];

const STANDARD_LOOKUP_FORBIDDEN_ANSWER_TEXT = [
  "主答案",
  "易混边界",
  "范围提醒",
  "建议的范围提醒",
  "建议的下一步追问",
  "CET",
  "范围",
  "后续",
  "没有需要区分",
  "**",
  "#",
  "例如",
  "例句",
  "source lemma",
  "source lemma index",
];

function standardLookupForbiddenAnswerText(...terms: string[]) {
  return [...STANDARD_LOOKUP_FORBIDDEN_ANSWER_TEXT, ...terms];
}

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
      maxAnswerChars: 450,
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
      maxAnswerChars: 450,
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
      maxAnswerChars: 450,
      manualChecks: DEFAULT_CONFUSION_MANUAL_CHECKS,
    }),
    createCase({
      name: "expression: comply conform defer",
      query: "遵从怎么说",
      activeExamTarget: "cet6",
      expectedQueryMode: "meaning_lookup",
      expectedResolution: "resolved",
      expectedAnswerStyle: "expression_recall",
      expectedComparisonViewId: "comply-conform-defer",
      expectedComparisonLabels: [
        "meaning_near",
        "collocation_boundary",
        "exam_high_value",
      ],
      expectedComparisonPurposes: ["expression_recall"],
      expectedGroundingIncludes: ["comply", "conform", "defer"],
      maxAnswerChars: 400,
      manualChecks: DEFAULT_EXPRESSION_MANUAL_CHECKS,
    }),
    createCase({
      name: "expression: affect effect impact",
      query: "影响怎么说",
      activeExamTarget: "cet6",
      expectedQueryMode: "meaning_lookup",
      expectedResolution: "resolved",
      expectedAnswerStyle: "expression_recall",
      expectedComparisonViewId: "affect-effect-impact",
      expectedComparisonLabels: ["meaning_near", "exam_high_value"],
      expectedComparisonPurposes: ["expression_recall"],
      expectedGroundingIncludes: ["affect", "effect", "impact"],
      maxAnswerChars: 400,
      manualChecks: DEFAULT_EXPRESSION_MANUAL_CHECKS,
    }),
    createCase({
      name: "expression: adapt adjust accommodate",
      query: "适应怎么说",
      activeExamTarget: "cet6",
      expectedQueryMode: "meaning_lookup",
      expectedResolution: "resolved",
      expectedAnswerStyle: "expression_recall",
      expectedComparisonViewId: "adapt-adjust-accommodate",
      expectedComparisonLabels: ["meaning_near"],
      expectedComparisonPurposes: ["expression_recall"],
      expectedGroundingIncludes: ["adapt", "adjust", "accommodate"],
      maxAnswerChars: 400,
      manualChecks: DEFAULT_EXPRESSION_MANUAL_CHECKS,
    }),
    createCase({
      name: "expression: recommend suggest propose",
      query: "建议怎么说",
      activeExamTarget: "cet6",
      expectedQueryMode: "meaning_lookup",
      expectedResolution: "resolved",
      expectedAnswerStyle: "expression_recall",
      expectedComparisonViewId: "recommend-suggest-propose",
      expectedComparisonLabels: ["meaning_near"],
      expectedComparisonPurposes: ["expression_recall"],
      expectedGroundingIncludes: ["recommend", "suggest", "propose"],
      maxAnswerChars: 400,
      manualChecks: DEFAULT_EXPRESSION_MANUAL_CHECKS,
    }),
    createCase({
      name: "expression: require demand request",
      query: "要求怎么说",
      activeExamTarget: "cet6",
      expectedQueryMode: "meaning_lookup",
      expectedResolution: "resolved",
      expectedAnswerStyle: "expression_recall",
      expectedComparisonViewId: "require-demand-request",
      expectedComparisonLabels: ["meaning_near"],
      expectedComparisonPurposes: ["expression_recall"],
      expectedGroundingIncludes: ["require", "demand", "request"],
      maxAnswerChars: 400,
      manualChecks: DEFAULT_EXPRESSION_MANUAL_CHECKS,
    }),
    createCase({
      name: "confusion: comply conform defer",
      query: "comply conform defer 怎么区分",
      activeExamTarget: "cet6",
      expectedQueryMode: "direct_compare",
      expectedResolution: "resolved",
      expectedAnswerStyle: "confusion_untangle",
      expectedGroundingIncludes: ["comply", "conform", "defer"],
      maxAnswerChars: 450,
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
      maxAnswerChars: 420,
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
      maxAnswerChars: 420,
      manualChecks: DEFAULT_ROOT_MANUAL_CHECKS,
    }),
    createCase({
      name: "root: inter prefix fragment",
      query: "inter 开头的词有哪些",
      activeExamTarget: "cet6",
      expectedQueryMode: "root_family_summary",
      expectedResolution: "resolved",
      expectedAnswerStyle: "root_family_summary",
      expectedGroundingIncludes: ["international", "interpret", "interrupt"],
      expectedRootFamilyViewId: "fragment-prefix-inter",
      expectedComparisonViewId: null,
      forbiddenAnswerIncludes: ["埋葬", "既是一个完整单词"],
      maxAnswerChars: 420,
      manualChecks: DEFAULT_ROOT_MANUAL_CHECKS,
    }),
    createCase({
      name: "root: con prefix fragment",
      query: "con 开头的词有哪些",
      activeExamTarget: "cet6",
      expectedQueryMode: "root_family_summary",
      expectedResolution: "resolved",
      expectedAnswerStyle: "root_family_summary",
      expectedGroundingIncludes: ["concept", "conform", "construct", "convenient"],
      expectedAnswerIncludes: ["| word | 词性 | 核心义 |", "confident", "convenient", "adj."],
      forbiddenAnswerIncludes: ["confidant", "例如"],
      expectedRootFamilyViewId: "fragment-prefix-con",
      expectedComparisonViewId: null,
      maxAnswerChars: 1500,
      manualChecks: DEFAULT_BROAD_ROOT_MANUAL_CHECKS,
    }),
    createCase({
      name: "root: tion suffix fragment",
      query: "tion 结尾的词有哪些",
      activeExamTarget: "cet6",
      expectedQueryMode: "root_family_summary",
      expectedResolution: "resolved",
      expectedAnswerStyle: "root_family_summary",
      expectedGroundingIncludes: [
        "condition",
        "connection",
        "function",
        "institution",
        "tradition",
      ],
      expectedAnswerIncludes: ["| word | 词性 | 核心义 |", "condition", "connection", "n."],
      forbiddenAnswerIncludes: ["例如"],
      expectedRootFamilyViewId: "fragment-suffix-tion",
      expectedComparisonViewId: null,
      maxAnswerChars: 1200,
      manualChecks: DEFAULT_BROAD_ROOT_MANUAL_CHECKS,
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
      name: "typo: reqeust correction",
      query: "有个像 reqeust 的词",
      activeExamTarget: "cet4",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedRootFamilyViewId: null,
      expectedGroundingIncludes: ["request"],
      manualChecks: DEFAULT_TYPO_MANUAL_CHECKS,
    }),
  ];
}

export function buildStandardLookupProviderSmokeCases(): ProviderSmokeCase[] {
  return [
    createCase({
      name: "standard: academic lookup",
      query: "academic 是什么意思",
      activeExamTarget: "cet4",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["academic"],
      forbiddenGroundingIncludes: ["scholarly", "educational"],
      forbiddenAnswerIncludes: [
        ...STANDARD_LOOKUP_FORBIDDEN_ANSWER_TEXT,
        "scholarly",
        "educational",
      ],
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: source lemma accent lookup",
      query: "accent",
      activeExamTarget: "cet4",
      expectedQueryMode: "direct_lookup",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["accent"],
      expectedAnswerIncludes: ["核心义"],
      forbiddenAnswerIncludes: STANDARD_LOOKUP_FORBIDDEN_ANSWER_TEXT,
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: institute lookup",
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
        "establish",
        "restitute",
        "prostitute",
      ],
      forbiddenAnswerIncludes: [
        ...STANDARD_LOOKUP_FORBIDDEN_ANSWER_TEXT,
        "institution",
        "constitute",
        "substitute",
        "establish",
        "restitute",
        "prostitute",
      ],
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: institution lookup",
      query: "institution 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["institution"],
      forbiddenGroundingIncludes: ["institute", "constitute", "substitute"],
      forbiddenAnswerIncludes: standardLookupForbiddenAnswerText(
        "institute",
        "constitute",
        "substitute",
      ),
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: constitute lookup",
      query: "constitute 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["constitute"],
      forbiddenGroundingIncludes: ["institute", "institution", "substitute"],
      forbiddenAnswerIncludes: standardLookupForbiddenAnswerText(
        "institute",
        "institution",
        "substitute",
      ),
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: substitute lookup",
      query: "substitute 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["substitute"],
      forbiddenGroundingIncludes: ["institute", "institution", "constitute"],
      forbiddenAnswerIncludes: standardLookupForbiddenAnswerText(
        "institute",
        "institution",
        "constitute",
      ),
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: attempt lookup",
      query: "attempt 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["attempt"],
      forbiddenGroundingIncludes: ["tempt", "temptation", "contempt"],
      forbiddenAnswerIncludes: standardLookupForbiddenAnswerText(
        "temptation",
        "contempt",
      ),
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: temptation lookup",
      query: "temptation 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["temptation"],
      forbiddenGroundingIncludes: ["attempt", "tempt", "contempt"],
      forbiddenAnswerIncludes: standardLookupForbiddenAnswerText(
        "attempt",
        "contempt",
      ),
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: effect lookup",
      query: "effect 是什么意思",
      activeExamTarget: "cet4",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["effect"],
      forbiddenGroundingIncludes: ["affect", "impact"],
      forbiddenAnswerIncludes: standardLookupForbiddenAnswerText("affect", "impact"),
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: access lookup",
      query: "access 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["access"],
      forbiddenGroundingIncludes: ["assess", "excess"],
      forbiddenAnswerIncludes: standardLookupForbiddenAnswerText("assess", "excess"),
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: assess lookup",
      query: "assess 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["assess"],
      forbiddenGroundingIncludes: ["access", "excess"],
      forbiddenAnswerIncludes: standardLookupForbiddenAnswerText("access", "excess"),
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: respect lookup",
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
      forbiddenAnswerIncludes: standardLookupForbiddenAnswerText(
        "respective",
        "respectful",
        "respectable",
      ),
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: conform lookup",
      query: "conform 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["conform"],
      forbiddenGroundingIncludes: ["comply", "defer"],
      forbiddenAnswerIncludes: standardLookupForbiddenAnswerText("comply", "defer"),
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: adjust lookup",
      query: "adjust 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["adjust"],
      forbiddenGroundingIncludes: ["adapt", "accommodate"],
      forbiddenAnswerIncludes: standardLookupForbiddenAnswerText(
        "adapt",
        "accommodate",
      ),
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: stationery lookup",
      query: "stationery 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["stationery"],
      forbiddenGroundingIncludes: ["stationary"],
      forbiddenAnswerIncludes: standardLookupForbiddenAnswerText("stationary"),
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: available usage",
      query: "available 怎么用",
      activeExamTarget: "cet4",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["available"],
      forbiddenAnswerIncludes: [
        ...STANDARD_LOOKUP_FORBIDDEN_ANSWER_TEXT,
        "I am",
        "You can",
        "We can",
      ],
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: gain lookup",
      query: "gain 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["gain"],
      forbiddenAnswerIncludes: [
        ...STANDARD_LOOKUP_FORBIDDEN_ANSWER_TEXT,
        "benefit",
        "profit",
      ],
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: generate lookup",
      query: "generate 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["generate"],
      forbiddenAnswerIncludes: [
        ...STANDARD_LOOKUP_FORBIDDEN_ANSWER_TEXT,
        "你可能想查的是",
      ],
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: garage lookup",
      query: "garage 是什么意思",
      activeExamTarget: "cet4",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["garage"],
      forbiddenGroundingIncludes: ["garbage"],
      forbiddenAnswerIncludes: [
        ...STANDARD_LOOKUP_FORBIDDEN_ANSWER_TEXT,
        "garbage",
      ],
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: evidence lookup",
      query: "evidence 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["evidence"],
      forbiddenAnswerIncludes: STANDARD_LOOKUP_FORBIDDEN_ANSWER_TEXT,
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
    }),
    createCase({
      name: "standard: significant lookup",
      query: "significant 是什么意思",
      activeExamTarget: "cet6",
      expectedQueryMode: "fuzzy_recall",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["significant"],
      forbiddenAnswerIncludes: STANDARD_LOOKUP_FORBIDDEN_ANSWER_TEXT,
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
      manualChecks: DEFAULT_STANDARD_LOOKUP_MANUAL_CHECKS,
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
    ...(payload.grounding?.comparisonView?.members?.map((item) => item.lemma) ?? []),
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
  const expectedComparisonViewId = caseDef.expectedComparisonViewId ?? undefined;
  const comparisonView = payload.grounding?.comparisonView;

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

  for (const text of caseDef.expectedAnswerIncludes ?? []) {
    if (!answer.includes(text)) {
      hardFailures.push(`answer missing ${text}`);
    }
  }

  for (const text of caseDef.forbiddenAnswerIncludes ?? []) {
    if (answer.includes(text)) {
      hardFailures.push(`answer should not include ${text}`);
    }
  }

  if (expectedRootFamilyViewId !== (rootFamilyView?.id ?? null)) {
    hardFailures.push(
      `rootFamilyView expected ${expectedRootFamilyViewId ?? "null"}, received ${rootFamilyView?.id ?? "null"}`,
    );
  }

  if (
    expectedComparisonViewId !== undefined
    && expectedComparisonViewId !== (comparisonView?.id ?? null)
  ) {
    hardFailures.push(
      `comparisonView expected ${expectedComparisonViewId ?? "null"}, received ${
        comparisonView?.id ?? "null"
      }`,
    );
  }

  for (const label of caseDef.expectedComparisonLabels ?? []) {
    if (!comparisonView?.labels?.includes(label)) {
      hardFailures.push(`comparison labels missing ${label}`);
    }
  }

  for (const purpose of caseDef.expectedComparisonPurposes ?? []) {
    if (!comparisonView?.purposes?.includes(purpose)) {
      hardFailures.push(`comparison purposes missing ${purpose}`);
    }
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
