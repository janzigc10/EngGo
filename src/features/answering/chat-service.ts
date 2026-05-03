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
  answerKind?: "grounded" | "plain";
  grounding?: AnswerGrounding;
  requestId: string;
  providerRequestId: string | null;
};

type CreateChatServiceOptions = {
  provider?: ChatProvider;
  createRequestId?: () => string;
};

const learningIntentPattern =
  /意思|区别|区分|一样|怎么用|用法|造句|\bmean\b|\bdifference\b|\buse\b/i;

const comparisonIntentPattern =
  /意思|区别|区分|一样|同义|不同|vs\.?|versus|\bsame\b|\bdifference\b|\bcompare\b|\bor\b/i;

function getEnglishTokens(query: string) {
  return query.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
}

function getUniqueEnglishTokens(query: string) {
  return [...new Set(getEnglishTokens(query).map((token) => token.toLowerCase()))];
}

function isSuspiciousSingleEnglishToken(token: string) {
  const normalizedToken = token.toLowerCase();

  return /q(?!u)/.test(normalizedToken) || /[bcdfghjklmnpqrstvwxyz]{5,}/.test(normalizedToken);
}

function getSuspiciousSingleEnglishToken(query: string) {
  const englishTokens = getUniqueEnglishTokens(query);

  if (englishTokens.length !== 1) {
    return null;
  }

  const [token] = englishTokens;

  if (!token || !isSuspiciousSingleEnglishToken(token)) {
    return null;
  }

  return token;
}

function buildNoMatchAnswer(query: string, grounding: AnswerGrounding) {
  if (grounding.queryMode === "root_family_summary") {
    return "这个词根/前缀组合还没有稳定收录成词族，这次先不展开。你可以给我一个更明确的词根片段，或者直接问某一族（比如 stitute / tempt）。";
  }

  const suspiciousToken = getSuspiciousSingleEnglishToken(query);

  if (suspiciousToken) {
    return `我还不能稳定定位到 “${suspiciousToken}”。它看起来可能有拼写不确定的地方，所以这次先不硬猜成某一个词。你可以确认一下拼写，或者告诉我它的中文意思、词首词尾，或你觉得它像哪个词。`;
  }

  return "当前词库暂未稳定定位到你说的词，为避免答错对象，这次先不硬猜。你可以再告诉我它的中文意思、词首或词尾，或者你容易把它和哪个词搞混。";
}

function shouldUsePlainFallback(input: ChatServiceInput, grounding: AnswerGrounding) {
  if (grounding.resolution !== "no_match") {
    return false;
  }

  const englishTokens = getUniqueEnglishTokens(input.query);

  if (englishTokens.length === 0) {
    return false;
  }

  if (grounding.queryMode === "root_family_summary") {
    return false;
  }

  if (!learningIntentPattern.test(input.query)) {
    return false;
  }

  if (
    englishTokens.length === 1
    && isSuspiciousSingleEnglishToken(englishTokens[0] ?? "")
  ) {
    return false;
  }

  if (grounding.noMatchReason === "low_confidence") {
    return englishTokens.length >= 2 && comparisonIntentPattern.test(input.query);
  }

  return true;
}

function buildPlainFallbackPrompt() {
  return [
    "你是 EngGo 的英语学习助手。请把用户问题当作通用英语学习问题回答。",
    "不要声称来自当前考试词库、当前考试范围、RAG 命中或任何已收录证据。",
    "回答要短、直接、有学习价值；如果涉及词义或区别，先给核心边界。",
    "可以轻提示：这条当前还没有绑定到词库命中结果，所以先不标成范围优先项。",
  ].join("\n");
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
        if (shouldUsePlainFallback(input, grounding)) {
          const result = await provider.generateAnswer({
            query: input.query,
            history: input.history,
            requestId,
            systemPrompt: buildPlainFallbackPrompt(),
          });

          return {
            answer: result.answer,
            answerKind: "plain",
            requestId,
            providerRequestId: result.providerRequestId,
          };
        }

        return {
          answer: buildNoMatchAnswer(input.query, grounding),
          answerKind: "grounded",
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
        answerKind: "grounded",
        grounding,
        requestId,
        providerRequestId: result.providerRequestId,
      };
    },
  };
}
