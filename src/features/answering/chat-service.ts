import type { ExamScopeCode } from "@/features/content/import-types";
import type { RetrievalResult } from "@/features/retrieval/types";
import {
  buildGrounding,
  type AnswerGrounding,
} from "@/features/answering/build-grounding";
import { buildSystemPrompt } from "@/features/answering/build-system-prompt";
import {
  createOpenAiChatProvider,
  type ChatHistoryMessage,
  type ChatProvider,
} from "@/features/answering/chat-provider";
import { createRequestId } from "@/features/observability/request-id";

export type ChatServiceInput = {
  activeExamTarget: ExamScopeCode;
  query: string;
  history: ChatHistoryMessage[];
  retrievalResult: RetrievalResult;
  requestId?: string;
};

export type ChatServiceResult = {
  answer: string;
  grounding: AnswerGrounding;
  requestId: string;
  providerRequestId: string | null;
};

type CreateChatServiceOptions = {
  provider?: ChatProvider;
  createRequestId?: () => string;
};

export function createChatService(options: CreateChatServiceOptions = {}) {
  const provider = options.provider ?? createOpenAiChatProvider();
  const createRequestIdImpl = options.createRequestId ?? createRequestId;

  return {
    async answer(input: ChatServiceInput): Promise<ChatServiceResult> {
      const requestId = input.requestId ?? createRequestIdImpl();
      const grounding = buildGrounding({
        activeExamTarget: input.activeExamTarget,
        query: input.query,
        queryMode: input.retrievalResult.queryMode,
        candidates: input.retrievalResult.candidates,
        comparisonView: input.retrievalResult.comparisonView,
      });
      const systemPrompt = buildSystemPrompt(grounding);
      const result = await provider.generateAnswer({
        query: input.query,
        history: input.history,
        requestId,
        systemPrompt,
        grounding,
      });

      return {
        answer: result.answer,
        grounding,
        requestId,
        providerRequestId: result.providerRequestId,
      };
    },
  };
}
