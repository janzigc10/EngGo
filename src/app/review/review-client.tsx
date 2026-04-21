"use client";

import dynamic from "next/dynamic";

const ReviewPanel = dynamic(
  () => import("@/features/collections/study-panels").then((module) => module.ReviewPanel),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-500">
        复习页正在加载占位内容...
      </div>
    ),
  },
);

export function ReviewClient() {
  return (
    <section className="w-full max-w-4xl">
      <ReviewPanel />
    </section>
  );
}
