"use client";

import Link from "next/link";
import { useId, useSyncExternalStore } from "react";

import {
  persistExamTarget,
  readStoredExamTarget,
  subscribeExamTarget,
  getServerExamTargetSnapshot,
} from "@/features/exam-target/exam-target-store";
import { getExamTargetLabel } from "@/features/exam-target/model";
import {
  getActiveWordbookSnapshot,
  getServerActiveWordbookSnapshot,
  loadActiveWordbook,
  saveActiveWordbookId,
  subscribeActiveWordbookChanges,
} from "@/features/wordbook/wordbook-active-store";
import {
  getDefaultWordbook,
  listWordbooks,
} from "@/features/wordbook/wordbook-data";
import {
  buildWordbookDailyActivitySeries,
  getServerWordbookDailyStatsSnapshot,
  getWordbookDailyStatsSnapshot,
  loadWordbookDailyStats,
  subscribeWordbookDailyStatsChanges,
  type WordbookDailyActivityDay,
} from "@/features/wordbook/wordbook-daily-stats-store";
import {
  buildWordbookProgressExplanations,
  buildWordbookProgressSnapshot,
  getWordbookProgressVersion,
  loadProgressRecords,
  subscribeWordbookProgressChanges,
} from "@/features/wordbook/wordbook-progress-store";
import { WordbookStudySettingsPanel } from "@/features/wordbook/wordbook-study-settings-panel";
import {
  defaultWordbookStudySettings,
  getServerWordbookStudySettingsSnapshot,
  getWordbookStudySettingsSnapshot,
  loadWordbookStudySettings,
  subscribeWordbookStudySettings,
} from "@/features/wordbook/wordbook-study-settings-store";
import type { Wordbook } from "@/features/wordbook/wordbook-types";

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

function useWordbookManagementSnapshot() {
  const hasMounted = useHasMounted();
  const activeExamTarget = useSyncExternalStore(
    subscribeExamTarget,
    readStoredExamTarget,
    getServerExamTargetSnapshot,
  );

  useSyncExternalStore(
    subscribeActiveWordbookChanges,
    getActiveWordbookSnapshot,
    getServerActiveWordbookSnapshot,
  );

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
    subscribeWordbookDailyStatsChanges,
    getWordbookDailyStatsSnapshot,
    getServerWordbookDailyStatsSnapshot,
  );

  const wordbook = hasMounted ? loadActiveWordbook() : getDefaultWordbook();
  const snapshot = buildWordbookProgressSnapshot(
    wordbook,
    new Date(),
    hasMounted ? loadProgressRecords() : [],
  );

  return {
    activeExamTarget: hasMounted ? activeExamTarget : wordbook.examTarget,
    dailyActivity: buildWordbookDailyActivitySeries({
      wordbookId: wordbook.id,
      records: hasMounted ? loadWordbookDailyStats() : [],
    }),
    explanations: buildWordbookProgressExplanations(snapshot),
    progressPercent:
      snapshot.total > 0 ? Math.round((snapshot.passed / snapshot.total) * 100) : 0,
    settings: hasMounted ? loadWordbookStudySettings() : defaultWordbookStudySettings,
    snapshot,
    wordbook,
    wordbooks: listWordbooks(),
  };
}

