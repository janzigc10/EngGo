import type { ExamScopeCode } from "@/features/content/import-types";
import type {
  RetrievalMatchType,
  RetrievalResolution,
} from "@/features/retrieval/types";

export type FastApiMigratedSliceSmokeCase = {
  name: string;
  query: string;
  activeExamTarget: ExamScopeCode;
  expectedStatus: number;
  expectedAnswerKind?: "grounded" | "plain";
  expectedAnswerStyle?: string;
  expectedResolution?: RetrievalResolution;
  expectedMatchType?: RetrievalMatchType | null;
  expectedComparisonViewId?: string | null;
  expectedRootFamilyViewId?: string | null;
  expectedLearningIntentTask?: string | null;
  expectedBroadPresentation?: string | null;
  expectedGroundingIncludes?: string[];
  expectedMainAnswerIncludes?: string[];
  forbiddenGroundingIncludes?: string[];
  forbiddenMainAnswerIncludes?: string[];
  expectedGrounding?: "present" | "absent";
  expectedErrorCode?: string;
  expectedProviderRequest?: "required" | "absent";
  expectedProviderRequestId: string | null;
};

export type FastApiMigratedSliceSmokeObservation = {
  status: number;
  answerKind: "grounded" | "plain" | null;
  errorCode: string | null;
  answerStyle: string | null;
  matchType: string | null;
  resolution: string | null;
  comparisonViewId: string | null;
  rootFamilyViewId: string | null;
  learningIntentTask: string | null;
  broadPresentation: string | null;
  groundingLemmas: string[];
  mainAnswerLemmas: string[];
  answerText: string | null;
  providerRequestId: string | null;
  hasGrounding: boolean;
  requestIdMatchesHeader: boolean;
};

export type FastApiMigratedSliceSmokeResult = {
  name: string;
  verdict: "pass" | "fail";
  failures: string[];
};

export type FastApiMigratedSliceSmokeSummary = {
  total: number;
  pass: number;
  fail: number;
};

export type FastApiMigratedSliceSmokeArgs = {
  baseUrl: string;
  label: string;
};

export function parseFastApiMigratedSliceSmokeArgs(
  args: string[],
): FastApiMigratedSliceSmokeArgs {
  let baseUrl = "http://127.0.0.1:8000";
  let label = "fastapi-direct";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextArg = args[index + 1];

    if (arg === "--base-url" && nextArg) {
      baseUrl = nextArg;
      index += 1;
      continue;
    }

    if (arg === "--label" && nextArg) {
      label = nextArg;
      index += 1;
    }
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    label,
  };
}

