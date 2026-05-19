import { describe, expect, it } from "vitest";

import {
  buildFastApiMigratedSliceSmokeCases,
  evaluateFastApiMigratedSliceSmoke,
  parseFastApiMigratedSliceSmokeArgs,
  summarizeFastApiMigratedSliceSmoke,
} from "./fastapi-migrated-slice-smoke";
import { toObservation } from "../run-fastapi-migrated-slice-smoke";

describe("fastapi migrated-slice smoke", () => {
  it("defines the Stage 2 migrated ordinary lookup matrix", () => {
    expect(buildFastApiMigratedSliceSmokeCases()).toEqual([
      expect.objectContaining({
        name: "source lemma accent",
        query: "accent",
        expectedStatus: 200,
        expectedMatchType: "source_lemma_exact",
      }),
      expect.objectContaining({
        name: "structured access",
        query: "access 是什么意思",
        expectedStatus: 200,
        expectedMatchType: "exact",
      }),
      expect.objectContaining({
        name: "ecdict phrase make up",
        query: "make up",
        expectedStatus: 200,
        expectedMatchType: "external_dictionary_exact",
      }),
      expect.objectContaining({
        name: "ecdict phrase make up with suffix",
        query: "make up 是什么意思",
        expectedStatus: 200,
        expectedMatchType: "external_dictionary_exact",
      }),
      expect.objectContaining({
        name: "source phrase according to with suffix",
        query: "according to 是什么意思",
        expectedStatus: 200,
        expectedMatchType: "source_lemma_exact",
      }),
      expect.objectContaining({
        name: "ordinary no match",
        query: "wordnotreal",
        expectedStatus: 200,
        expectedResolution: "no_match",
      }),
      expect.objectContaining({
        name: "ecdict exact photosynthesis",
        query: "photosynthesis 是什么意思",
        expectedStatus: 200,
        expectedAnswerKind: "grounded",
        expectedMatchType: "external_dictionary_exact",
        expectedProviderRequest: "absent",
        expectedGroundingIncludes: ["photosynthesis"],
      }),
      expect.objectContaining({
        name: "typo generte",
        query: "generte 是什么意思",
        expectedStatus: 200,
        expectedAnswerStyle: "standard_lookup",
        expectedGroundingIncludes: ["generate"],
        expectedProviderRequest: "required",
      }),
      expect.objectContaining({
        name: "compare access assess excess",
        query: "access assess excess 怎么区分",
        expectedStatus: 200,
        expectedAnswerStyle: "confusion_untangle",
        expectedComparisonViewId: "access-assess-excess",
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "compare restrain constrain",
        query: "restrain constrain 怎么区分",
        expectedStatus: 200,
        expectedAnswerStyle: "confusion_untangle",
        expectedComparisonViewId: "restrain-constrain-curb",
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "compare restrain constrain chinese difference",
        query: "restrain \u548c constrain \u7684\u533a\u522b",
        expectedStatus: 200,
        expectedAnswerStyle: "confusion_untangle",
        expectedComparisonViewId: "restrain-constrain-curb",
        expectedLearningIntentTask: "focused_compare",
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "expression comply conform defer",
        query: "遵从怎么说",
        expectedStatus: 200,
        expectedAnswerStyle: "expression_recall",
        expectedComparisonViewId: "comply-conform-defer",
        expectedGroundingIncludes: ["comply", "conform", "defer"],
        expectedProviderRequest: "required",
      }),
      expect.objectContaining({
        name: "meaning lookup obey ecdict fallback",
        query: "\u9075\u5b88\u7684\u82f1\u6587\u662f\u5565",
        expectedStatus: 200,
        expectedAnswerStyle: "broad_vocab_summary",
        expectedLearningIntentTask: "meaning_core",
        expectedGroundingIncludes: ["comply"],
        expectedMainAnswerIncludes: ["comply"],
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "meaning lookup restrict ecdict fallback",
        query: "\u9650\u5236\u7528\u82f1\u8bed\u600e\u4e48\u8bf4",
        expectedStatus: 200,
        expectedAnswerStyle: "broad_vocab_summary",
        expectedLearningIntentTask: "meaning_core",
        expectedGroundingIncludes: ["restrict"],
        expectedMainAnswerIncludes: ["restrict"],
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "meaning lookup expression obey cleaned hint",
        query: "\u8868\u8fbe\u9075\u5b88\u7684\u5355\u8bcd",
        expectedStatus: 200,
        expectedAnswerStyle: "broad_vocab_summary",
        expectedLearningIntentTask: "meaning_core",
        expectedGroundingIncludes: ["comply"],
        expectedMainAnswerIncludes: ["comply"],
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "meaning lookup responsibility ecdict fallback",
        query: "\u8868\u793a\u627f\u62c5\u8d23\u4efb\u7684\u8bcd\u6709\u54ea\u4e9b",
        expectedStatus: 200,
        expectedAnswerStyle: "broad_vocab_summary",
        expectedLearningIntentTask: "meaning_core",
        expectedGroundingIncludes: ["responsible"],
        expectedMainAnswerIncludes: ["responsible"],
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "meaning lookup express opinion ecdict fallback",
        query: "\u8868\u793a\u8868\u8fbe\u89c2\u70b9\u7684\u8bcd\u6709\u54ea\u4e9b\u54ea\u4e9b\u8003\u8bd5\u5e38\u89c1",
        expectedStatus: 200,
        expectedAnswerStyle: "broad_vocab_summary",
        expectedLearningIntentTask: "meaning_core",
        expectedGroundingIncludes: ["express"],
        expectedMainAnswerIncludes: ["express"],
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "shape recent lookalikes",
        query: "跟 recent 很像的词有哪些",
        expectedStatus: 200,
        expectedAnswerStyle: "broad_vocab_summary",
        expectedGroundingIncludes: ["recent", "resent"],
        expectedLearningIntentTask: "shape_neighbors",
        expectedBroadPresentation: "shape_neighbor_table",
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "shape accept except multi seed",
        query: "accept \u548c except \u5f88\u50cf\u7684\u5355\u8bcd\u6709\u54ea\u4e9b",
        expectedStatus: 200,
        expectedAnswerStyle: "broad_vocab_summary",
        expectedGroundingIncludes: ["accept", "except"],
        expectedMainAnswerIncludes: ["accept", "except"],
        expectedLearningIntentTask: "shape_neighbors",
        expectedBroadPresentation: "shape_neighbor_table",
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "shape restrain constrain multi seed",
        query: "restrain \u548c constrain \u5f88\u50cf\u7684\u5355\u8bcd",
        expectedStatus: 200,
        expectedAnswerStyle: "broad_vocab_summary",
        expectedGroundingIncludes: ["restrain", "constrain"],
        expectedMainAnswerIncludes: ["restrain", "constrain"],
        expectedLearningIntentTask: "shape_neighbors",
        expectedBroadPresentation: "shape_neighbor_table",
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "learning intent strict re cile filter",
        query: "re开头cile结尾的单词",
        expectedStatus: 200,
        expectedGroundingIncludes: ["reconcile"],
        forbiddenGroundingIncludes: ["recite", "reptile", "facile"],
        expectedLearningIntentTask: "form_filter",
        expectedBroadPresentation: "inventory_table",
      }),
      expect.objectContaining({
        name: "learning intent co cooperation semantic filter",
        query: "co开头的意思是合作的单词",
        expectedStatus: 200,
        expectedGroundingIncludes: ["collaborate", "cooperate", "cooperative"],
        forbiddenGroundingIncludes: ["coach", "coal", "corporation"],
        expectedLearningIntentTask: "semantic_filter",
        expectedBroadPresentation: "semantic_filter_table",
      }),
      expect.objectContaining({
        name: "learning intent respect word family",
        query: "respect派生词",
        expectedStatus: 200,
        expectedGroundingIncludes: ["respect", "respectful", "respectable", "respective"],
        expectedLearningIntentTask: "word_family",
        expectedBroadPresentation: "word_family_table",
      }),
      expect.objectContaining({
        name: "english seed respect expansion wording",
        query: "respect的拓展词",
        expectedStatus: 200,
        expectedGroundingIncludes: ["respect", "respectful", "respectable"],
        expectedLearningIntentTask: "word_family",
        expectedBroadPresentation: "word_family_table",
      }),
      expect.objectContaining({
        name: "english seed reduce expansion wording",
        query: "reduce的拓展词",
        expectedStatus: 200,
        expectedGroundingIncludes: ["reduce", "reduction"],
        expectedLearningIntentTask: "word_family",
        expectedBroadPresentation: "word_family_table",
      }),
      expect.objectContaining({
        name: "english seed consequence related-word wording",
        query: "consequence相关词",
        expectedStatus: 200,
        expectedGroundingIncludes: ["consequence", "consequent"],
        expectedLearningIntentTask: "word_family",
        expectedBroadPresentation: "word_family_table",
      }),
      expect.objectContaining({
        name: "english seed contribute related-word wording",
        query: "contribute相关词",
        expectedStatus: 200,
        expectedGroundingIncludes: ["contribute", "contribution"],
        expectedLearningIntentTask: "word_family",
        expectedBroadPresentation: "word_family_table",
      }),
      expect.objectContaining({
        name: "english seed responsible expansion split wording",
        query: "responsible的派生/拓展/相关词怎么分",
        expectedStatus: 200,
        expectedGroundingIncludes: ["responsible", "responsibility"],
        expectedLearningIntentTask: "word_family",
        expectedBroadPresentation: "word_family_table",
      }),
      expect.objectContaining({
        name: "learning intent evacuate shape neighbors",
        query: "跟evacuate很像的单词有哪些",
        expectedStatus: 200,
        expectedGroundingIncludes: ["evacuate", "evaluate"],
        expectedLearningIntentTask: "shape_neighbors",
        expectedBroadPresentation: "shape_neighbor_table",
      }),
      expect.objectContaining({
        name: "student intent con common semantic filter",
        query: "con开头表示共同或一起的词",
        expectedStatus: 200,
        expectedGroundingIncludes: ["connect"],
        expectedMainAnswerIncludes: ["connect"],
        expectedLearningIntentTask: "semantic_filter",
        expectedBroadPresentation: "semantic_filter_table",
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "student intent e evaluate semantic filter",
        query: "e开头表示评估评价的单词",
        expectedStatus: 200,
        expectedGroundingIncludes: ["evaluate", "estimate"],
        expectedMainAnswerIncludes: ["evaluate", "estimate"],
        expectedLearningIntentTask: "semantic_filter",
        expectedBroadPresentation: "semantic_filter_table",
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "student intent con restrict semantic filter",
        query: "表示限制或约束的con开头单词",
        expectedStatus: 200,
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
      }),
      expect.objectContaining({
        name: "student intent desert dessert shape neighbors",
        query: "desert dessert 还有没有相似的词",
        expectedStatus: 200,
        expectedGroundingIncludes: ["desert", "dessert"],
        expectedMainAnswerIncludes: ["desert", "dessert"],
        expectedLearningIntentTask: "shape_neighbors",
        expectedBroadPresentation: "shape_neighbor_table",
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "student intent sign study word family",
        query: "sign这组词怎么背",
        expectedStatus: 200,
        expectedGroundingIncludes: ["sign", "signal", "signify"],
        expectedMainAnswerIncludes: ["sign", "signal", "signify"],
        forbiddenMainAnswerIncludes: ["sigh", "sight", "scan", "sick"],
        expectedLearningIntentTask: "word_family",
        expectedBroadPresentation: "word_family_table",
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "student intent sign derivatives word family",
        query: "sign的派生词有哪些",
        expectedStatus: 200,
        expectedGroundingIncludes: ["sign", "signal", "signify"],
        expectedMainAnswerIncludes: ["sign", "signal", "signify"],
        forbiddenMainAnswerIncludes: ["sigh", "sight", "scan", "sick"],
        expectedLearningIntentTask: "word_family",
        expectedBroadPresentation: "word_family_table",
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "student intent produce word family",
        query: "produce的同根词或派生词",
        expectedStatus: 200,
        expectedGroundingIncludes: ["produce", "product", "productive", "reproduce"],
        expectedMainAnswerIncludes: ["produce", "product", "productive", "reproduce"],
        forbiddenMainAnswerIncludes: ["provide", "propose", "project", "promote"],
        expectedLearningIntentTask: "word_family",
        expectedBroadPresentation: "word_family_table",
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "student intent respond word family",
        query: "respond\u7684\u6d3e\u751f\u8bcd",
        expectedStatus: 200,
        expectedGroundingIncludes: ["respond", "response", "responsive", "responsible"],
        expectedMainAnswerIncludes: ["respond", "response", "responsive", "responsible"],
        forbiddenMainAnswerIncludes: ["correspond"],
        expectedLearningIntentTask: "word_family",
        expectedBroadPresentation: "word_family_table",
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "student intent pre advance semantic filter",
        query: "pre开头表示提前或预先的单词",
        expectedStatus: 200,
        expectedGroundingIncludes: ["precede", "prevent"],
        expectedMainAnswerIncludes: ["precede", "prevent"],
        forbiddenMainAnswerIncludes: ["pressure"],
        expectedLearningIntentTask: "semantic_filter",
        expectedBroadPresentation: "semantic_filter_table",
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "root institute memory group",
        query: "跟 institute 一样那几个词怎么记",
        expectedStatus: 200,
        expectedAnswerStyle: "root_family_summary",
        expectedRootFamilyViewId: "root-stitute",
        expectedGroundingIncludes: ["institute", "institution", "constitute", "substitute"],
        expectedProviderRequest: "required",
      }),
      expect.objectContaining({
        name: "root con prefix re contains",
        query: "con 开头 re 相关的词",
        expectedStatus: 200,
        expectedAnswerStyle: "broad_vocab_summary",
        expectedGroundingIncludes: ["conference"],
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "root comm prefix organizer",
        query: "comm 开头的单词总结",
        expectedStatus: 200,
        expectedAnswerStyle: "broad_vocab_summary",
        expectedGroundingIncludes: ["command", "comment", "commend"],
        expectedProviderRequest: "absent",
      }),
      expect.objectContaining({
        name: "dynamic re+con broad grounding",
        query: "re+con 的词根有什么词",
        expectedStatus: 200,
        expectedAnswerStyle: "broad_vocab_summary",
        expectedResolution: "resolved",
        expectedGroundingIncludes: ["reconcile", "conform"],
        expectedProviderRequest: "absent",
      }),
    ]);
  });

  it("passes a migrated grounded lookup observation", () => {
    const result = evaluateFastApiMigratedSliceSmoke(
      {
        name: "structured access",
        query: "access 是什么意思",
        activeExamTarget: "cet4",
        expectedStatus: 200,
        expectedAnswerKind: "grounded",
        expectedMatchType: "exact",
        expectedResolution: "resolved",
        expectedProviderRequestId: null,
      },
      {
        status: 200,
        answerKind: "grounded",
        errorCode: null,
        answerStyle: "standard_lookup",
        matchType: "exact",
        resolution: "resolved",
        comparisonViewId: null,
        rootFamilyViewId: null,
        learningIntentTask: null,
        broadPresentation: null,
        groundingLemmas: ["access"],
        mainAnswerLemmas: ["access"],
        answerText: "access",
        providerRequestId: null,
        hasGrounding: true,
        requestIdMatchesHeader: true,
      },
    );

    expect(result).toEqual({
      name: "structured access",
      verdict: "pass",
      failures: [],
    });
  });

  it("passes a deterministic migrated observation when provider is skipped", () => {
    const result = evaluateFastApiMigratedSliceSmoke(
      {
        name: "compare access assess excess",
        query: "access assess excess 怎么区分",
        activeExamTarget: "cet6",
        expectedStatus: 200,
        expectedAnswerKind: "grounded",
        expectedAnswerStyle: "confusion_untangle",
        expectedResolution: "resolved",
        expectedComparisonViewId: "access-assess-excess",
        expectedProviderRequest: "absent",
        expectedProviderRequestId: null,
      },
      {
        status: 200,
        answerKind: "grounded",
        errorCode: null,
        answerStyle: "confusion_untangle",
        matchType: null,
        resolution: "resolved",
        comparisonViewId: "access-assess-excess",
        rootFamilyViewId: null,
        learningIntentTask: "focused_compare",
        broadPresentation: null,
        groundingLemmas: ["access", "assess", "excess"],
        mainAnswerLemmas: ["access", "assess", "excess"],
        answerText: "access assess excess 怎么区分",
        providerRequestId: null,
        hasGrounding: true,
        requestIdMatchesHeader: true,
      },
    );

    expect(result).toEqual({
      name: "compare access assess excess",
      verdict: "pass",
      failures: [],
    });
  });

  it("passes a root-family observation with expected root view and lemmas", () => {
    const result = evaluateFastApiMigratedSliceSmoke(
      {
        name: "root institute memory group",
        query: "跟 institute 一样那几个词怎么记",
        activeExamTarget: "cet6",
        expectedStatus: 200,
        expectedAnswerKind: "grounded",
        expectedAnswerStyle: "root_family_summary",
        expectedResolution: "resolved",
        expectedRootFamilyViewId: "root-stitute",
        expectedGroundingIncludes: ["institute", "institution"],
        expectedProviderRequest: "required",
        expectedProviderRequestId: null,
      },
      {
        status: 200,
        answerKind: "grounded",
        errorCode: null,
        answerStyle: "root_family_summary",
        matchType: null,
        resolution: "resolved",
        comparisonViewId: null,
        rootFamilyViewId: "root-stitute",
        learningIntentTask: null,
        broadPresentation: null,
        groundingLemmas: ["institute", "institution", "constitute", "substitute"],
        mainAnswerLemmas: ["institute", "institution"],
        answerText: "institute 这一组怎么记",
        providerRequestId: "provider_req_root",
        hasGrounding: true,
        requestIdMatchesHeader: true,
      },
    );

    expect(result).toEqual({
      name: "root institute memory group",
      verdict: "pass",
      failures: [],
    });
  });

  it("collects broad light candidates into grounding lemmas", () => {
    const observation = toObservation(
      new Response("{}", {
        status: 200,
        headers: { "x-request-id": "req_123" },
      }),
      {
        requestId: "req_123",
        answerKind: "grounded",
        providerRequestId: "provider_req_light",
        answer: "conference\nconform",
        grounding: {
          answerStyle: "broad_vocab_summary",
          resolution: "resolved",
          learningIntentPlan: {
            task: "form_filter",
          },
          broadAnswerPlan: {
            presentation: "inventory_table",
          },
          lightCandidates: [
            { lemma: "conference" },
            { lemma: "conform" },
          ],
        },
      },
    );

    expect(observation.groundingLemmas).toEqual(["conference", "conform"]);
    expect(observation.mainAnswerLemmas).toEqual([]);
    expect(observation.answerText).toBe("conference\nconform");
    expect(observation.learningIntentTask).toBe("form_filter");
    expect(observation.broadPresentation).toBe("inventory_table");
  });

  it("fails when forbidden main-answer lemmas appear in a student-intent case", () => {
    const result = evaluateFastApiMigratedSliceSmoke(
      {
        name: "student intent pre advance semantic filter",
        query: "pre开头表示提前或预先的单词",
        activeExamTarget: "postgrad",
        expectedStatus: 200,
        expectedAnswerKind: "grounded",
        expectedResolution: "resolved",
        expectedLearningIntentTask: "semantic_filter",
        forbiddenMainAnswerIncludes: ["pressure"],
        expectedProviderRequest: "absent",
        expectedProviderRequestId: null,
      },
      {
        status: 200,
        answerKind: "grounded",
        errorCode: null,
        answerStyle: "broad_vocab_summary",
        matchType: null,
        resolution: "resolved",
        comparisonViewId: null,
        rootFamilyViewId: null,
        learningIntentTask: "semantic_filter",
        broadPresentation: "semantic_filter_table",
        groundingLemmas: ["precede", "pressure"],
        mainAnswerLemmas: ["precede", "pressure"],
        answerText: "precede\npressure",
        providerRequestId: null,
        hasGrounding: true,
        requestIdMatchesHeader: true,
      },
    );

    expect(result).toEqual({
      name: "student intent pre advance semantic filter",
      verdict: "fail",
      failures: ["main answer should not include pressure"],
    });
  });

  it("fails when expected student-intent lemmas only appear outside the main answer", () => {
    const result = evaluateFastApiMigratedSliceSmoke(
      {
        name: "student intent e evaluate semantic filter",
        query: "e开头表示评估评价的单词",
        activeExamTarget: "postgrad",
        expectedStatus: 200,
        expectedAnswerKind: "grounded",
        expectedResolution: "resolved",
        expectedLearningIntentTask: "semantic_filter",
        expectedGroundingIncludes: ["evaluate"],
        expectedMainAnswerIncludes: ["evaluate"],
        expectedProviderRequest: "absent",
        expectedProviderRequestId: null,
      },
      {
        status: 200,
        answerKind: "grounded",
        errorCode: null,
        answerStyle: "broad_vocab_summary",
        matchType: null,
        resolution: "resolved",
        comparisonViewId: null,
        rootFamilyViewId: null,
        learningIntentTask: "semantic_filter",
        broadPresentation: "semantic_filter_table",
        groundingLemmas: ["evaluate"],
        mainAnswerLemmas: [],
        answerText: "",
        providerRequestId: null,
        hasGrounding: true,
        requestIdMatchesHeader: true,
      },
    );

    expect(result).toEqual({
      name: "student intent e evaluate semantic filter",
      verdict: "fail",
      failures: ["main answer missing evaluate"],
    });
  });

  it("passes when forbidden lemmas are only outside the main answer", () => {
    const result = evaluateFastApiMigratedSliceSmoke(
      {
        name: "student intent pre advance semantic filter",
        query: "pre开头表示提前或预先的单词",
        activeExamTarget: "postgrad",
        expectedStatus: 200,
        expectedAnswerKind: "grounded",
        expectedResolution: "resolved",
        expectedLearningIntentTask: "semantic_filter",
        expectedGroundingIncludes: ["precede"],
        forbiddenMainAnswerIncludes: ["pressure"],
        expectedProviderRequest: "absent",
        expectedProviderRequestId: null,
      },
      {
        status: 200,
        answerKind: "grounded",
        errorCode: null,
        answerStyle: "broad_vocab_summary",
        matchType: null,
        resolution: "resolved",
        comparisonViewId: null,
        rootFamilyViewId: null,
        learningIntentTask: "semantic_filter",
        broadPresentation: "semantic_filter_table",
        groundingLemmas: ["precede", "pressure"],
        mainAnswerLemmas: ["precede"],
        answerText: "precede",
        providerRequestId: null,
        hasGrounding: true,
        requestIdMatchesHeader: true,
      },
    );

    expect(result).toEqual({
      name: "student intent pre advance semantic filter",
      verdict: "pass",
      failures: [],
    });
  });

  it("fails when a migrated case returns the unavailable-service fallback text", () => {
    const result = evaluateFastApiMigratedSliceSmoke(
      {
        name: "student intent con common semantic filter",
        query: "con开头表示共同或一起的词",
        activeExamTarget: "postgrad",
        expectedStatus: 200,
        expectedAnswerKind: "grounded",
        expectedResolution: "resolved",
        expectedLearningIntentTask: "semantic_filter",
        expectedProviderRequest: "absent",
        expectedProviderRequestId: null,
      },
      {
        status: 200,
        answerKind: "grounded",
        errorCode: null,
        answerStyle: "broad_vocab_summary",
        matchType: null,
        resolution: "resolved",
        comparisonViewId: null,
        rootFamilyViewId: null,
        learningIntentTask: "semantic_filter",
        broadPresentation: "semantic_filter_table",
        groundingLemmas: ["connect", "combine"],
        mainAnswerLemmas: [],
        answerText: "当前回答服务暂时不可用，请稍后再试。",
        providerRequestId: null,
        hasGrounding: true,
        requestIdMatchesHeader: true,
      },
    );

    expect(result).toEqual({
      name: "student intent con common semantic filter",
      verdict: "fail",
      failures: ["answer contained unavailable-service fallback text"],
    });
  });

  it("fails when a plain fallback unexpectedly contains grounding", () => {
    const result = evaluateFastApiMigratedSliceSmoke(
      {
        name: "plain fallback freeform",
        query: "explain a grammar idea outside the current grounding",
        activeExamTarget: "cet6",
        expectedStatus: 200,
        expectedAnswerKind: "plain",
        expectedProviderRequest: "required",
        expectedProviderRequestId: null,
        expectedGrounding: "absent",
      },
      {
        status: 200,
        answerKind: "plain",
        errorCode: null,
        answerStyle: "standard_lookup",
        matchType: null,
        resolution: "resolved",
        comparisonViewId: null,
        rootFamilyViewId: null,
        learningIntentTask: null,
        broadPresentation: null,
        groundingLemmas: [],
        mainAnswerLemmas: [],
        answerText: "plain answer",
        providerRequestId: "provider_req_plain",
        hasGrounding: true,
        requestIdMatchesHeader: true,
      },
    );

    expect(result).toEqual({
      name: "plain fallback freeform",
      verdict: "fail",
      failures: ["grounding expected absent"],
    });
  });

  it("summarizes smoke results", () => {
    expect(
      summarizeFastApiMigratedSliceSmoke([
        { name: "left", verdict: "pass", failures: [] },
        { name: "right", verdict: "fail", failures: ["status mismatch"] },
      ]),
    ).toEqual({
      total: 2,
      pass: 1,
      fail: 1,
    });
  });

  it("parses runner args with safe defaults", () => {
    expect(parseFastApiMigratedSliceSmokeArgs([])).toEqual({
      baseUrl: "http://127.0.0.1:8000",
      label: "fastapi-direct",
    });

    expect(
      parseFastApiMigratedSliceSmokeArgs([
        "--base-url",
        "http://127.0.0.1:3000",
        "--label",
        "next-proxy",
      ]),
    ).toEqual({
      baseUrl: "http://127.0.0.1:3000",
      label: "next-proxy",
    });
  });
});
