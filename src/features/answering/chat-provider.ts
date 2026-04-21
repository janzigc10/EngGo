import type { AnswerGrounding } from "@/features/answering/build-grounding";
import { env } from "@/lib/env";

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type GenerateAnswerInput = {
  query: string;
  history: ChatHistoryMessage[];
  requestId: string;
  systemPrompt: string;
  grounding: AnswerGrounding;
};

export type GenerateAnswerResult = {
  answer: string;
  providerRequestId: string | null;
};

export interface ChatProvider {
  generateAnswer(input: GenerateAnswerInput): Promise<GenerateAnswerResult>;
}

type OpenAiResponsesApiOutput = {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

type OpenAiResponsesApiPayload = {
  id?: string;
  output?: OpenAiResponsesApiOutput[];
  error?: {
    message?: string;
  };
};

type CreateOpenAiChatProviderOptions = {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
};

export class ChatProviderError extends Error {
  status: number;
  providerRequestId: string | null;

  constructor(message: string, status: number, providerRequestId: string | null = null) {
    super(message);
    this.name = "ChatProviderError";
    this.status = status;
    this.providerRequestId = providerRequestId;
  }
}

function buildUserMessage(input: GenerateAnswerInput) {
  return [
    `用户当前问题：${input.query}`,
    "",
    "请严格根据下面的 grounding 回答：",
    JSON.stringify(input.grounding, null, 2),
  ].join("\n");
}

function extractOutputText(payload: OpenAiResponsesApiPayload) {
  const text = (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();

  return text;
}

export function createOpenAiChatProvider(
  options: CreateOpenAiChatProviderOptions = {},
): ChatProvider {
  const apiKey = options.apiKey ?? env.openAiApiKey;
  const model = options.model ?? "gpt-5.4";
  const endpoint = options.endpoint ?? "https://api.openai.com/v1/responses";
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async generateAnswer(input) {
      if (!apiKey) {
        throw new ChatProviderError("OPENAI_API_KEY is not configured.", 503);
      }

      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-Client-Request-Id": input.requestId,
        },
        body: JSON.stringify({
          model,
          reasoning: { effort: "low" },
          instructions: input.systemPrompt,
          input: [
            ...input.history.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            {
              role: "user",
              content: buildUserMessage(input),
            },
          ],
        }),
      });

      const providerRequestId =
        response.headers.get("x-request-id") ?? response.headers.get("openai-request-id");
      const payload = (await response.json()) as OpenAiResponsesApiPayload;

      if (!response.ok) {
        throw new ChatProviderError(
          payload.error?.message ??
            `OpenAI Responses API request failed with status ${response.status}.`,
          response.status,
          providerRequestId ?? payload.id ?? null,
        );
      }

      const answer = extractOutputText(payload);

      if (!answer) {
        throw new ChatProviderError(
          "OpenAI Responses API returned no text output.",
          502,
          providerRequestId ?? payload.id ?? null,
        );
      }

      return {
        answer,
        providerRequestId: providerRequestId ?? payload.id ?? null,
      };
    },
  };
}
