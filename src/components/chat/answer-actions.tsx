"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { addCollectedWord, listCollectedWords, subscribeCollectionChanges } from "@/features/collections/collection-store";
import type { AnswerGrounding } from "@/features/answering/build-grounding";

type AnswerActionsProps = {
  grounding: AnswerGrounding;
};

function buildCollectionNote(meaning: string[] | undefined, reason: string) {
  const normalizedMeaning =
    meaning?.map((item) => item.trim()).filter(Boolean) ?? [];

  if (normalizedMeaning.length > 0) {
    return normalizedMeaning.join(" / ");
  }

  return reason;
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

  function handleCollect(lemma: string, note: string) {
    addCollectedWord(grounding.activeExamTarget, { lemma, note });
    showFeedback(`已加入收藏：${lemma}`);
  }

  if (grounding.mainAnswer.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3 rounded-[1.25rem] border border-slate-100 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            收藏动作
          </p>
          <p className="text-sm text-slate-600">
            把这条主答案收进当前考试范围，后面再慢慢整理。
          </p>
        </div>
        {statusMessage ? (
          <p className="text-sm font-medium text-emerald-700" aria-live="polite">
            {statusMessage}
          </p>
        ) : null}
      </div>
      <div className="space-y-3">
        {grounding.mainAnswer.map((candidate) => {
          const note = buildCollectionNote(candidate.meaningsZh, candidate.reason);
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
                onClick={() => handleCollect(candidate.lemma, note)}
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
