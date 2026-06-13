"use client";

import dynamic from "next/dynamic";

const LearnPanel = dynamic(
  () => import("@/features/collections/study-panels").then((module) => module.LearnPanel),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-dashed border-[#d7d2c6] bg-white p-6 text-sm text-[#6f6f68]">
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
