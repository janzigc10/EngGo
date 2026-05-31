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
  saveActiveWordbookId,
  subscribeActiveWordbookChanges,
} from "@/features/wordbook/wordbook-active-store";
import { listWordbooks } from "@/features/wordbook/wordbook-data";
import {
  buildWordbookProgressExplanations,
  buildWordbookProgressSnapshot,
  getWordbookProgressVersion,
  loadProgressRecords,
  subscribeWordbookProgressChanges,
} from "@/features/wordbook/wordbook-progress-store";
import { WordbookStudySettingsPanel } from "@/features/wordbook/wordbook-study-settings-panel";
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

  const wordbooks = listWordbooks();
  const wordbook = loadActiveWordbook();
  const settings = loadWordbookStudySettings();
  const snapshot = buildWordbookProgressSnapshot(
    wordbook,
    new Date(),
    loadProgressRecords(),
  );
  const explanations = buildWordbookProgressExplanations(snapshot);
  const progressPercent =
    snapshot.total > 0 ? Math.round((snapshot.passed / snapshot.total) * 100) : 0;
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

  function startFreshSession() {
    clearActiveStudySession({ mode, wordbookId: wordbook.id });
    onStartSession(mode, targetCount, wordbook.id);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">
          {isLearn ? "Learn" : "Review"}
        </p>
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-slate-950">
          {wordbook.label}
        </h2>
      </div>

      <section className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm text-slate-500">{wordbook.sourceLabel}</p>
            <p className="text-base font-semibold text-slate-950">
              当前词书：{wordbook.label}
            </p>
            <p className="text-base font-medium text-slate-950">
              当前考试目标：{getExamTargetLabel(activeExamTarget)}
            </p>
            {activeExamTarget === "postgrad" ? (
              <p className="max-w-2xl text-sm leading-6 text-amber-700">
                考研词书还没接入可机读来源，先用 CET-6 基础词书 V1。
              </p>
            ) : null}
          </div>
          <Link
            href="/collections"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:text-sky-900"
          >
            查看收藏
          </Link>
        </div>
        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {wordbooks.length === 1 ? (
            <p>
              目前只接入这一本静态词书；后续新增词书时会在这里切换，Learn / Review
              会继续沿用同一套状态机。
            </p>
          ) : (
            <div className="flex flex-wrap gap-2" role="group" aria-label="选择词书">
              {wordbooks.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => saveActiveWordbookId(option.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                    option.id === wordbook.id
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Metric label="总词数" value={snapshot.total} />
          <Metric label={isLearn ? "未学习" : "已通过"} value={isLearn ? snapshot.unseen : snapshot.passed} />
          <Metric label={thirdMetric.label} value={thirdMetric.value} />
          <Metric label="待复习" value={snapshot.dueReview} />
        </div>

        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>掌握进度</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          {explanations
            .filter((item) =>
              isLearn
                ? item.key === "unseen" || item.key === "learning" || item.key === "dueReview"
                : item.key === "dueReview" || item.key === "reviewRescue" || item.key === "scheduledReview",
            )
            .map((item) => (
              <p key={item.key} className="rounded-2xl bg-slate-50 px-4 py-3">
                <span className="font-semibold text-slate-950">
                  {item.label} {item.value}
                </span>
                ：{item.description}
              </p>
            ))}
        </div>

        {activeSession && activeSessionLabel ? (
          <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  有一轮 {isLearn ? "Learn" : "Review"} 正在进行
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  继续 {isLearn ? "Learn" : "Review"} {activeSessionLabel}
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
                  className="inline-flex h-10 items-center justify-center rounded-full bg-sky-900 px-4 text-sm font-semibold text-white transition hover:bg-sky-800"
                >
                  继续
                </button>
                <button
                  type="button"
                  onClick={startFreshSession}
                  disabled={primaryCount === 0}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-sky-200 bg-white px-4 text-sm font-semibold text-sky-900 transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                >
                  重新开始
                </button>
                <button
                  type="button"
                  onClick={() =>
                    clearActiveStudySession({ mode, wordbookId: wordbook.id })
                  }
                  className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
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
            className="inline-flex h-11 min-w-36 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {activeSession ? restartLabel : primaryLabel} ({primaryCount})
          </button>
          {emptyMessage ? (
            <span className="max-w-xl text-sm leading-6 text-slate-500">
              {emptyMessage}
            </span>
          ) : null}
        </div>
      </section>

      <WordbookStudySettingsPanel settings={settings} />
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
