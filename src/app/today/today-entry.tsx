import Link from "next/link";

import { WordbookDailyOverviewPanel } from "@/features/wordbook/wordbook-daily-overview-panel";

const entryLinks = [
  {
    href: "/learn",
    label: "Learn",
    title: "学习新词",
    detail: "按当前词书和学习设置开始或继续一轮。",
  },
  {
    href: "/review",
    label: "Review",
    title: "复习到期词",
    detail: "处理已到期和补救队列，不改动现有节奏。",
  },
  {
    href: "/chat",
    label: "Chat",
    title: "回到聊天",
    detail: "查词、辨析、收藏后继续追问。",
  },
];

export function TodayEntry() {
  return (
    <section className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col justify-between rounded-lg border border-[#e5e1d7] bg-[#f8f8f6] p-5 shadow-[0_18px_56px_rgba(21,21,21,0.05)] sm:p-7">
        <div className="max-w-3xl space-y-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#8a5a10]">
            Today
          </p>
          <h1 className="text-3xl font-extrabold tracking-normal text-[#151515] sm:text-4xl">
            今天从哪里开始
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-[#6f6f68]">
            学习、复习和聊天入口都保留在这里；状态只负责摊开，不替你排序。
          </p>
        </div>

        <nav aria-label="今日入口" className="mt-8 grid gap-3 sm:grid-cols-3">
          {entryLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-lg border border-[#e5e1d7] bg-white px-4 py-4 text-[#151515] transition hover:border-[#d08a18] hover:bg-[#f8f8f6] focus:outline-none focus:ring-2 focus:ring-[#d08a18] focus:ring-offset-2 focus:ring-offset-[#f8f8f6] active:translate-y-px"
            >
              <span className="block text-xs font-extrabold uppercase tracking-[0.14em] text-[#8a5a10]">
                {item.label}
              </span>
              <span className="mt-2 block text-base font-extrabold text-[#151515]">
                {item.title}
              </span>
              <span className="mt-2 block text-sm leading-6 text-[#6f6f68]">
                {item.detail}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      <WordbookDailyOverviewPanel />
    </section>
  );
}
