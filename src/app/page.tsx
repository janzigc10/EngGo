import { AppFrame } from "@/components/shell/app-frame";

export default function Home() {
  const examplePrompts = [
    "遵从怎么说",
    "有个像 institute 的词",
    "restrain 和 constrain 的区别",
    "为什么我总把 comply 和 conform 搞混",
  ];

  return (
    <AppFrame>
      <section className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
        <div className="flex min-h-[560px] flex-col justify-between rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.06)] backdrop-blur sm:p-8">
          <div className="space-y-6">
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
            <div className="grid gap-3 sm:grid-cols-2">
              {examplePrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4 pt-8">
            <label
              htmlFor="chat-input"
              className="text-sm font-medium text-slate-700"
            >
              试着输入中文意思、半截拼写，或者直接问两个词的区别
            </label>
            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-3 shadow-inner shadow-slate-200/50">
              <textarea
                id="chat-input"
                data-testid="chat-input"
                className="min-h-32 w-full resize-none rounded-[1.25rem] border-0 bg-white px-4 py-4 text-base leading-7 text-slate-900 outline-none ring-0 placeholder:text-slate-400"
                placeholder="比如：遵从怎么说"
                defaultValue=""
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                  回答会优先锁定 CET-6 范围内的词组。
                </p>
                <button
                  type="button"
                  className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-700"
                >
                  开始提问
                </button>
              </div>
            </div>
          </div>
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
            这还是空状态工作台，但已经具备了聊天主舞台需要的标题、范围提示、示例提问和输入区。
          </div>
        </aside>
      </section>
    </AppFrame>
  );
}
