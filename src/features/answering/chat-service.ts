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

function buildNoMatchAnswer(grounding: AnswerGrounding) {
  if (grounding.queryMode === "root_family_summary") {
    return "这类词根/前缀组合我还没有稳定 grounding。为避免不硬凑规律，这次先不展开。你可以给我一个更明确的词根片段，或者直接问某一族（比如 stitute / tempt）。";
  }

  return "当前考试范围内未能稳定定位到你说的词，为避免答错对象，这次先不硬猜。你可以再告诉我它的中文意思、词首或词尾，或者你容易把它和哪个词搞混。";
}

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
        resolution: input.retrievalResult.resolution,
        noMatchReason: input.retrievalResult.noMatchReason,
        mainAnswer: input.retrievalResult.mainAnswer,
        confusionBoundary: input.retrievalResult.confusionBoundary,
        comparisonView: input.retrievalResult.comparisonView,
        rootFamilyView: input.retrievalResult.rootFamilyView ?? null,
      });

      if (grounding.resolution === "no_match") {
        return {
          answer: buildNoMatchAnswer(grounding),
          grounding,
          requestId,
          providerRequestId: null,
        };
      }

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
