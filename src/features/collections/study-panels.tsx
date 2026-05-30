"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import {
  listCollectedWords,
  removeCollectedWord,
  subscribeCollectionChanges,
} from "@/features/collections/collection-store";
import {
  getServerExamTargetSnapshot,
  readStoredExamTarget,
  subscribeExamTarget,
} from "@/features/exam-target/exam-target-store";
import { examTargets } from "@/features/exam-target/model";
import { StudySession } from "@/features/wordbook/study-session";
import { WordbookDashboard } from "@/features/wordbook/wordbook-dashboard";
import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import {
  buildWordbookProgressSnapshot,
  loadProgressRecords,
  subscribeWordbookProgressChanges,
} from "@/features/wordbook/wordbook-progress-store";
import type { StudyMode } from "@/features/wordbook/wordbook-types";

type CollectionSection = {
  code: (typeof examTargets)[number]["code"];
  label: string;
  words: ReturnType<typeof listCollectedWords>;
};

function loadCollectionSections(): CollectionSection[] {
  return examTargets.map((target) => ({
    code: target.code,
    label: target.label,
    words: listCollectedWords(target.code),
  }));
}

function loadProgressSnapshot() {
  const sections = loadCollectionSections();
  const total = sections.reduce((sum, section) => sum + section.words.length, 0);
  const wordbook = getDefaultWordbook();
  const wordbookProgress = buildWordbookProgressSnapshot(
    wordbook,
    new Date(),
    loadProgressRecords(),
  );

  return {
    total,
    sections,
    wordbook,
    wordbookProgress,
  };
}

function useCollectionSections() {
  const sectionsJson = useSyncExternalStore(
    subscribeCollectionChanges,
    () => JSON.stringify(loadCollectionSections()),
    () => "[]",
  );

  return JSON.parse(sectionsJson) as CollectionSection[];
}

function useProgressSnapshot() {
  const snapshotJson = useSyncExternalStore(
    (listener) => {
      const unsubscribeCollection = subscribeCollectionChanges(listener);
      const unsubscribeWordbook = subscribeWordbookProgressChanges(listener);

      return () => {
        unsubscribeCollection();
        unsubscribeWordbook();
      };
    },
    () => JSON.stringify(loadProgressSnapshot()),
    () =>
      JSON.stringify({
        total: 0,
        sections: [],
        wordbook: getDefaultWordbook(),
        wordbookProgress: {
          total: 0,
          passed: 0,
          learnable: 0,
          dueReview: 0,
          blocked: 0,
        },
      }),
  );

  return JSON.parse(snapshotJson) as ReturnType<typeof loadProgressSnapshot>;
}

function getSourceLabel(word: CollectionSection["words"][number]) {
  if (word.sourceKind === "external_dictionary_basic") {
    return "外部基础词典";
  }

  if (word.sourceKind === "source_lemma") {
    return "来源词表";
  }

  if (word.sourceKind === "structured") {
    return "EngGo 结构化词条";
  }

  return "本地收藏";
}

function getMeaningDisplay(word: CollectionSection["words"][number]) {
  return word.meaningZh ?? word.note;
}

function formatCollectedDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }

  return date.toISOString().slice(0, 10);
}

function buildDraftHref(lemma: string, examTarget: CollectionSection["code"]) {
  const draft = `${lemma} 怎么用`;

  return `/?draft=${encodeURIComponent(draft)}&examTarget=${examTarget}`;
}

export function CollectionsPanel() {
  const sections = useCollectionSections();
  const total = sections.reduce((sum, section) => sum + section.words.length, 0);

  const hasAnyWords = sections.some((section) => section.words.length > 0);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">
          Collections
        </p>
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-slate-950">
          收藏词条会按考试范围分组保存
        </h2>
        <p className="text-sm text-slate-600">
          当前共 {total} 条本地收藏。先把词条整理干净，再进入复习卡片。
        </p>
      </div>
      {!hasAnyWords ? (
        <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-600">
          现在还没有收藏任何词条。回到聊天页点一下“加入收藏”，这里就会按当前考试目标分组出现。
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <section
              key={section.code}
              aria-label={`${section.label} 收藏`}
              className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{section.label}</p>
                  <p className="text-sm text-slate-500">
                    {section.words.length} 条收藏
                  </p>
                </div>
              </div>
              {section.words.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {section.words.map((word) => (
                    <li
                      key={`${word.examTarget}-${word.lemma}-${word.collectedAt}`}
                      className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-slate-950">
                              {word.lemma}
                            </p>
                            {word.partOfSpeech ? (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                                {word.partOfSpeech}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-sm leading-6 text-slate-700">
                            {getMeaningDisplay(word)}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1">
                              {getSourceLabel(word)}
                            </span>
                            {word.reviewStatus === "unreviewed" ? (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                                未人工校验
                              </span>
                            ) : null}
                            <span>{formatCollectedDate(word.collectedAt)}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <Link
                            href={buildDraftHref(word.lemma, section.code)}
                            className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-white px-3 py-1.5 text-sm font-medium text-sky-900 transition hover:border-sky-300 hover:bg-sky-50"
                          >
                            继续追问 {word.lemma}
                          </Link>
                          <button
                            type="button"
                            aria-label={`删除 ${word.lemma}`}
                            onClick={() => removeCollectedWord(section.code, word.lemma)}
                            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  这一档暂时还没有收藏内容。
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function LearnPanel() {
  const [activeSessionMode, setActiveSessionMode] = useState<StudyMode | null>(null);

  if (activeSessionMode) {
    return <StudySession mode={activeSessionMode} onExit={() => setActiveSessionMode(null)} />;
  }

  return <WordbookDashboard mode="learn" onStartSession={setActiveSessionMode} />;
}

export function ReviewPanel() {
  const [activeSessionMode, setActiveSessionMode] = useState<StudyMode | null>(null);

  if (activeSessionMode) {
    return <StudySession mode={activeSessionMode} onExit={() => setActiveSessionMode(null)} />;
  }

  return <WordbookDashboard mode="review" onStartSession={setActiveSessionMode} />;
}

export function ProgressPanel() {
  useSyncExternalStore(
    subscribeExamTarget,
    readStoredExamTarget,
    getServerExamTargetSnapshot,
  );
  const snapshot = useProgressSnapshot();

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">
          Progress
        </p>
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-slate-950">
          基础计数和阶段说明
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
          <p className="text-sm text-slate-500">总收藏词条</p>
          <p className="mt-2 text-4xl font-semibold text-slate-950">
            {snapshot.total}
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            这是当前本地骨架能直接统计出来的最小进度指标。
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/80 p-6 text-sm leading-7 text-slate-600">
          这一阶段先关注“能收藏、能查看、能按考试目标分组”。
          等后续接入更完整的数据层，再把复习命中率和阶段进度补上。
        </div>
      </div>
      <div className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">词书进度</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">
              {snapshot.wordbook.label}
            </p>
          </div>
          <p className="text-sm text-slate-500">
            {snapshot.wordbookProgress.passed} / {snapshot.wordbookProgress.total}
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">已学会</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">
              {snapshot.wordbookProgress.passed}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">待复习</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">
              {snapshot.wordbookProgress.dueReview}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">内容不足</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">
              {snapshot.wordbookProgress.blocked}
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {snapshot.sections.map((section) => (
          <div
            key={section.code}
            className="rounded-2xl border border-slate-100 bg-white/90 px-4 py-4 text-sm text-slate-700 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-900">{section.label}</span>
              <span className="text-slate-500">{section.words.length} 条</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
