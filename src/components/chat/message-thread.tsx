import { AnswerActions } from "@/components/chat/answer-actions";
import { AnswerContent } from "@/components/chat/answer-content";
import type { ChatMessage } from "@/features/chat/types";

type MessageThreadProps = {
  messages: ChatMessage[];
  errorMessage: string | null;
  isLoading: boolean;
};

export function MessageThread({
  messages,
  errorMessage,
  isLoading,
}: MessageThreadProps) {
  if (messages.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">
          Chat Workspace
        </p>
        <div className="space-y-3">
          <h2 className="max-w-2xl font-serif text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            先问出你模糊记得的那个词，我们来把范围缩准。
          </h2>
          <p className="max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
            这里优先给你当前考试范围内的主答案，再顺手讲清楚附近易混词的边界，不把首页做成一长串搜索结果。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      {messages.map((message) => (
        <article
          key={message.id}
          className={`min-w-0 rounded-[1.5rem] border px-4 py-4 shadow-sm ${
            message.role === "user"
              ? "ml-auto max-w-xl border-sky-200 bg-sky-50 text-slate-900"
              : "border-slate-200 bg-white text-slate-800"
          }`}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {message.role === "user" ? "你的问题" : "EngGo 回答"}
          </p>
          <AnswerContent content={message.content} />
          {message.role === "assistant" && message.grounding ? (
            <div className="mt-4 space-y-3 rounded-[1.25rem] border border-slate-100 bg-slate-50 p-4">
              {message.grounding.resolution === "no_match" ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    暂未稳定命中
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    当前考试范围内暂时还没能稳定定位到对应词条，我先不硬猜，避免答错对象。
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      主答案
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {message.grounding.mainAnswer.map((item) => item.lemma).join(" / ")}
                    </p>
                  </div>
                  {message.grounding.confusionBoundary.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        易混边界
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {message.grounding.confusionBoundary
                          .map((item) => item.lemma)
                          .join(" / ")}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  下一步
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {message.grounding.followUpPrompt}
                </p>
              </div>
              <AnswerActions grounding={message.grounding} />
            </div>
          ) : null}
        </article>
      ))}
      {isLoading ? (
        <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
          正在根据当前考试范围组织回答...
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
