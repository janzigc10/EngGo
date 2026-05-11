import { AnswerActions } from "@/components/chat/answer-actions";
import { AnswerContent } from "@/components/chat/answer-content";
import type { ChatMessage } from "@/features/chat/types";

const loadingSteps = ["正在检索当前范围词条", "整理易混边界", "组织可读答案"];

type MessageThreadProps = {
  messages: ChatMessage[];
  errorMessage: string | null;
  isLoading: boolean;
};

function hasExternalDictionarySource(grounding: NonNullable<ChatMessage["grounding"]>) {
  return (
    grounding.matchType === "external_dictionary_exact"
    || grounding.mainAnswer.some(
      (candidate) => candidate.sourceKind === "external_dictionary_basic",
    )
  );
}

function hasSourceLemmaSource(grounding: NonNullable<ChatMessage["grounding"]>) {
  return (
    grounding.matchType === "source_lemma_exact"
    || grounding.mainAnswer.some((candidate) => candidate.sourceKind === "source_lemma")
  );
}

function buildHitSummary(grounding: NonNullable<ChatMessage["grounding"]>) {
  const count = grounding.mainAnswer.length;
  const firstLemma = grounding.mainAnswer[0]?.lemma;

  if (hasExternalDictionarySource(grounding)) {
    if (count === 1 && firstLemma) {
      return `已找到 1 条外部基础释义：${firstLemma}`;
    }

    return `已找到 ${count} 条外部基础释义`;
  }

  if (hasSourceLemmaSource(grounding)) {
    if (count === 1 && firstLemma) {
      return `已命中 1 个来源词表词：${firstLemma}`;
    }

    return `已命中 ${count} 个来源词表词`;
  }

  if (count === 1 && firstLemma) {
    return `已命中 1 个当前范围词：${firstLemma}`;
  }

  return `已命中 ${count} 个当前范围词`;
}

function buildSourceNote(grounding: NonNullable<ChatMessage["grounding"]>) {
  if (hasExternalDictionarySource(grounding)) {
    return "来自外部基础词典，适合先理解意思；暂不产生易混词、词根族或考试优先级判断。";
  }

  if (hasSourceLemmaSource(grounding)) {
    return "这个词在当前考试来源词表内，但还不是 EngGo 人工结构化词条；释义先按基础释义理解。";
  }

  return null;
}

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
                    当前词库暂未稳定定位到对应词条，我先不硬猜，避免答错对象。
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      命中状态
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {buildHitSummary(message.grounding)}
                    </p>
                  </div>
                  {buildSourceNote(message.grounding) ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        来源说明
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {buildSourceNote(message.grounding)}
                      </p>
                    </div>
                  ) : null}
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
        <div
          aria-live="polite"
          className="rounded-[1.5rem] border border-sky-100 bg-sky-50/70 px-4 py-4 text-sm text-slate-700 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="mt-1 flex h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500 shadow-[0_0_0_6px_rgba(14,165,233,0.14)]" />
            <div className="min-w-0 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-800">
                  EngGo 正在工作
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  先锁定范围内证据，再把回答整理成能直接看的学习材料。
                </p>
              </div>
              <ol className="grid gap-2 sm:grid-cols-3">
                {loadingSteps.map((step, index) => (
                  <li
                    key={step}
                    className="flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-2 text-xs font-medium text-slate-600"
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        index === 0 ? "bg-sky-500" : "bg-slate-300"
                      }`}
                    />
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
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
