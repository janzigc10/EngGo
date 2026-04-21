"use client";

import { useState, useSyncExternalStore } from "react";

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

function createMessageId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function toHistory(messages: ChatMessage[]): ChatHistoryMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

type UseChatSessionOptions = {
  initialExamTarget?: ExamTargetCode;
};

export function useChatSession(options: UseChatSessionOptions = {}) {
  const fallbackExamTarget = options.initialExamTarget ?? defaultExamTarget;
  const activeExamTarget = useSyncExternalStore(
    subscribeExamTarget,
    readStoredExamTarget,
    getServerExamTargetSnapshot,
  );
  const [composerValue, setComposerValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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

    setMessages(nextMessages);
    setComposerValue("");
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          activeExamTarget: activeExamTarget ?? fallbackExamTarget,
          query: prompt,
          history: toHistory(messages),
        }),
      });

      const payload = (await response.json()) as
        | ChatApiSuccessResponse
        | {
            error?: {
              message?: string;
            };
          };

      if (!response.ok || !("answer" in payload)) {
        throw new Error(payload.error?.message ?? genericChatErrorMessage);
      }

      setMessages((previousMessages) => [
        ...previousMessages,
        {
          id: createMessageId("assistant"),
          role: "assistant",
          content: payload.answer,
          grounding: payload.grounding,
          requestId: payload.requestId,
          providerRequestId: payload.providerRequestId,
        },
      ]);
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
