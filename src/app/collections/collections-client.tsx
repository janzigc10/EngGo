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
      <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-500">
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
