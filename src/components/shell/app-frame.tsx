import type { ReactNode } from "react";

import { AppNav } from "@/components/shell/app-nav";

type AppFrameProps = {
  children: ReactNode;
};

export function AppFrame({ children }: AppFrameProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(209,230,255,0.95),_rgba(246,248,252,0.92)_34%,_#f8fafc_70%)] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-5 rounded-[2rem] border border-white/70 bg-white/80 px-6 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
              Exam-Focused English Learning
            </p>
            <h1
              className="font-serif text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl"
              data-testid="workspace-title"
            >
              EngGo 聊天工作台
            </h1>
          </div>
          <AppNav />
        </header>
        <main className="flex flex-1 py-8">{children}</main>
      </div>
    </div>
  );
}
