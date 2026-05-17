"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { addCollectedWord, listCollectedWords, subscribeCollectionChanges } from "@/features/collections/collection-store";
import type { AnswerGrounding } from "@/features/answering/build-grounding";

type AnswerActionsProps = {
  grounding: AnswerGrounding;
};

const collapsedMainAnswerLimit = 5;

type MainAnswerCandidate = AnswerGrounding["mainAnswer"][number];

function buildCollectionNote(candidate: MainAnswerCandidate) {
  const normalizedMeaning =
    candidate.meaningsZh?.map((item) => item.trim()).filter(Boolean) ?? [];

  if (candidate.sourceKind === "external_dictionary_basic") {
    if (normalizedMeaning.length > 0) {
      return `外部基础词典释义：${normalizedMeaning.join(" / ")}`;
    }

    return "外部基础词典释义，待补人工校验";
  }

  if (candidate.sourceKind === "source_lemma") {
    if (normalizedMeaning.length > 0) {
      return `来源词表命中：${normalizedMeaning.join(" / ")}`;
    }

    return "来源词表命中，待补结构化释义";
  }

  if (normalizedMeaning.length > 0) {
    return normalizedMeaning.join(" / ");
  }

  return candidate.reason;
}

function buildCompactCollectionNote(candidate: MainAnswerCandidate) {
  if (candidate.sourceKind === "external_dictionary_basic") {
    return "外部基础词典释义";
  }

  if (candidate.sourceKind === "source_lemma" && candidate.meaningsZh.length === 0) {
    return "来源词表命中，待补结构化释义";
  }

  if (candidate.sourceKind === "source_lemma") {
    return "来源词表命中";
  }

  return buildCollectionNote(candidate);
}

export function AnswerActions({ grounding }: AnswerActionsProps) {
  const collectedWordsJson = useSyncExternalStore(
    subscribeCollectionChanges,
    () => JSON.stringify(listCollectedWords(grounding.activeExamTarget)),
    () => "[]",
  );
  const collectedWords = JSON.parse(collectedWordsJson) as Array<{
    lemma?: string;
  }>;
  const collectedLemmas = new Set(
    collectedWords
      .map((word) => (typeof word.lemma === "string" ? word.lemma : ""))
      .filter(Boolean),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [areToolsOpen, setAreToolsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  function showFeedback(message: string) {
    setStatusMessage(message);

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      setStatusMessage(null);
      timeoutRef.current = null;
    }, 1800);
  }

  function handleCollect(candidate: MainAnswerCandidate, note: string) {
    addCollectedWord(grounding.activeExamTarget, {
      lemma: candidate.lemma,
      note,
      meaningZh: candidate.meaningsZh
        .map((meaning) => meaning.trim())
        .filter(Boolean)
        .join(" / "),
      partOfSpeech: candidate.partOfSpeech,
      reviewStatus: candidate.reviewStatus,
      sourceKind: candidate.sourceKind,
    });
    const lemma = candidate.lemma;

    showFeedback(`已加入收藏：${lemma}`);
  }

  if (grounding.mainAnswer.length === 0) {
    return null;
  }

  const shouldCollapse = grounding.mainAnswer.length > collapsedMainAnswerLimit;
  const shouldStartCompact = shouldCollapse && !areToolsOpen;
  const visibleCandidates =
    shouldCollapse && !isExpanded
      ? grounding.mainAnswer.slice(0, collapsedMainAnswerLimit)
      : grounding.mainAnswer;
  const shouldRenderCompactSingle = !shouldCollapse && visibleCandidates.length === 1;

  if (shouldStartCompact) {
    return (
      <div className="mt-4 space-y-3 rounded-[1.25rem] border border-slate-100 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              收藏工具
            </p>
            <p className="text-sm text-slate-600">
              这次命中 {grounding.mainAnswer.length} 个词，展开后可以逐个收藏。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAreToolsOpen(true)}
            className="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-900 transition hover:border-sky-300 hover:bg-sky-50"
          >
            展开收藏工具
          </button>
        </div>
      </div>
    );
  }

  if (shouldRenderCompactSingle) {
    const candidate = visibleCandidates[0];
    const note = buildCollectionNote(candidate);
    const compactNote = buildCompactCollectionNote(candidate);
    const isSaved = collectedLemmas.has(candidate.lemma);

    return (
      <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{candidate.lemma}</span>
          <span className="text-slate-400"> · </span>
          <span>{compactNote}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {statusMessage ? (
            <p className="text-sm font-medium text-emerald-700" aria-live="polite">
              {statusMessage}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => handleCollect(candidate, note)}
            className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-900 transition hover:border-sky-300 hover:bg-sky-50"
          >
            {isSaved ? "已收藏" : "加入收藏"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-[1.25rem] border border-slate-100 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            收藏动作
          </p>
          <p className="text-sm text-slate-600">
            {shouldCollapse
              ? `先显示前 ${collapsedMainAnswerLimit} 个，展开后可以逐个收藏。`
              : "把这条主答案收进当前考试范围，后面再慢慢整理。"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {shouldCollapse ? (
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => setIsExpanded((current) => !current)}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:text-sky-900"
            >
              {isExpanded ? "收起" : `展开全部 ${grounding.mainAnswer.length} 个`}
            </button>
          ) : null}
          {statusMessage ? (
            <p className="text-sm font-medium text-emerald-700" aria-live="polite">
              {statusMessage}
            </p>
          ) : null}
        </div>
      </div>
      <div className="space-y-3">
        {visibleCandidates.map((candidate) => {
          const note = buildCollectionNote(candidate);
          const isSaved = collectedLemmas.has(candidate.lemma);

          return (
            <div
              key={candidate.entryId}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">{candidate.lemma}</p>
                <p className="text-sm text-slate-600">{note}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCollect(candidate, note)}
                className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-900 transition hover:border-sky-300 hover:bg-sky-50"
              >
                {isSaved ? "已收藏" : "加入收藏"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
