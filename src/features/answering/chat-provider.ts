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
  grounding?: AnswerGrounding;
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

type OpenAiChatCompletionChoice = {
  message?: {
    content?:
      | string
      | Array<{
          type?: string;
          text?: string;
        }>;
  };
};

type OpenAiChatCompletionPayload = {
  id?: string;
  choices?: OpenAiChatCompletionChoice[];
  error?: {
    message?: string;
  };
};

type CreateOpenAiChatProviderOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
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

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

function buildUserMessage(input: GenerateAnswerInput) {
  if (!input.grounding) {
    return `用户当前问题：${input.query}`;
  }

  const grounding = input.grounding.answerStyle === "standard_lookup"
    ? sanitizeStandardLookupGrounding(input.grounding)
    : input.grounding;

  return [
    `用户当前问题：${input.query}`,
    "",
    "请严格根据下面的 grounding 回答：",
    JSON.stringify(grounding, null, 2),
  ].join("\n");
}

function sanitizeCandidateForStandardLookup(
  candidate: AnswerGrounding["mainAnswer"][number],
) {
  return {
    entryId: candidate.entryId,
    lemma: candidate.lemma,
    meaningsZh: candidate.meaningsZh,
    matchedAlias: candidate.matchedAlias,
    sourceKind: candidate.sourceKind,
  };
}

function sanitizeStandardLookupGrounding(grounding: AnswerGrounding) {
  return {
    query: grounding.query,
    queryMode: grounding.queryMode,
    answerStyle: grounding.answerStyle,
    resolution: grounding.resolution,
    noMatchReason: grounding.noMatchReason,
    matchType: grounding.matchType ?? null,
    mainAnswer: grounding.mainAnswer.map(sanitizeCandidateForStandardLookup),
    confusionBoundary: grounding.confusionBoundary.map(sanitizeCandidateForStandardLookup),
    comparisonView: grounding.comparisonView,
    rootFamilyView: grounding.rootFamilyView,
    spellingCorrection: grounding.spellingCorrection ?? null,
  };
}

function stripThinkingContent(value: string) {
  return value.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
}

function extractResponsesOutputText(payload: OpenAiResponsesApiPayload) {
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractChatCompletionText(payload: OpenAiChatCompletionPayload) {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return stripThinkingContent(content);
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function readJsonPayload<T extends { error?: { message?: string } }>(response: Response) {
  const text = await response.text();

  try {
    return JSON.parse(text) as T;
  } catch {
    return {
      error: {
        message: text.trim() || `Request failed with status ${response.status}.`,
      },
    } as T;
  }
}

function isChatCompletionsEndpoint(endpoint: string) {
  return /\/chat\/completions\/?$/i.test(endpoint);
}

export function createOpenAiChatProvider(
  options: CreateOpenAiChatProviderOptions = {},
): ChatProvider {
  const apiKey = options.apiKey ?? env.openAiApiKey;
  const baseUrl = options.baseUrl ?? env.openAiBaseUrl;
  const model = options.model ?? env.openAiModel ?? "gpt-5.4";
  const endpoint =
    options.endpoint ??
    (baseUrl
      ? `${trimTrailingSlashes(baseUrl)}/chat/completions`
      : "https://api.openai.com/v1/responses");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async generateAnswer(input) {
      if (!apiKey) {
        throw new ChatProviderError("OPENAI_API_KEY is not configured.", 503);
      }

      if (isChatCompletionsEndpoint(endpoint)) {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "X-Client-Request-Id": input.requestId,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: input.systemPrompt,
              },
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
        const payload = await readJsonPayload<OpenAiChatCompletionPayload>(response);

        if (!response.ok) {
          throw new ChatProviderError(
            payload.error?.message ??
              `OpenAI Chat Completions request failed with status ${response.status}.`,
            response.status,
            providerRequestId ?? payload.id ?? null,
          );
        }

        const answer = extractChatCompletionText(payload);

        if (!answer) {
          throw new ChatProviderError(
            "OpenAI Chat Completions returned no text output.",
            502,
            providerRequestId ?? payload.id ?? null,
          );
        }

        return {
          answer,
          providerRequestId: providerRequestId ?? payload.id ?? null,
        };
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
      const payload = await readJsonPayload<OpenAiResponsesApiPayload>(response);

      if (!response.ok) {
        throw new ChatProviderError(
          payload.error?.message ??
            `OpenAI Responses API request failed with status ${response.status}.`,
          response.status,
          providerRequestId ?? payload.id ?? null,
        );
      }

      const answer = extractResponsesOutputText(payload);

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
