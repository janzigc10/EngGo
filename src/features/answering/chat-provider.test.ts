import { describe, expect, it } from "vitest";

import {
  createOpenAiChatProvider,
  ChatProviderError,
} from "@/features/answering/chat-provider";

function createInput() {
  return {
    query: "遵从怎么说",
    history: [{ role: "user" as const, content: "我总把 comply 和 conform 搞混" }],
    requestId: "req_test_123",
    systemPrompt: "You are a concise assistant.",
    grounding: {
      activeExamTarget: "cet6",
      activeExamTargetLabel: "CET-6",
      query: "遵从怎么说",
      queryMode: "meaning_lookup",
      resolution: "no_match" as const,
      noMatchReason: "out_of_kb" as const,
      mainAnswer: [],
      confusionBoundary: [],
      scopeReminder: "优先回答 CET-6 范围内的词。",
      followUpPrompt: "如果你愿意，我可以继续区分 comply 和 conform。",
      comparisonView: null,
    },
  };
}

describe("createOpenAiChatProvider", () => {
  it("does not expose exam scope metadata to standard lookup providers", async () => {
    let requestBody = "";
    const provider = createOpenAiChatProvider({
      apiKey: "test-key",
      endpoint: "https://api.example.com/v1/chat/completions",
      fetchImpl: async (_url, init) => {
        requestBody = String(init?.body ?? "");

        return new Response(
          JSON.stringify({
            id: "chatcmpl_standard",
            choices: [
              {
                message: {
                  content: "effect 的核心义是效果、影响。",
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    });

    await provider.generateAnswer({
      query: "effect 是什么意思",
      history: [],
      requestId: "req_standard_lookup",
      systemPrompt: "普通查词模式：不要输出范围提示。",
      grounding: {
        activeExamTarget: "cet4",
        activeExamTargetLabel: "CET-4",
        query: "effect 是什么意思",
        queryMode: "fuzzy_recall",
        resolution: "resolved",
        noMatchReason: null,
        answerStyle: "standard_lookup",
        mainAnswer: [
          {
            entryId: "effect",
            lemma: "effect",
            meaningsZh: ["效果", "影响"],
            matchedAlias: null,
            scopeCodes: ["cet4", "cet6"],
            inScope: true,
            reason: "当前考试范围命中",
            score: 100,
          },
        ],
        confusionBoundary: [],
        scopeReminder: "这次回答已优先锁定在 CET-4 范围内。",
        followUpPrompt: "如果你愿意，我可以继续讲 affect 和 effect 的区别。",
        comparisonView: null,
        rootFamilyView: null,
      },
    });

    const body = JSON.parse(requestBody) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = body.messages.at(-1)?.content ?? "";

    expect(userMessage).toContain("effect");
    expect(userMessage).not.toContain("CET-4");
    expect(userMessage).not.toContain("activeExamTarget");
    expect(userMessage).not.toContain("activeExamTargetLabel");
    expect(userMessage).not.toContain("scopeReminder");
    expect(userMessage).not.toContain("scopeCodes");
    expect(userMessage).not.toContain("reason");
    expect(userMessage).not.toContain("当前考试范围");
  });

  it("parses OpenAI Responses output", async () => {
    const provider = createOpenAiChatProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            id: "resp_123",
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: "comply with",
                  },
                ],
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "x-request-id": "openai_req_123",
            },
          },
        ),
    });

    const result = await provider.generateAnswer(createInput());

    expect(result.answer).toBe("comply with");
    expect(result.providerRequestId).toBe("openai_req_123");
  });

  it("parses chat completions output and strips MiniMax thinking blocks", async () => {
    const provider = createOpenAiChatProvider({
      apiKey: "test-key",
      endpoint: "https://api.minimaxi.com/v1/chat/completions",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            id: "chatcmpl_123",
            choices: [
              {
                message: {
                  content:
                    "<think>The user wants a concise answer.</think>\n\ncomply with",
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "x-request-id": "minimax_req_123",
            },
          },
        ),
    });

    const result = await provider.generateAnswer(createInput());

    expect(result.answer).toBe("comply with");
    expect(result.providerRequestId).toBe("minimax_req_123");
  });

  it("throws 503 when the API key is missing", async () => {
    const provider = createOpenAiChatProvider({
      apiKey: "",
    });

    await expect(provider.generateAnswer(createInput())).rejects.toMatchObject<
      Partial<ChatProviderError>
    >({
      status: 503,
      message: "OPENAI_API_KEY is not configured.",
    });
  });
});