export function WordbookManagementPanel() {
  const {
    activeExamTarget,
    dailyActivity,
    explanations,
    progressPercent,
    settings,
    snapshot,
    wordbook,
    wordbooks,
  } = useWordbookManagementSnapshot();

  function selectWordbook(option: Wordbook) {
    saveActiveWordbookId(option.id);
    persistExamTarget(option.examTarget);
  }

  return (
    <div className="w-full space-y-5">
      <section className="rounded-[1.5rem] border border-[#e5e1d7] bg-white/95 p-5 shadow-[0_18px_54px_rgba(21,21,21,0.06)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-[#8a5a10]">
              Wordbook
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#151515] sm:text-4xl">
              {wordbook.label}
            </h1>
            <p className="text-sm leading-7 text-[#6f6f68]">
              这里只处理词书切换、学习设置和进度数据；真正开始学习或复习时再进入 Learn / Review。
            </p>
          </div>
          <div className="rounded-2xl border border-[#e5e1d7] bg-[#fbfaf7] px-4 py-3 text-sm text-[#6f6f68]">
            <p className="font-semibold text-[#151515]">
              当前考试目标：{getExamTargetLabel(activeExamTarget)}
            </p>
            <p className="mt-1">{wordbook.sourceLabel}</p>
          </div>
        </div>

        <div
          className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          role="group"
          aria-label="选择词书"
        >
          {wordbooks.map((option) => {
            const active = option.id === wordbook.id;

            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => selectWordbook(option)}
                className={`min-h-24 rounded-2xl border px-4 py-3 text-left transition active:translate-y-px ${
                  active
                    ? "border-[#151515] bg-[#d08a18] text-[#151515]"
                    : "border-[#dedacf] bg-[#fbfaf7] text-[#151515] hover:border-[#d08a18] hover:bg-white"
                }`}
              >
                <span className="block text-sm font-extrabold">
                  {getExamTargetLabel(option.examTarget)}
                </span>
                <span className="mt-2 block text-xs leading-5 text-[#5f5b52]">
                  {option.entries.length} 个词
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-[#e5e1d7] bg-white/95 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-[#151515]">
              词书进度
            </h2>
            <p className="mt-1 text-sm text-[#6f6f68]">
              {snapshot.passed} / {snapshot.total} 已阶段通过
            </p>
          </div>
          <div className="text-sm font-semibold text-[#151515]">
            {progressPercent}%
          </div>
        </div>

        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-[#ece7db]"
          role="progressbar"
          aria-label="词书进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
        >
          <div
            className="h-full rounded-full bg-[#d08a18]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Metric label="总词数" value={snapshot.total} />
          <Metric label="未学习" value={snapshot.unseen} />
          <Metric label="学习中" value={snapshot.learning} />
          <Metric label="待复习" value={snapshot.dueReview} />
          <Metric label="补救中" value={snapshot.reviewRescue} />
          <Metric label="已通过" value={snapshot.passed} />
        </div>

        <DailyActivityChart days={dailyActivity} />

        <div className="mt-5 grid gap-2 text-sm text-[#5f5b52] md:grid-cols-2">
          {explanations.map((item) => (
            <p key={item.key} className="rounded-2xl bg-[#fbfaf7] px-4 py-3">
              <span className="font-semibold text-[#151515]">
                {item.label} {item.value}
              </span>
              ：{item.description}
            </p>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <WordbookStudySettingsPanel settings={settings} />
        <section className="rounded-[1.5rem] border border-[#e5e1d7] bg-white/95 p-5 shadow-sm">
          <h2 className="text-base font-extrabold text-[#151515]">入口</h2>
          <div className="mt-4 grid gap-2">
            <ActionLink href="/learn" label="Learn" />
            <ActionLink href="/review" label="Review" />
            <ActionLink href="/collections" label="Collections" />
          </div>
        </section>
      </div>
    </div>
  );
}

function DailyActivityChart({ days }: { days: WordbookDailyActivityDay[] }) {
  const summaryId = useId();
  const maxActivity = Math.max(
    1,
    ...days.map((day) => day.totalActivityCount),
  );
  const summary = formatDailyActivitySummary(days);
  const ariaLabel = [
    summary,
    ...days.map(
      (day) =>
        `${day.label}: Learn ${day.learnActivityCount}, Review ${day.reviewActivityCount}`,
    ),
  ].join("；");

  return (
    <div className="mt-6 border-t border-[#e5e1d7] pt-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-extrabold text-[#151515]">每日活动</h3>
          <p id={summaryId} className="mt-1 text-sm leading-6 text-[#6f6f68]">
            {summary}
          </p>
        </div>
        <div className="flex gap-3 text-xs font-semibold text-[#5f5b52]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#d08a18]" />
            Learn
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#151515]" />
            Review
          </span>
        </div>
      </div>

      <div
        className="mt-4 grid h-28 grid-cols-7 items-end gap-2"
        role="img"
        aria-label={ariaLabel}
        aria-describedby={summaryId}
      >
        {days.map((day) => {
          const total = day.totalActivityCount;
          const barHeight = total === 0
            ? 4
            : Math.max(12, Math.round((total / maxActivity) * 92));
          const learnHeight =
            total === 0 ? 0 : (day.learnActivityCount / total) * 100;
          const reviewHeight =
            total === 0 ? 0 : (day.reviewActivityCount / total) * 100;

          return (
            <div key={day.date} className="flex min-w-0 flex-col items-center gap-2">
              <div
                aria-hidden="true"
                className="flex w-full max-w-9 flex-col-reverse overflow-hidden rounded-t-md bg-[#ece7db]"
                style={{ height: `${barHeight}px` }}
              >
                <span
                  className="block bg-[#d08a18]"
                  style={{ height: `${learnHeight}%` }}
                />
                <span
                  className="block bg-[#151515]"
                  style={{ height: `${reviewHeight}%` }}
                />
              </div>
              <span className="truncate text-[11px] font-semibold text-[#6f6f68]">
                {day.label}
              </span>
            </div>
          );
        })}
      </div>

      <ul className="sr-only">
        {days.map((day) => (
          <li key={day.date}>
            {day.label}: Learn {day.learnActivityCount}, Review{" "}
            {day.reviewActivityCount}, 完成{" "}
            {day.learnCompletedCount + day.reviewCompletedCount}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDailyActivitySummary(days: WordbookDailyActivityDay[]) {
  const totalLearn = days.reduce((sum, day) => sum + day.learnActivityCount, 0);
  const totalReview = days.reduce((sum, day) => sum + day.reviewActivityCount, 0);
  const totalCompleted = days.reduce(
    (sum, day) => sum + day.learnCompletedCount + day.reviewCompletedCount,
    0,
  );
  const totalActivity = totalLearn + totalReview;

  if (totalActivity === 0) {
    return `过去 ${days.length} 天还没有 Learn / Review 活动记录。`;
  }

  return `过去 ${days.length} 天记录 ${totalActivity} 次活动：Learn ${totalLearn} 次，Review ${totalReview} 次，完成 ${totalCompleted} 次。`;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#eee9de] bg-[#fbfaf7] px-4 py-3">
      <p className="text-xs text-[#6f6f68]">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-[#151515]">{value}</p>
    </div>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center justify-between rounded-xl border border-[#dedacf] bg-[#fbfaf7] px-4 text-sm font-extrabold text-[#151515] transition hover:border-[#d08a18] hover:bg-white active:translate-y-px"
    >
      <span>{label}</span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}