export function buildFastApiMigratedSliceSmokeCases(): FastApiMigratedSliceSmokeCase[] {
  return [
    {
      name: "source lemma accent",
      query: "accent",
      activeExamTarget: "cet4",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedResolution: "resolved",
      expectedMatchType: "source_lemma_exact",
      expectedProviderRequestId: null,
    },
    {
      name: "structured access",
      query: "access 是什么意思",
      activeExamTarget: "cet4",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedResolution: "resolved",
      expectedMatchType: "exact",
      expectedBroadPresentation: null,
      expectedProviderRequestId: null,
    },
    {
      name: "ecdict phrase make up",
      query: "make up",
      activeExamTarget: "cet4",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedResolution: "resolved",
      expectedMatchType: "external_dictionary_exact",
      expectedProviderRequestId: null,
    },
    {
      name: "ecdict phrase make up with suffix",
      query: "make up 是什么意思",
      activeExamTarget: "cet4",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedResolution: "resolved",
      expectedMatchType: "external_dictionary_exact",
      expectedProviderRequestId: null,
    },
    {
      name: "source phrase according to with suffix",
      query: "according to 是什么意思",
      activeExamTarget: "cet4",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedResolution: "resolved",
      expectedMatchType: "source_lemma_exact",
      expectedProviderRequestId: null,
    },
    {
      name: "ordinary no match",
      query: "wordnotreal",
      activeExamTarget: "cet4",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedResolution: "no_match",
      expectedMatchType: null,
      expectedProviderRequestId: null,
    },
    {
      name: "ecdict exact photosynthesis",
      query: "photosynthesis 是什么意思",
      activeExamTarget: "cet6",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedResolution: "resolved",
      expectedMatchType: "external_dictionary_exact",
      expectedGroundingIncludes: ["photosynthesis"],
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "typo generte",
      query: "generte 是什么意思",
      activeExamTarget: "cet6",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "standard_lookup",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["generate"],
      expectedProviderRequest: "required",
      expectedProviderRequestId: null,
    },
    {
      name: "compare access assess excess",
      query: "access assess excess 怎么区分",
      activeExamTarget: "cet6",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "confusion_untangle",
      expectedResolution: "resolved",
      expectedMatchType: null,
      expectedComparisonViewId: "access-assess-excess",
      expectedLearningIntentTask: "focused_compare",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "compare restrain constrain",
      query: "restrain constrain 怎么区分",
      activeExamTarget: "cet6",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "confusion_untangle",
      expectedResolution: "resolved",
      expectedMatchType: null,
      expectedComparisonViewId: "restrain-constrain-curb",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "expression comply conform defer",
      query: "遵从怎么说",
      activeExamTarget: "cet6",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "expression_recall",
      expectedResolution: "resolved",
      expectedComparisonViewId: "comply-conform-defer",
      expectedGroundingIncludes: ["comply", "conform", "defer"],
      expectedProviderRequest: "required",
      expectedProviderRequestId: null,
    },
    {
      name: "meaning lookup obey ecdict fallback",
      query: "\u9075\u5b88\u7684\u82f1\u6587\u662f\u5565",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedLearningIntentTask: "meaning_core",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "meaning lookup restrict ecdict fallback",
      query: "\u9650\u5236\u7528\u82f1\u8bed\u600e\u4e48\u8bf4",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedLearningIntentTask: "meaning_core",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "meaning lookup expression obey cleaned hint",
      query: "\u8868\u8fbe\u9075\u5b88\u7684\u5355\u8bcd",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedLearningIntentTask: "meaning_core",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "meaning lookup responsibility ecdict fallback",
      query: "\u8868\u793a\u627f\u62c5\u8d23\u4efb\u7684\u8bcd\u6709\u54ea\u4e9b",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedLearningIntentTask: "meaning_core",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "meaning lookup express opinion ecdict fallback",
      query: "\u8868\u793a\u8868\u8fbe\u89c2\u70b9\u7684\u8bcd\u6709\u54ea\u4e9b\u54ea\u4e9b\u8003\u8bd5\u5e38\u89c1",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedLearningIntentTask: "meaning_core",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "shape recent lookalikes",
      query: "跟 recent 很像的词有哪些",
      activeExamTarget: "cet6",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["recent", "resent"],
      expectedLearningIntentTask: "shape_neighbors",
      expectedBroadPresentation: "shape_neighbor_table",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "learning intent strict re cile filter",
      query: "re开头cile结尾的单词",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["reconcile"],
      forbiddenGroundingIncludes: ["recite", "reptile", "facile"],
      expectedLearningIntentTask: "form_filter",
      expectedBroadPresentation: "inventory_table",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "learning intent co cooperation semantic filter",
      query: "co开头的意思是合作的单词",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["collaborate", "cooperate", "cooperative"],
      forbiddenGroundingIncludes: ["coach", "coal", "corporation"],
      expectedLearningIntentTask: "semantic_filter",
      expectedBroadPresentation: "semantic_filter_table",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "learning intent respect word family",
      query: "respect派生词",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["respect", "respectful", "respectable", "respective"],
      expectedLearningIntentTask: "word_family",
      expectedBroadPresentation: "word_family_table",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "learning intent evacuate shape neighbors",
      query: "跟evacuate很像的单词有哪些",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["evacuate", "evaluate"],
      expectedLearningIntentTask: "shape_neighbors",
      expectedBroadPresentation: "shape_neighbor_table",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "student intent con common semantic filter",
      query: "con开头表示共同或一起的词",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["connect"],
      expectedMainAnswerIncludes: ["connect"],
      expectedLearningIntentTask: "semantic_filter",
      expectedBroadPresentation: "semantic_filter_table",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "student intent e evaluate semantic filter",
      query: "e开头表示评估评价的单词",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["evaluate", "estimate"],
      expectedMainAnswerIncludes: ["evaluate", "estimate"],
      expectedLearningIntentTask: "semantic_filter",
      expectedBroadPresentation: "semantic_filter_table",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "student intent con restrict semantic filter",
      query: "表示限制或约束的con开头单词",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["constrain", "confine"],
      expectedMainAnswerIncludes: ["constrain", "confine"],
      forbiddenMainAnswerIncludes: [
        "conceal",
        "confidential",
        "conscript",
        "contain",
        "content",
        "continual",
      ],
      expectedLearningIntentTask: "semantic_filter",
      expectedBroadPresentation: "semantic_filter_table",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "student intent desert dessert shape neighbors",
      query: "desert dessert 还有没有相似的词",
      activeExamTarget: "cet6",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["desert", "dessert"],
      expectedMainAnswerIncludes: ["desert", "dessert"],
      expectedLearningIntentTask: "shape_neighbors",
      expectedBroadPresentation: "shape_neighbor_table",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "student intent sign study word family",
      query: "sign这组词怎么背",
      activeExamTarget: "cet6",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["sign", "signal", "signify"],
      expectedMainAnswerIncludes: ["sign", "signal", "signify"],
      forbiddenMainAnswerIncludes: ["sigh", "sight", "scan", "sick"],
      expectedLearningIntentTask: "word_family",
      expectedBroadPresentation: "word_family_table",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "student intent sign derivatives word family",
      query: "sign的派生词有哪些",
      activeExamTarget: "cet6",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["sign", "signal", "signify"],
      expectedMainAnswerIncludes: ["sign", "signal", "signify"],
      forbiddenMainAnswerIncludes: ["sigh", "sight", "scan", "sick"],
      expectedLearningIntentTask: "word_family",
      expectedBroadPresentation: "word_family_table",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "student intent produce word family",
      query: "produce的同根词或派生词",
      activeExamTarget: "cet6",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["produce", "product", "productive", "reproduce"],
      expectedMainAnswerIncludes: ["produce", "product", "productive", "reproduce"],
      forbiddenMainAnswerIncludes: ["provide", "propose", "project", "promote"],
      expectedLearningIntentTask: "word_family",
      expectedBroadPresentation: "word_family_table",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "student intent respond word family",
      query: "respond\u7684\u6d3e\u751f\u8bcd",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["respond", "response", "responsive", "responsible"],
      expectedMainAnswerIncludes: ["respond", "response", "responsive", "responsible"],
      forbiddenMainAnswerIncludes: ["correspond"],
      expectedLearningIntentTask: "word_family",
      expectedBroadPresentation: "word_family_table",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "student intent pre advance semantic filter",
      query: "pre开头表示提前或预先的单词",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["precede", "prevent"],
      expectedMainAnswerIncludes: ["precede", "prevent"],
      forbiddenMainAnswerIncludes: ["pressure"],
      expectedLearningIntentTask: "semantic_filter",
      expectedBroadPresentation: "semantic_filter_table",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "root institute memory group",
      query: "跟 institute 一样那几个词怎么记",
      activeExamTarget: "cet6",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "root_family_summary",
      expectedResolution: "resolved",
      expectedRootFamilyViewId: "root-stitute",
      expectedGroundingIncludes: ["institute", "institution", "constitute", "substitute"],
      expectedProviderRequest: "required",
      expectedProviderRequestId: null,
    },
    {
      name: "root con prefix re contains",
      query: "con 开头 re 相关的词",
      activeExamTarget: "cet6",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["conference"],
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "root comm prefix organizer",
      query: "comm 开头的单词总结",
      activeExamTarget: "cet6",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["command", "comment", "commend"],
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "dynamic re+con broad grounding",
      query: "re+con 的词根有什么词",
      activeExamTarget: "cet6",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedAnswerStyle: "broad_vocab_summary",
      expectedResolution: "resolved",
      expectedGroundingIncludes: ["reconcile", "conform"],
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
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

export function evaluateFastApiMigratedSliceSmoke(
  caseDef: FastApiMigratedSliceSmokeCase,
  observation: FastApiMigratedSliceSmokeObservation,
): FastApiMigratedSliceSmokeResult {
  const failures: string[] = [];

  addIfMismatch(failures, "status", observation.status, caseDef.expectedStatus);

  if (failures.length === 0) {
    if (caseDef.expectedAnswerKind) {
      addIfMismatch(
        failures,
        "answerKind",
        observation.answerKind,
        caseDef.expectedAnswerKind,
      );
    }

    if ("expectedResolution" in caseDef) {
      addIfMismatch(
        failures,
        "resolution",
        observation.resolution,
        caseDef.expectedResolution ?? null,
      );
    }

    if ("expectedAnswerStyle" in caseDef) {
      addIfMismatch(
        failures,
        "answerStyle",
        observation.answerStyle,
        caseDef.expectedAnswerStyle ?? null,
      );
    }

    if ("expectedMatchType" in caseDef) {
      addIfMismatch(
        failures,
        "matchType",
        observation.matchType,
        caseDef.expectedMatchType ?? null,
      );
    }

    if ("expectedComparisonViewId" in caseDef) {
      addIfMismatch(
        failures,
        "comparisonViewId",
        observation.comparisonViewId,
        caseDef.expectedComparisonViewId ?? null,
      );
    }

    if ("expectedRootFamilyViewId" in caseDef) {
      addIfMismatch(
        failures,
        "rootFamilyViewId",
        observation.rootFamilyViewId,
        caseDef.expectedRootFamilyViewId ?? null,
      );
    }

    if ("expectedLearningIntentTask" in caseDef) {
      addIfMismatch(
        failures,
        "learningIntentTask",
        observation.learningIntentTask,
        caseDef.expectedLearningIntentTask ?? null,
      );
    }

    if ("expectedBroadPresentation" in caseDef) {
      addIfMismatch(
        failures,
        "broadPresentation",
        observation.broadPresentation,
        caseDef.expectedBroadPresentation ?? null,
      );
    }

    if (caseDef.expectedGrounding === "present" && !observation.hasGrounding) {
      failures.push("grounding expected present");
    }

    if (caseDef.expectedGrounding === "absent" && observation.hasGrounding) {
      failures.push("grounding expected absent");
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

    for (const lemma of caseDef.expectedMainAnswerIncludes ?? []) {
      if (!observation.mainAnswerLemmas.includes(lemma)) {
        failures.push(`main answer missing ${lemma}`);
      }
    }

    for (const lemma of caseDef.forbiddenMainAnswerIncludes ?? []) {
      if (observation.mainAnswerLemmas.includes(lemma)) {
        failures.push(`main answer should not include ${lemma}`);
      }
    }

    if (observation.answerText?.includes("当前回答服务暂时不可用")) {
      failures.push("answer contained unavailable-service fallback text");
    }

    if (caseDef.expectedErrorCode) {
      addIfMismatch(
        failures,
        "errorCode",
        observation.errorCode,
        caseDef.expectedErrorCode,
      );
    }

    if (caseDef.expectedProviderRequest === "required") {
      if (!observation.providerRequestId) {
        failures.push("providerRequestId expected to be present");
      }
    } else if (caseDef.expectedProviderRequest === "absent") {
      if (observation.providerRequestId) {
        failures.push("providerRequestId expected to be absent");
      }
    } else {
      addIfMismatch(
        failures,
        "providerRequestId",
        observation.providerRequestId,
        caseDef.expectedProviderRequestId,
      );
    }

    if (!observation.requestIdMatchesHeader) {
      failures.push("requestId did not match x-request-id header");
    }
  }

  return {
    name: caseDef.name,
    verdict: failures.length === 0 ? "pass" : "fail",
    failures,
  };
}

export function summarizeFastApiMigratedSliceSmoke(
  results: FastApiMigratedSliceSmokeResult[],
): FastApiMigratedSliceSmokeSummary {
  return {
    total: results.length,
    pass: results.filter((item) => item.verdict === "pass").length,
    fail: results.filter((item) => item.verdict === "fail").length,
  };
}
