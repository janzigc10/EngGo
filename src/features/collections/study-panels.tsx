"use client";

import { useState, useSyncExternalStore } from "react";

import { listCollectedWords } from "@/features/collections/collection-store";
import {
  getServerExamTargetSnapshot,
  readStoredExamTarget,
  subscribeExamTarget,
} from "@/features/exam-target/exam-target-store";
import { examTargets, getExamTargetLabel } from "@/features/exam-target/model";

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

  return {
    total,
    sections,
  };
}

export function CollectionsPanel() {
  const [sections] = useState<CollectionSection[]>(() => loadCollectionSections());

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
                      className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                    >
                      <p className="text-sm font-semibold text-slate-900">{word.lemma}</p>
                      <p className="mt-1 text-sm text-slate-600">{word.note}</p>
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
  const activeExamTarget = useSyncExternalStore(
    subscribeExamTarget,
    readStoredExamTarget,
    getServerExamTargetSnapshot,
  );

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">
          Learn
        </p>
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-slate-950">
          当前目标先固定住，后面再补系统练习
        </h2>
      </div>
      <div className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-sm text-slate-500">当前考试目标</p>
        <p className="mt-2 text-2xl font-semibold text-slate-950">
          {getExamTargetLabel(activeExamTarget)}
        </p>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          这一页先放学习骨架和后续开发提示，不抢聊天主舞台的注意力。
        </p>
      </div>
      <div className="rounded-[1.5rem] border border-dashed border-sky-200 bg-sky-50/70 p-6 text-sm leading-7 text-sky-900">
        后续会把收藏词、错词回顾和分阶段练习接进来。现在先把入口站稳，保持页面足够轻。
      </div>
    </div>
  );
}

export function ReviewPanel() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">
          Review
        </p>
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-slate-950">
          复习入口先占位，内容后续再往里补
        </h2>
      </div>
      <div className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-sm leading-7 text-slate-600">
          这里会承接以后更细的复习流程，比如错词列表、间隔重复和再测入口。Task 6 先保留一个干净的挂载点。
        </p>
      </div>
    </div>
  );
}

export function ProgressPanel() {
  const [snapshot] = useState(() => loadProgressSnapshot());

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
