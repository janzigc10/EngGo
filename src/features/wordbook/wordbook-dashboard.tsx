"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import {
  getServerExamTargetSnapshot,
  readStoredExamTarget,
  subscribeExamTarget,
} from "@/features/exam-target/exam-target-store";
import { getExamTargetLabel } from "@/features/exam-target/model";
import {
  clearActiveStudySession,
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
import {
  buildWordbookProgressSnapshot,
  getWordbookProgressVersion,
  loadProgressRecords,
  subscribeWordbookProgressChanges,
} from "@/features/wordbook/wordbook-progress-store";
import {
  getServerWordbookStudySettingsSnapshot,
  getWordbookStudySettingsSnapshot,
  loadWordbookStudySettings,
  subscribeWordbookStudySettings,
} from "@/features/wordbook/wordbook-study-settings-store";
import type {
  StudyMode,
  StudySessionGoal,
  WordbookId,
} from "@/features/wordbook/wordbook-types";

type WordbookDashboardProps = {
  mode: StudyMode;
  onStartSession: (
    mode: StudyMode,
    targetCount: StudySessionGoal,
    wordbookId: WordbookId,
  ) => void;
};

function useProgressVersion() {
  return useSyncExternalStore(
    subscribeWordbookProgressChanges,
    getWordbookProgressVersion,
    () => "server",
  );
}

function useActiveSessionVersion() {
  return useSyncExternalStore(
    subscribeActiveStudySessionChanges,
    getActiveStudySessionVersion,
    getServerActiveStudySessionSnapshot,
  );
}

export function WordbookDashboard({ mode, onStartSession }: WordbookDashboardProps) {
  const activeExamTarget = useSyncExternalStore(
    subscribeExamTarget,
    readStoredExamTarget,
    getServerExamTargetSnapshot,
  );
  useProgressVersion();
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
  useActiveSessionVersion();

  const wordbook = loadActiveWordbook();
  const settings = loadWordbookStudySettings();
  const snapshot = buildWordbookProgressSnapshot(
    wordbook,
    new Date(),
    loadProgressRecords(),
  );
  const isLearn = mode === "learn";
  const primaryCount = isLearn ? snapshot.learnable : snapshot.dueReview;
  const targetCount = isLearn
    ? settings.learnTargetCount
    : settings.reviewTargetCount;
  const primaryLabel = isLearn ? "开始 Learn" : "开始 Review";
  const restartLabel = isLearn ? "重新开始 Learn" : "重新开始 Review";
  const emptyMessage = getDashboardEmptyMessage(mode, snapshot);
  const activeSession = loadActiveStudySession({ mode, wordbookId: wordbook.id });
  const activeSessionLabel = activeSession
    ? `${activeSession.state.completedTargetLemmas.length} / ${activeSession.state.totalTargets}`
    : null;
  const thirdMetric = isLearn
    ? { label: "学习中", value: snapshot.learning }
    : { label: "补救中", value: snapshot.reviewRescue };
  const modeLabel = isLearn ? "Learn" : "Review";
  const primaryMetricLabel = isLearn ? "可学习" : "待复习";
  const secondaryMetric = isLearn
    ? { label: "待复习", value: snapshot.dueReview }
    : { label: "已通过", value: snapshot.passed };

  function startFreshSession() {
    clearActiveStudySession({ mode, wordbookId: wordbook.id });
    onStartSession(mode, targetCount, wordbook.id);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.5rem] border border-[#e5e1d7] bg-white/95 p-5 shadow-[0_18px_54px_rgba(21,21,21,0.06)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-[#8a5a10]">
              {modeLabel}
            </p>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#151515]">
              {modeLabel} session
            </h2>
            <p className="text-sm leading-6 text-[#6f6f68]">
              当前词书：{wordbook.label}
            </p>
          </div>
          <Link
            href="/wordbook"
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-[#dedacf] bg-[#fbfaf7] px-4 text-sm font-extrabold text-[#151515] transition hover:border-[#d08a18] hover:bg-white active:translate-y-px"
          >
            管理词书
          </Link>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryItem
            label="考试目标"
            value={getExamTargetLabel(activeExamTarget)}
          />
          <SummaryItem label="本轮数量" value={`${targetCount}`} />
          <SummaryItem label="来源" value={wordbook.sourceLabel} />
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-[#e5e1d7] bg-white/95 p-5 shadow-sm sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label={primaryMetricLabel} value={primaryCount} />
          <Metric label={thirdMetric.label} value={thirdMetric.value} />
          <Metric label={secondaryMetric.label} value={secondaryMetric.value} />
        </div>

        {activeSession && activeSessionLabel ? (
          <div className="mt-6 rounded-2xl border border-[#d08a18] bg-[#fff6df] px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-extrabold text-[#151515]">
                  有一轮 {modeLabel} 正在进行
                </p>
                <p className="mt-1 text-sm text-[#5f5b52]">
                  继续 {modeLabel} {activeSessionLabel}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onStartSession(
                      mode,
                      activeSession.targetCount,
                      activeSession.wordbookId,
                    )
                  }
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#151515] px-4 text-sm font-extrabold text-white transition hover:bg-[#2a2926] active:translate-y-px"
                >
                  继续
                </button>
                <button
                  type="button"
                  onClick={startFreshSession}
                  disabled={primaryCount === 0}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#d08a18] bg-white px-4 text-sm font-extrabold text-[#151515] transition hover:bg-[#fbfaf7] active:translate-y-px disabled:cursor-not-allowed disabled:border-[#dedacf] disabled:text-[#aaa49a]"
                >
                  重新开始
                </button>
                <button
                  type="button"
                  onClick={() =>
                    clearActiveStudySession({ mode, wordbookId: wordbook.id })
                  }
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#dedacf] bg-white px-4 text-sm font-extrabold text-[#5f5b52] transition hover:border-[#b85f4c] hover:bg-[#fff5f2] hover:text-[#9f3e2f] active:translate-y-px"
                >
                  放弃本轮
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={primaryCount === 0}
            onClick={activeSession ? startFreshSession : () => onStartSession(mode, targetCount, wordbook.id)}
            className="inline-flex min-h-11 min-w-36 items-center justify-center rounded-xl bg-[#151515] px-5 text-sm font-extrabold text-white transition hover:bg-[#2a2926] active:translate-y-px disabled:cursor-not-allowed disabled:bg-[#c8c1b4]"
          >
            {activeSession ? restartLabel : primaryLabel} ({primaryCount})
          </button>
          {emptyMessage ? (
            <span className="max-w-xl text-sm leading-6 text-[#6f6f68]">
              {emptyMessage}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function getDashboardEmptyMessage(
  mode: StudyMode,
  snapshot: ReturnType<typeof buildWordbookProgressSnapshot>,
) {
  if (mode === "learn") {
    if (snapshot.learnable > 0) {
      return null;
    }

    if (snapshot.dueReview > 0) {
      return "现在没有新词可学，先去 Review 处理到期或补救词。";
    }

    if (snapshot.passed + snapshot.blocked >= snapshot.total) {
      return "这本词书当前没有可学新词，也暂时没有到期复习。";
    }

    return "现在没有可学习词。";
  }

  if (snapshot.dueReview > 0) {
    return null;
  }

  if (snapshot.passed === 0) {
    return "先完成 Learn，Review 会在词到期后出现。";
  }

  return "现在没有到期复习词；未到期词会按调度时间回来。";
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#eee9de] bg-[#fbfaf7] px-4 py-3">
      <p className="text-xs font-semibold text-[#6f6f68]">{label}</p>
      <p className="mt-1 truncate text-sm font-extrabold text-[#151515]">
        {value}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#eee9de] bg-[#fbfaf7] px-4 py-3">
      <p className="text-xs font-semibold text-[#6f6f68]">{label}</p>
      <p className="mt-1 text-3xl font-extrabold text-[#151515]">{value}</p>
    </div>
  );
}
