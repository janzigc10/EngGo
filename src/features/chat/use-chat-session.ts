"use client";

import { useState, useSyncExternalStore } from "react";

import {
  applyResolvedFollowUpAction,
  latestConversationContext,
} from "@/features/chat/conversation-context";
import type { ChatApiSuccessResponse, ChatHistoryMessage, ChatMessage } from "@/features/chat/types";
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

const defaultExamplePrompts = [
  "遵从怎么说",
  "有个像 institute 的词",
  "restrain 和 constrain 的区别",
  "为什么我总把 comply 和 conform 搞混",
];
const genericChatErrorMessage = "当前回答服务暂时不可用，请稍后再试。";
const chatTranscriptStorageKey = "enggo.chatTranscript";

type ChatApiErrorResponse = {
  error?: {
    message?: string;
  };
};

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
    return payload.error?.message ?? genericChatErrorMessage;
  }

  return genericChatErrorMessage;
}

type UseChatSessionOptions = {
  initialExamTarget?: ExamTargetCode;
  initialPrompt?: string;
};

export function useChatSession(options: UseChatSessionOptions = {}) {
  const fallbackExamTarget = options.initialExamTarget ?? defaultExamTarget;
  const activeExamTarget = useSyncExternalStore(
    subscribeExamTarget,
    readStoredExamTarget,
    getServerExamTargetSnapshot,
  );
  const [composerValue, setComposerValue] = useState(options.initialPrompt ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>(() => readStoredChatTranscript());
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function setActiveExamTarget(nextExamTarget: ExamTargetCode) {
    persistExamTarget(nextExamTarget);
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
    const conversationContext = latestConversationContext(messages);
    const requestBody = {
      activeExamTarget: requestExamTarget,
      query: prompt,
      history: toHistory(messages),
      ...(conversationContext ? { conversationContext } : {}),
    };

    setMessages(nextMessages);
    persistChatTranscript(nextMessages);
    setComposerValue("");
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const payload = (await response.json()) as
        | ChatApiSuccessResponse
        | ChatApiErrorResponse;

      if (!response.ok || !("answer" in payload)) {
        throw new Error(getChatErrorMessage(payload));
      }

      if (payload.resolvedFollowUp?.kind === "resolved_action") {
        applyResolvedFollowUpAction(payload.resolvedFollowUp, requestExamTarget);
      }

      setMessages((previousMessages) => {
        const updatedMessages = [
          ...previousMessages,
          {
            id: createMessageId("assistant"),
            role: "assistant",
            content: payload.answer,
            answerKind: payload.answerKind,
            grounding: payload.grounding,
            requestId: payload.requestId,
            providerRequestId: payload.providerRequestId,
            conversationContext: payload.conversationContext,
            resolvedFollowUp: payload.resolvedFollowUp,
          },
        ];

        persistChatTranscript(updatedMessages);

        return updatedMessages;
      });
    } catch {
      setErrorMessage(genericChatErrorMessage);
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
