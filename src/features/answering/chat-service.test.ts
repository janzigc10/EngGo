import { describe, expect, it } from "vitest";

import { buildGrounding } from "@/features/answering/build-grounding";
import { createChatService } from "@/features/answering/chat-service";
import type { RetrievalResult } from "@/features/retrieval/types";

function createMeaningLookupResult(): RetrievalResult {
  return {
    queryMode: "meaning_lookup",
    normalizedQuery: {
      raw: "遵从怎么说",
      normalizedText: "遵从怎么说",
      queryMode: "meaning_lookup",
      englishTerms: [],
      meaningHint: "遵从",
      compareTerms: [],
      groupSeedTerm: null,
    },
    resolution: "resolved",
    noMatchReason: null,
    comparisonView: null,
    candidates: [
      {
        entryId: "comply",
        lemma: "comply",
        meaningsZh: ["遵从，依从"],
        matchedAlias: "comply with",
        scopeCodes: ["cet6", "postgrad"],
        inScope: true,
        reason: "in-scope main answer",
        score: 10,
      },
      {
        entryId: "conform",
        lemma: "conform",
        meaningsZh: ["遵照，一致"],
        matchedAlias: "conform to",
        scopeCodes: ["cet6"],
        inScope: true,
        reason: "nearby confusion",
        score: 8,
      },
      {
        entryId: "abide",
        lemma: "abide",
        meaningsZh: ["遵守"],
        matchedAlias: "abide by",
        scopeCodes: ["postgrad"],
        inScope: false,
        reason: "useful but out of scope",
        score: 5,
      },
    ],
    mainAnswer: [
      {
        entryId: "comply",
        lemma: "comply",
        meaningsZh: ["遵从，依从"],
        matchedAlias: "comply with",
        scopeCodes: ["cet6", "postgrad"],
        inScope: true,
        reason: "in-scope main answer",
        score: 10,
      },
    ],
    confusionBoundary: [
      {
        entryId: "conform",
        lemma: "conform",
        meaningsZh: ["遵照，一致"],
        matchedAlias: "conform to",
        scopeCodes: ["cet6"],
        inScope: true,
        reason: "nearby confusion",
        score: 8,
      },
      {
        entryId: "abide",
        lemma: "abide",
        meaningsZh: ["遵守"],
        matchedAlias: "abide by",
        scopeCodes: ["postgrad"],
        inScope: false,
        reason: "useful but out of scope",
        score: 5,
      },
    ],
  };
}

describe("buildGrounding", () => {
  it("organizes response sections in MVP order", () => {
    const grounding = buildGrounding({
      activeExamTarget: "cet6",
      query: "遵从怎么说",
      queryMode: "meaning_lookup",
      resolution: "resolved",
      noMatchReason: null,
      mainAnswer: createMeaningLookupResult().mainAnswer,
      confusionBoundary: createMeaningLookupResult().confusionBoundary,
      comparisonView: null,
    });

    expect(grounding.mainAnswer[0]?.lemma).toBe("comply");
    expect(grounding.confusionBoundary.map((item) => item.lemma)).toContain("conform");
    expect(grounding.scopeReminder).toContain("abide");
    expect(grounding.followUpPrompt.length).toBeGreaterThan(0);
  });
});

describe("createChatService", () => {
  it("passes structured grounding and request ids into the provider", async () => {
    const providerCalls: Array<{
      query: string;
      history: Array<{ role: "user" | "assistant"; content: string }>;
      requestId: string;
      systemPrompt: string;
      grounding: ReturnType<typeof buildGrounding>;
    }> = [];

    const service = createChatService({
      provider: {
        async generateAnswer(input) {
          providerCalls.push(input);

          return {
            answer: "CET-6 里优先用 comply with，和 conform to 的语义边界要分开记。",
            providerRequestId: "resp_123",
          };
        },
      },
      createRequestId: () => "req_test_123",
    });

    const result = await service.answer({
      activeExamTarget: "cet6",
      query: "遵从怎么说",
      history: [{ role: "user", content: "我总把 comply 和 conform 搞混" }],
      retrievalResult: createMeaningLookupResult(),
    });

    expect(result.requestId).toBe("req_test_123");
    expect(result.providerRequestId).toBe("resp_123");
    expect(result.answer).toContain("comply");
    expect(result.grounding.mainAnswer[0]?.lemma).toBe("comply");
    expect(providerCalls[0]?.requestId).toBe("req_test_123");
    expect(providerCalls[0]?.grounding.confusionBoundary.map((item) => item.lemma)).toContain(
      "conform",
    );
    expect(providerCalls[0]?.systemPrompt).toContain("主答案");
    expect(providerCalls[0]?.systemPrompt).toContain("易混边界");
    expect(providerCalls[0]?.history).toHaveLength(1);
  });

  it("short-circuits provider calls for no-match grounding", async () => {
    let providerCalled = false;

    const service = createChatService({
      provider: {
        async generateAnswer() {
          providerCalled = true;

          return {
            answer: "should not be used",
            providerRequestId: "resp_unused",
          };
        },
      },
      createRequestId: () => "req_no_match_123",
    });

    const result = await service.answer({
      activeExamTarget: "cet6",
      query: "recent 这个词什么意思",
      history: [],
      retrievalResult: {
        queryMode: "fuzzy_recall",
        normalizedQuery: {
          raw: "recent 这个词什么意思",
          normalizedText: "recent 这个词什么意思",
          queryMode: "fuzzy_recall",
          englishTerms: ["recent"],
          meaningHint: "recent",
          compareTerms: [],
          groupSeedTerm: null,
        },
        resolution: "no_match",
        noMatchReason: "out_of_kb",
        comparisonView: null,
        candidates: [],
        mainAnswer: [],
        confusionBoundary: [],
      },
    });

    expect(providerCalled).toBe(false);
    expect(result.requestId).toBe("req_no_match_123");
    expect(result.providerRequestId).toBeNull();
    expect(result.grounding.resolution).toBe("no_match");
    expect(result.grounding.noMatchReason).toBe("out_of_kb");
    expect(result.answer).toContain("这次先不硬猜");
    expect(result.grounding.followUpPrompt).toContain("中文义项");
  });

  it("returns a root-specific no-match answer for unsupported root queries", async () => {
    let providerCalled = false;

    const service = createChatService({
      provider: {
        async generateAnswer() {
          providerCalled = true;

          return {
            answer: "should not be used",
            providerRequestId: "resp_unused",
          };
        },
      },
      createRequestId: () => "req_root_no_match_123",
    });

    const result = await service.answer({
      activeExamTarget: "cet6",
      query: "re+con 的词根有什么词",
      history: [],
      retrievalResult: {
        queryMode: "root_family_summary",
        normalizedQuery: {
          raw: "re+con 的词根有什么词",
          normalizedText: "re+con 的词根有什么词",
          queryMode: "root_family_summary",
          englishTerms: ["re", "con"],
          meaningHint: "re+con",
          compareTerms: [],
          groupSeedTerm: null,
        },
        resolution: "no_match",
        noMatchReason: "low_confidence",
        comparisonView: null,
        rootFamilyView: null,
        candidates: [],
        mainAnswer: [],
        confusionBoundary: [],
      },
    });

    expect(providerCalled).toBe(false);
    expect(result.requestId).toBe("req_root_no_match_123");
    expect(result.providerRequestId).toBeNull();
    expect(result.grounding.queryMode).toBe("root_family_summary");
    expect(result.answer).toContain("不硬凑规律");
    expect(result.answer).toContain("词根/前缀组合");
  });
});
