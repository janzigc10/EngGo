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
