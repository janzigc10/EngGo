"use client";

import { ChatInput } from "@/components/chat/chat-input";
import { ExamplePrompts } from "@/components/chat/example-prompts";
import { MessageThread } from "@/components/chat/message-thread";
import { ExamTargetSwitcher } from "@/components/shell/exam-target-switcher";
import { useChatSession } from "@/features/chat/use-chat-session";

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
  } = useChatSession();

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
        <ChatInput
          value={composerValue}
          onChange={setComposerValue}
          onSubmit={() => submitPrompt()}
          isLoading={isLoading}
        />
      </div>
      <aside className="flex flex-col justify-between rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,_rgba(14,116,144,0.08),_rgba(255,255,255,0.96))] p-6 shadow-[0_20px_60px_rgba(14,116,144,0.10)]">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-800">
              今日工作区状态
            </p>
            <h3 className="font-serif text-2xl font-semibold text-slate-950">
              主舞台先保持安静，但方向很明确。
            </h3>
          </div>
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p>主答案优先来自当前考试范围。</p>
            <p>易混词解释放在回答里，而不是单独堆一页结果。</p>
            <p>后续的收藏、学习、复习，会放在二级入口慢慢长出来。</p>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4 text-sm text-slate-600">
          当前先把聊天主链路打通，等回答稳定后，再把收藏与学习入口接进来。
        </div>
      </aside>
    </section>
  );
}
