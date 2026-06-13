"use client";

import dynamic from "next/dynamic";

const CollectionsPanel = dynamic(
  () =>
    import("@/features/collections/study-panels").then(
      (module) => module.CollectionsPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-dashed border-[#d7d2c6] bg-white p-6 text-sm text-[#6f6f68]">
        收藏页正在加载本地收藏数据...
      </div>
    ),
  },
);

export function CollectionsClient() {
  return (
    <section className="w-full max-w-4xl">
      <CollectionsPanel />
    </section>
  );
}
