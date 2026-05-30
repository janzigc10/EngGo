"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import {
  getServerExamTargetSnapshot,
  readStoredExamTarget,
  subscribeExamTarget,
} from "@/features/exam-target/exam-target-store";
import { getExamTargetLabel } from "@/features/exam-target/model";
import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import {
  buildWordbookProgressSnapshot,
  getWordbookProgressVersion,
  loadProgressRecords,
  subscribeWordbookProgressChanges,
} from "@/features/wordbook/wordbook-progress-store";
import type { StudyMode } from "@/features/wordbook/wordbook-types";

type WordbookDashboardProps = {
  mode: StudyMode;
  onStartSession: (mode: StudyMode) => void;
};

function useProgressVersion() {
  return useSyncExternalStore(
    subscribeWordbookProgressChanges,
    getWordbookProgressVersion,
    () => "server",
  );
}

export function WordbookDashboard({ mode, onStartSession }: WordbookDashboardProps) {
  const activeExamTarget = useSyncExternalStore(
    subscribeExamTarget,
    readStoredExamTarget,
    getServerExamTargetSnapshot,
  );
  useProgressVersion();

  const wordbook = getDefaultWordbook();
  const snapshot = buildWordbookProgressSnapshot(
    wordbook,
    new Date(),
    loadProgressRecords(),
  );
  const progressPercent =
    snapshot.total > 0 ? Math.round((snapshot.passed / snapshot.total) * 100) : 0;
  const isLearn = mode === "learn";
  const primaryCount = isLearn ? snapshot.learnable : snapshot.dueReview;
  const primaryLabel = isLearn ? "开始 Learn" : "开始 Review";
  const thirdMetric = isLearn
    ? { label: "可学习", value: snapshot.learnable }
    : { label: "未到期", value: Math.max(snapshot.passed - snapshot.dueReview, 0) };

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

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Metric label="总词数" value={snapshot.total} />
          <Metric label="已学会" value={snapshot.passed} />
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

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={primaryCount === 0}
            onClick={() => onStartSession(mode)}
            className="inline-flex h-11 min-w-36 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {primaryLabel} ({primaryCount})
          </button>
          {!isLearn && snapshot.dueReview === 0 ? (
            <span className="text-sm text-slate-500">现在没有到期复习词。</span>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
