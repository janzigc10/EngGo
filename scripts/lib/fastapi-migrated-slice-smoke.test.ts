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
        name: "expression comply conform defer",
        query: "遵从怎么说",
        expectedStatus: 200,
        expectedAnswerStyle: "expression_recall",
        expectedComparisonViewId: "comply-conform-defer",
        expectedGroundingIncludes: ["comply", "conform", "defer"],
        expectedProviderRequest: "required",
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
        name: "learning intent evacuate shape neighbors",
        query: "跟evacuate很像的单词有哪些",
        expectedStatus: 200,
        expectedGroundingIncludes: ["evacuate", "evaluate"],
        expectedLearningIntentTask: "shape_neighbors",
        expectedBroadPresentation: "shape_neighbor_table",
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
    expect(observation.learningIntentTask).toBe("form_filter");
    expect(observation.broadPresentation).toBe("inventory_table");
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
