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

function shouldUseSpellingAssist(input: ChatServiceInput, grounding: AnswerGrounding) {
  if (grounding.resolution !== "no_match") {
    return false;
  }

  if (grounding.queryMode === "root_family_summary") {
    return false;
  }

  return getSuspiciousSingleEnglishToken(input.query) !== null;
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

function buildSpellingAssistPrompt() {
  return [
    "你是 EngGo 的拼写候选助手。用户输入的英文看起来可能不是稳定标准词。",
    "请只做拼写候选确认，不要把用户输入直接当成标准词解释。",
    "可以给出 1-3 个最可能的英文候选，每个候选只写一个很短的中文核心义。",
    "必须提醒用户先确认拼写；不要声称来自当前考试词库、当前考试范围、RAG 命中或任何已收录证据。",
    "回答要短，不要展开例句、用法或考试优先级。",
  ].join("\n");
}

const standardLookupForbiddenAnswerFragments = [
  "CET",
  "考试范围",
  "范围内",
  "当前范围",
  "范围提示",
  "主答案",
  "易混边界",
  "范围提醒",
  "没有需要区分",
  "例如",
  "例句",
  "下一步",
  "您可",
  "你可以",
  "可根据语境",
  "source lemma",
  "source lemma index",
];

function buildStandardLookupFallbackAnswer(grounding: AnswerGrounding) {
  const mainAnswer = grounding.mainAnswer[0];

  if (!mainAnswer) {
    return "";
  }

  if (mainAnswer.meaningsZh.length === 0 && mainAnswer.sourceKind === "source_lemma") {
    return `${mainAnswer.lemma} 已在 source lemma 中命中，但这条还没有人工结构化释义。`;
  }

  const meanings = mainAnswer.meaningsZh.join("、");
  const coreAnswer = `${mainAnswer.lemma} 的核心义是${meanings}。`;

  if (grounding.spellingCorrection) {
    return `你可能想查的是 ${grounding.spellingCorrection.lemma}。${coreAnswer}`;
  }

  return coreAnswer;
}

function cleanStandardLookupAnswer(answer: string, grounding: AnswerGrounding) {
  const withoutMarkdown = answer
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  const sentences = withoutMarkdown.match(/[^。！？.!?]+[。！？.!?]?/g) ?? [];
  const keptSentences = sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) =>
      !standardLookupForbiddenAnswerFragments.some((fragment) =>
        sentence.includes(fragment),
      ),
    );
  const cleaned = keptSentences.join("").trim();

  return cleaned || buildStandardLookupFallbackAnswer(grounding);
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
        matchType: input.retrievalResult.matchType ?? null,
        mainAnswer: input.retrievalResult.mainAnswer,
        confusionBoundary: input.retrievalResult.confusionBoundary,
        comparisonView: input.retrievalResult.comparisonView,
        rootFamilyView: input.retrievalResult.rootFamilyView ?? null,
      });

      if (grounding.resolution === "no_match") {
        if (shouldUseSpellingAssist(input, grounding)) {
          const result = await provider.generateAnswer({
            query: input.query,
            history: input.history,
            requestId,
            systemPrompt: buildSpellingAssistPrompt(),
          });

          return {
            answer: result.answer,
            answerKind: "plain",
            requestId,
            providerRequestId: result.providerRequestId,
          };
        }

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
        answer: grounding.answerStyle === "standard_lookup"
          ? cleanStandardLookupAnswer(result.answer, grounding)
          : result.answer,
        answerKind: "grounded",
        grounding,
        requestId,
        providerRequestId: result.providerRequestId,
      };
    },
  };
}
