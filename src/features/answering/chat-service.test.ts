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
      compareTerms: null,
    },
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
  };
}

describe("buildGrounding", () => {
  it("organizes response sections in MVP order", () => {
    const grounding = buildGrounding({
      activeExamTarget: "cet6",
      query: "遵从怎么说",
      candidates: createMeaningLookupResult().candidates,
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
});
