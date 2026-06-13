"use client";

import { ChatInput } from "@/components/chat/chat-input";
import { MessageThread } from "@/components/chat/message-thread";
import { latestConversationContext } from "@/features/chat/conversation-context";
import type {
  ChatMessage,
  ConversationalLearningContext,
} from "@/features/chat/types";
import { isExamTargetCode } from "@/features/exam-target/model";
import { useChatSession } from "@/features/chat/use-chat-session";

function readDraftPromptFromLocation() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return new URLSearchParams(window.location.search).get("draft") ?? undefined;
}

function readInitialExamTargetFromLocation() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const value = new URLSearchParams(window.location.search).get("examTarget");

  return value && isExamTargetCode(value) ? value : undefined;
}

function buildContextHintLabel(context: ConversationalLearningContext) {
  const focusLabel = context.focus?.label?.trim();

  if (focusLabel) {
    return focusLabel;
  }

  return context.candidates
    .slice(0, 3)
    .map((candidate) => candidate.lemma)
    .filter(Boolean)
    .join(" / ");
}

function findLatestUnansweredAssistantMessage(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.role === "user") {
      return null;
    }

    if (message.role === "assistant") {
      return message;
    }
  }

  return null;
}

export function ChatWorkspace() {
  const {
    activeExamTarget,
    composerValue,
    errorMessage,
    isLoading,
    messages,
    setActiveExamTarget,
    setComposerValue,
    submitPrompt,
  } = useChatSession({
    initialPrompt: readDraftPromptFromLocation(),
    initialExamTarget: readInitialExamTargetFromLocation(),
  });
  const currentContext = latestConversationContext(messages, activeExamTarget);
  const contextHintLabel = currentContext ? buildContextHintLabel(currentContext) : "";
  const latestAssistantMessage = findLatestUnansweredAssistantMessage(messages);
  const clarificationOptions =
    latestAssistantMessage?.resolvedFollowUp?.kind === "clarification"
      ? latestAssistantMessage.resolvedFollowUp.options.slice(0, 5)
      : [];

  return (
    <section className="flex flex-1 justify-center">
      <div className="flex min-h-[calc(100dvh-9.5rem)] w-full max-w-3xl min-w-0 flex-col">
        <MessageThread
          messages={messages}
          errorMessage={errorMessage}
          isLoading={isLoading}
        />
        {contextHintLabel || clarificationOptions.length > 0 ? (
          <div className="mt-4 space-y-2">
            {contextHintLabel ? (
              <p className="sr-only" data-testid="conversation-context-hint">
                正在追问：{contextHintLabel}
              </p>
            ) : null}
            {clarificationOptions.length > 0 ? (
              <div className="flex flex-wrap gap-2" aria-label="澄清选项">
                {clarificationOptions.map((option) => {
                  const optionPrompt = `${option.lemma} 是什么意思`;

                  return (
                    <button
                      key={`${option.index}-${option.lemma}`}
                      type="button"
                      onClick={() => setComposerValue(optionPrompt)}
                      className="rounded-full border border-[#dedacf] bg-white px-3 py-1.5 text-xs font-medium text-[#6f6f68] transition hover:border-[#d08a18] hover:text-[#151515]"
                    >
                      {optionPrompt}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
        <ChatInput
          value={composerValue}
          onChange={setComposerValue}
          onSubmit={() => submitPrompt()}
          isLoading={isLoading}
          activeExamTarget={activeExamTarget}
          onExamTargetChange={setActiveExamTarget}
        />
      </div>
    </section>
  );
}
