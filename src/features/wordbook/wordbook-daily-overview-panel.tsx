"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import {
  getActiveStudySessionVersion,
  getServerActiveStudySessionSnapshot,
  loadActiveStudySession,
  subscribeActiveStudySessionChanges,
} from "@/features/wordbook/wordbook-active-session-store";
import {
  getActiveWordbookSnapshot,
  getServerActiveWordbookSnapshot,
  loadActiveWordbook,
  subscribeActiveWordbookChanges,
} from "@/features/wordbook/wordbook-active-store";
import { buildWordbookDailyOverview } from "@/features/wordbook/wordbook-daily-overview";
import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import {
  buildWordbookProgressSnapshot,
  getWordbookProgressVersion,
  loadProgressRecords,
  subscribeWordbookProgressChanges,
} from "@/features/wordbook/wordbook-progress-store";
import {
  defaultWordbookStudySettings,
  getServerWordbookStudySettingsSnapshot,
  getWordbookStudySettingsSnapshot,
  loadWordbookStudySettings,
  subscribeWordbookStudySettings,
} from "@/features/wordbook/wordbook-study-settings-store";

function subscribeClientReady() {
  return () => {};
}

function useHasMounted() {
  return useSyncExternalStore(
    subscribeClientReady,
    () => true,
    () => false,
  );
}

function useWordbookDailyOverview(hasMounted: boolean) {
  useSyncExternalStore(
    subscribeWordbookProgressChanges,
    getWordbookProgressVersion,
    () => "server",
  );
  useSyncExternalStore(
    subscribeWordbookStudySettings,
    getWordbookStudySettingsSnapshot,
    getServerWordbookStudySettingsSnapshot,
  );
  useSyncExternalStore(
    subscribeActiveWordbookChanges,
    getActiveWordbookSnapshot,
    getServerActiveWordbookSnapshot,
  );
  useSyncExternalStore(
    subscribeActiveStudySessionChanges,
    getActiveStudySessionVersion,
    getServerActiveStudySessionSnapshot,
  );

  if (!hasMounted) {
    const wordbook = getDefaultWordbook();

    return buildWordbookDailyOverview({
      wordbook,
      snapshot: buildWordbookProgressSnapshot(wordbook, new Date(), []),
      settings: defaultWordbookStudySettings,
      activeLearnSession: null,
      activeReviewSession: null,
    });
  }

  const wordbook = loadActiveWordbook();
  const snapshot = buildWordbookProgressSnapshot(
    wordbook,
    new Date(),
    loadProgressRecords(),
  );

  return buildWordbookDailyOverview({
    wordbook,
    snapshot,
    settings: loadWordbookStudySettings(),
    activeLearnSession: loadActiveStudySession({
      mode: "learn",
      wordbookId: wordbook.id,
    }),
    activeReviewSession: loadActiveStudySession({
      mode: "review",
      wordbookId: wordbook.id,
    }),
  });
}

export function WordbookDailyOverviewPanel() {
  const hasMounted = useHasMounted();
  const overview = useWordbookDailyOverview(hasMounted);

  return (
    <aside
      aria-label="今日学习概览"
      className="flex flex-col justify-between rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,_rgba(14,116,144,0.08),_rgba(255,255,255,0.96))] p-6 shadow-[0_20px_60px_rgba(14,116,144,0.10)]"
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-800">
            今日学习概览
          </p>
          <h3 className="font-serif text-2xl font-semibold text-slate-950">
            {overview.title}
          </h3>
          <p className="text-sm leading-7 text-slate-700">
            {overview.summary}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-y border-sky-100/80 py-4">
          {overview.metrics.map((metric) => (
            <div key={metric.label} className="min-w-0">
              <dt className="text-xs text-slate-500">{metric.label}</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-950">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>

        <nav aria-label="学习入口" className="space-y-2">
          {overview.actions.map((action) => (
            <Link
              key={action.kind}
              href={action.href}
              className={`block rounded-2xl border px-4 py-3 transition active:translate-y-px ${
                action.tone === "strong"
                  ? "border-slate-950 bg-slate-950 text-white hover:bg-slate-800"
                  : "border-slate-200 bg-white/80 text-slate-800 hover:border-sky-200 hover:bg-white"
              }`}
            >
              <span className="block text-sm font-semibold">{action.label}</span>
              <span
                className={`mt-1 block text-xs leading-5 ${
                  action.tone === "strong" ? "text-slate-200" : "text-slate-500"
                }`}
              >
                {action.detail}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      <p className="mt-6 border-t border-white/80 pt-4 text-sm leading-6 text-slate-600">
        {overview.wordbookLabel} · {overview.progressLabel}
      </p>
    </aside>
  );
}
