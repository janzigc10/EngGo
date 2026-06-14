"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import {
  applyResolvedFollowUpAction,
  latestConversationContext,
} from "@/features/chat/conversation-context";
import {
  postChatRequest,
  postChatStreamRequest,
  readChatStreamResponse,
} from "@/features/chat/chat-api-client";
import type {
  AnswerSurface,
  ChatApiErrorResponse,
  ChatApiSuccessResponse,
  ChatHistoryMessage,
  ChatMessage,
  ConversationalLearningContext,
} from "@/features/chat/types";
import {
  getServerExamTargetSnapshot,
  persistExamTarget,
  readStoredExamTarget,
  subscribeExamTarget,
} from "@/features/exam-target/exam-target-store";
import {
  defaultExamTarget,
  type ExamTargetCode,
} from "@/features/exam-target/model";
import { getWordbookIdForExamTarget } from "@/features/wordbook/wordbook-data";
import { saveActiveWordbookId } from "@/features/wordbook/wordbook-active-store";

const defaultExamplePrompts = [
  "遵从怎么说",
  "有个像 institute 的词",
  "restrain 和 constrain 的区别",
  "为什么我总把 comply 和 conform 搞混",
];
const genericChatErrorMessage = "当前回答服务暂时不可用，请稍后再试。";
const chatTranscriptStorageKey = "enggo.chatTranscript";
const sensitiveErrorPatterns = [
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /configured on the server/i,
  /traceback/i,
  /stack trace/i,
];
const contextChoicePattern = (
  /(哪个|哪一个|哪种|更正式|更常用|更自然|更适合|作文|书面|口语|formal|common|natural|exam)/i
);
const comparePromptPattern = (
  /(怎么区分|区别|差别|辨析|\bvs\b|\bversus\b|\bdifference\b|\bcompare\b)/i
);
const expressionPromptPattern = (
  /(more formal|formal way|better way to say|更正式.*表达|更适合.*表达|作文.*表达)/i
);

function createMessageId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage;
}

function normalizeStoredMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (
      !item
      || typeof item !== "object"
      || !("role" in item)
      || !("content" in item)
      || (item.role !== "user" && item.role !== "assistant")
      || typeof item.content !== "string"
      || item.content.trim().length === 0
    ) {
      return [];
    }

    return [
      {
        ...item,
        id:
          "id" in item && typeof item.id === "string"
            ? item.id
            : createMessageId(`restored-${index}`),
        role: item.role,
        content: item.content,
      } as ChatMessage,
    ];
  });
}

function readStoredChatTranscript() {
  const storage = getSessionStorage();

  if (!storage) {
    return [];
  }

  try {
    return normalizeStoredMessages(
      JSON.parse(storage.getItem(chatTranscriptStorageKey) ?? "[]"),
    );
  } catch {
    return [];
  }
}

function persistChatTranscript(messages: ChatMessage[]) {
  const storage = getSessionStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(chatTranscriptStorageKey, JSON.stringify(messages.slice(-20)));
  } catch {
    // Ignore storage failures; chat should keep working even in restricted browsers.
  }
}

