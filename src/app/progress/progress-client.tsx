"use client";

import dynamic from "next/dynamic";

const ProgressPanel = dynamic(
  () =>
    import("@/features/collections/study-panels").then(
      (module) => module.ProgressPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-500">
        进度页正在加载统计数据...
      </div>
    ),
  },
);

export function ProgressClient() {
  return (
    <section className="w-full max-w-4xl">
      <ProgressPanel />
    </section>
  );
}
