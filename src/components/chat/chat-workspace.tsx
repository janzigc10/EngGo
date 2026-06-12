"use client";

import { ChatInput } from "@/components/chat/chat-input";
import { ExamplePrompts } from "@/components/chat/example-prompts";
import { MessageThread } from "@/components/chat/message-thread";
import { ExamTargetSwitcher } from "@/components/shell/exam-target-switcher";
import { latestConversationContext } from "@/features/chat/conversation-context";
import type {
  ChatMessage,
  ConversationalLearningContext,
} from "@/features/chat/types";
import { isExamTargetCode } from "@/features/exam-target/model";
import { useChatSession } from "@/features/chat/use-chat-session";
import { WordbookDailyOverviewPanel } from "@/features/wordbook/wordbook-daily-overview-panel";

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
    examplePrompts,
    isLoading,
    messages,
    chooseExamplePrompt,
    setActiveExamTarget,
    setComposerValue,
    submitPrompt,
  } = useChatSession({
    initialPrompt: readDraftPromptFromLocation(),
    initialExamTarget: readInitialExamTargetFromLocation(),
  });
  const currentContext = latestConversationContext(messages, activeExamTarget);
  const contextHintLabel = currentContext
    ? buildContextHintLabel(currentContext)
    : "";
  const latestAssistantMessage = findLatestUnansweredAssistantMessage(messages);
  const clarificationOptions =
    latestAssistantMessage?.resolvedFollowUp?.kind === "clarification"
      ? latestAssistantMessage.resolvedFollowUp.options.slice(0, 5)
      : [];

  return (
    <section className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
      <div className="flex min-h-[560px] min-w-0 flex-col justify-between rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.06)] backdrop-blur sm:p-8">
        <div className="space-y-6">
          <ExamTargetSwitcher
            activeExamTarget={activeExamTarget}
            onChange={setActiveExamTarget}
          />
          <MessageThread
            messages={messages}
            errorMessage={errorMessage}
            isLoading={isLoading}
          />
          <ExamplePrompts
            prompts={examplePrompts}
            onSelect={chooseExamplePrompt}
          />
        </div>
        {contextHintLabel || clarificationOptions.length > 0 ? (
          <div className="mt-6 space-y-3">
            {contextHintLabel ? (
              <p className="text-xs text-slate-500">
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
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-sky-300 hover:text-sky-900"
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
        />
      </div>
      <WordbookDailyOverviewPanel />
    </section>
  );
}
