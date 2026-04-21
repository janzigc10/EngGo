"use client";

import dynamic from "next/dynamic";

const LearnPanel = dynamic(
  () => import("@/features/collections/study-panels").then((module) => module.LearnPanel),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-500">
        学习页正在加载当前考试目标...
      </div>
    ),
  },
);

export function LearnClient() {
  return (
    <section className="w-full max-w-4xl">
      <LearnPanel />
    </section>
  );
}
