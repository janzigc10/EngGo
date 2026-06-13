"use client";

import dynamic from "next/dynamic";

const ReviewPanel = dynamic(
  () => import("@/features/collections/study-panels").then((module) => module.ReviewPanel),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-dashed border-[#d7d2c6] bg-white p-6 text-sm text-[#6f6f68]">
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
