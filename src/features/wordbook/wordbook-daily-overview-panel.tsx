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
      className="flex flex-col justify-between rounded-lg border border-[#e5e1d7] bg-[#f8f8f6] p-5 shadow-[0_18px_56px_rgba(21,21,21,0.05)] sm:p-6"
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#8a5a10]">
            今日学习概览
          </p>
          <h3 className="text-2xl font-extrabold tracking-normal text-[#151515]">
            {overview.title}
          </h3>
          <p className="text-sm leading-7 text-[#6f6f68]">
            {overview.summary}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-y border-[#e5e1d7] py-4">
          {overview.metrics.map((metric) => (
            <div key={metric.label} className="min-w-0">
              <dt className="text-xs font-medium text-[#6f6f68]">
                {metric.label}
              </dt>
              <dd className="mt-1 text-2xl font-extrabold text-[#151515]">
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
              className={`block rounded-lg border bg-white px-4 py-3 text-[#151515] transition hover:bg-[#f8f8f6] focus:outline-none focus:ring-2 focus:ring-[#d08a18] focus:ring-offset-2 focus:ring-offset-[#f8f8f6] active:translate-y-px ${
                action.tone === "strong"
                  ? "border-[#d08a18]"
                  : "border-[#e5e1d7] hover:border-[#d08a18]"
              }`}
            >
              <span className="block text-sm font-semibold">{action.label}</span>
              <span className="mt-1 block text-xs leading-5 text-[#6f6f68]">
                {action.detail}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      <p className="mt-6 border-t border-[#e5e1d7] pt-4 text-sm leading-6 text-[#6f6f68]">
        {overview.wordbookLabel} · {overview.progressLabel}
      </p>
    </aside>
  );
}
