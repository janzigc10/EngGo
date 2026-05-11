import { describe, expect, it } from "vitest";

import {
  buildFastApiMigratedSliceSmokeCases,
  evaluateFastApiMigratedSliceSmoke,
  parseFastApiMigratedSliceSmokeArgs,
  summarizeFastApiMigratedSliceSmoke,
} from "./fastapi-migrated-slice-smoke";

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
        name: "ordinary no match",
        query: "wordnotreal",
        expectedStatus: 200,
        expectedResolution: "no_match",
      }),
      expect.objectContaining({
        name: "plain fallback photosynthesis",
        query: "photosynthesis 是什么意思",
        expectedStatus: 200,
        expectedAnswerKind: "plain",
        expectedProviderRequest: "required",
        expectedGrounding: "absent",
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
        expectedProviderRequest: "required",
      }),
      expect.objectContaining({
        name: "compare restrain constrain",
        query: "restrain constrain 怎么区分",
        expectedStatus: 200,
        expectedAnswerStyle: "confusion_untangle",
        expectedComparisonViewId: "restrain-constrain-curb",
        expectedProviderRequest: "required",
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
        expectedAnswerStyle: "confusion_untangle",
        expectedComparisonViewId: "recent-resent",
        expectedGroundingIncludes: ["recent", "resent"],
        expectedProviderRequest: "required",
      }),
      expect.objectContaining({
        name: "root institute memory group",
        query: "跟 institute 一样那几个词怎么记",
        expectedStatus: 200,
        expectedAnswerStyle: "root_family_summary",
        expectedRootFamilyViewId: "root-stitute",
        expectedComparisonViewId: "root-stitute",
        expectedGroundingIncludes: ["institute", "institution", "constitute", "substitute"],
        expectedProviderRequest: "required",
      }),
      expect.objectContaining({
        name: "root con prefix re contains",
        query: "con 开头 re 相关的词",
        expectedStatus: 200,
        expectedAnswerStyle: "root_family_summary",
        expectedRootFamilyViewId: "fragment-prefix-con-contains-re",
        expectedGroundingIncludes: ["conference"],
        expectedProviderRequest: "required",
      }),
      expect.objectContaining({
        name: "unsupported root boundary",
        query: "re+con 的词根有什么词",
        expectedStatus: 200,
        expectedAnswerStyle: "root_family_summary",
        expectedResolution: "no_match",
        expectedRootFamilyViewId: null,
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

  it("passes a provider-backed migrated observation when provider id is present", () => {
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
        expectedProviderRequest: "required",
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
        groundingLemmas: ["access", "assess", "excess"],
        providerRequestId: "provider_req_123",
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

  it("fails when a plain fallback unexpectedly contains grounding", () => {
    const result = evaluateFastApiMigratedSliceSmoke(
      {
        name: "plain fallback photosynthesis",
        query: "photosynthesis 是什么意思",
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
        groundingLemmas: [],
        providerRequestId: "provider_req_plain",
        hasGrounding: true,
        requestIdMatchesHeader: true,
      },
    );

    expect(result).toEqual({
      name: "plain fallback photosynthesis",
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