function toHistory(messages: ChatMessage[]): ChatHistoryMessage[] {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function getChatErrorMessage(
  payload: ChatApiSuccessResponse | ChatApiErrorResponse,
) {
  if ("error" in payload) {
    const message = payload.error?.message?.trim();

    if (
      message
      && !sensitiveErrorPatterns.some((pattern) => pattern.test(message))
    ) {
      return message;
    }
  }

  return genericChatErrorMessage;
}

function englishTermCount(value: string) {
  return value.match(/[a-z][a-z'-]*/gi)?.length ?? 0;
}

function shouldUseStreamingRequest(
  prompt: string,
  conversationContext: ConversationalLearningContext | null,
) {
  if (
    conversationContext?.availableActions.includes("context_choice")
    && contextChoicePattern.test(prompt)
  ) {
    return true;
  }

  if (expressionPromptPattern.test(prompt)) {
    return true;
  }

  return comparePromptPattern.test(prompt) && englishTermCount(prompt) >= 2;
}

function buildAssistantMessage(
  payload: ChatApiSuccessResponse,
  id = createMessageId("assistant"),
): ChatMessage {
  return {
    id,
    role: "assistant",
    content: payload.answer,
    answerKind: payload.answerKind,
    grounding: payload.grounding,
    answerSurface: payload.answerSurface,
    requestId: payload.requestId,
    providerRequestId: payload.providerRequestId,
    conversationContext: payload.conversationContext,
    resolvedFollowUp: payload.resolvedFollowUp,
  };
}

function buildStreamingSurface(
  surface: AnswerSurface | null,
  streamedAnswer: string,
) {
  if (!surface) {
    return undefined;
  }

  return {
    ...surface,
    text: streamedAnswer,
  };
}

type UseChatSessionOptions = {
  initialExamTarget?: ExamTargetCode;
  initialPrompt?: string;
};

export function useChatSession(options: UseChatSessionOptions = {}) {
  const initialExamTarget = options.initialExamTarget;
  const initialPrompt = options.initialPrompt;
  const fallbackExamTarget = initialExamTarget ?? defaultExamTarget;
  const activeExamTarget = useSyncExternalStore(
    subscribeExamTarget,
    readStoredExamTarget,
    getServerExamTargetSnapshot,
  );
  const [composerValue, setComposerValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setMessages((currentMessages) => (
        currentMessages.length > 0 ? currentMessages : readStoredChatTranscript()
      ));
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!initialPrompt) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setComposerValue(initialPrompt);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [initialPrompt]);

  useEffect(() => {
    if (initialExamTarget) {
      persistExamTarget(initialExamTarget);
      saveActiveWordbookId(getWordbookIdForExamTarget(initialExamTarget));
    }
  }, [initialExamTarget]);

  function setActiveExamTarget(nextExamTarget: ExamTargetCode) {
    persistExamTarget(nextExamTarget);
    saveActiveWordbookId(getWordbookIdForExamTarget(nextExamTarget));
  }

  function chooseExamplePrompt(prompt: string) {
    setComposerValue(prompt);
  }

  async function submitPrompt(nextPrompt?: string) {
    const prompt = (nextPrompt ?? composerValue).trim();

    if (!prompt || isLoading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createMessageId("user"),
      role: "user",
      content: prompt,
    };
    const nextMessages = [...messages, userMessage];
    const requestExamTarget = activeExamTarget ?? fallbackExamTarget;
    const conversationContext = latestConversationContext(
      nextMessages,
      requestExamTarget,
    );
    const requestBody = {
      activeExamTarget: requestExamTarget,
      activeWordbookId: getWordbookIdForExamTarget(requestExamTarget),
      query: prompt,
      history: toHistory(messages),
      ...(conversationContext ? { conversationContext } : {}),
    };

    setMessages(nextMessages);
    persistChatTranscript(nextMessages);
    setComposerValue("");
    setErrorMessage(null);
    setIsLoading(true);

    let streamAssistantId: string | null = null;

    const applyFinalPayload = (
      payload: ChatApiSuccessResponse,
      assistantMessageId?: string,
    ) => {
      if (
        payload.resolvedFollowUp
        && "activeExamTarget" in payload.resolvedFollowUp
        && payload.resolvedFollowUp.activeExamTarget !== requestExamTarget
      ) {
        persistExamTarget(payload.resolvedFollowUp.activeExamTarget);
        saveActiveWordbookId(
          getWordbookIdForExamTarget(payload.resolvedFollowUp.activeExamTarget),
        );
      }

      if (payload.resolvedFollowUp?.kind === "resolved_action") {
        applyResolvedFollowUpAction(payload.resolvedFollowUp, requestExamTarget);
      }

      setMessages((previousMessages) => {
        const assistantMessage = buildAssistantMessage(
          payload,
          assistantMessageId,
        );
        const hasExistingAssistant = assistantMessageId
          ? previousMessages.some((message) => message.id === assistantMessageId)
          : false;
        const updatedMessages: ChatMessage[] = hasExistingAssistant
          ? previousMessages.map((message) => (
            message.id === assistantMessageId ? assistantMessage : message
          ))
          : [...previousMessages, assistantMessage];

        persistChatTranscript(updatedMessages);

        return updatedMessages;
      });
    };

    const upsertStreamDraft = (
      assistantMessageId: string,
      content: string,
      surface: AnswerSurface | null,
    ) => {
      setMessages((previousMessages) => {
        const draftMessage: ChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          content,
          answerSurface: buildStreamingSurface(surface, content),
          isStreaming: true,
        };
        const hasExistingDraft = previousMessages.some(
          (message) => message.id === assistantMessageId,
        );

        if (hasExistingDraft) {
          return previousMessages.map((message) => (
            message.id === assistantMessageId ? draftMessage : message
          ));
        }

        return [...previousMessages, draftMessage];
      });
    };

    const submitJsonRequest = async () => {
      const response = await postChatRequest(requestBody);

      const payload = (await response.json()) as
        | ChatApiSuccessResponse
        | ChatApiErrorResponse;

      if (!response.ok || !("answer" in payload)) {
        throw new Error(getChatErrorMessage(payload));
      }

      applyFinalPayload(payload);
    };

    const submitStreamRequest = async () => {
      const response = await postChatStreamRequest(requestBody);

      if (!response.ok) {
        return false;
      }

      if (!response.body) {
        const payload = (await response.json()) as
          | ChatApiSuccessResponse
          | ChatApiErrorResponse;

        if (!("answer" in payload)) {
          throw new Error(getChatErrorMessage(payload));
        }

        applyFinalPayload(payload);

        return true;
      }

      let streamedAnswer = "";
      let streamSurface: AnswerSurface | null = null;
      let finalPayload: ChatApiSuccessResponse | null = null;
      streamAssistantId = createMessageId("assistant");

      await readChatStreamResponse(response, (event) => {
        if (event.type === "surface_start") {
          streamSurface = event.surface;
          upsertStreamDraft(streamAssistantId as string, streamedAnswer, streamSurface);
          return;
        }

        if (event.type === "answer_delta") {
          streamedAnswer += event.text;
          upsertStreamDraft(streamAssistantId as string, streamedAnswer, streamSurface);
          return;
        }

        if (event.type === "error") {
          throw new Error(getChatErrorMessage(event.payload));
        }

        if (event.type === "final") {
          finalPayload = event.payload;
        }
      });

      if (!finalPayload) {
        throw new Error(genericChatErrorMessage);
      }

      applyFinalPayload(finalPayload, streamAssistantId);

      return true;
    };

    try {
      if (shouldUseStreamingRequest(prompt, conversationContext)) {
        const didStream = await submitStreamRequest();

        if (didStream) {
          return;
        }
      }

      await submitJsonRequest();
    } catch (error) {
      if (streamAssistantId) {
        setMessages((previousMessages) => previousMessages.filter(
          (message) => message.id !== streamAssistantId,
        ));
      }

      setErrorMessage(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : genericChatErrorMessage,
      );
    } finally {
      setIsLoading(false);
    }
  }

  return {
    activeExamTarget,
    composerValue,
    errorMessage,
    examplePrompts: defaultExamplePrompts,
    isLoading,
    messages,
    chooseExamplePrompt,
    setActiveExamTarget,
    setComposerValue,
    submitPrompt,
  };
}
