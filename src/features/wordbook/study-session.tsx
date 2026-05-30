"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";

import { buildMeaningChoice } from "@/features/wordbook/distractors";
import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import {
  loadProgressRecords,
  saveWordProgress,
} from "@/features/wordbook/wordbook-progress-store";
import {
  applyStudyAction,
  createBlockedProgress,
  createLearnSession,
  createReviewSession,
} from "@/features/wordbook/session-engine";
import type {
  StudyMode,
  StudySessionAction,
  StudySessionState,
  Wordbook,
  WordStudyProgress,
} from "@/features/wordbook/wordbook-types";

type StudySessionProps = {
  mode: StudyMode;
  onExit: () => void;
};

export function StudySession({ mode, onExit }: StudySessionProps) {
  const wordbook = getDefaultWordbook();
  const [state, setState] = useState<StudySessionState>(() => {
    const now = new Date();
    const progressRecords = prepareProgressRecordsForSession(wordbook, now);
    const input = {
      wordbook,
      progressRecords,
      now,
      sessionId: `${mode}-${Date.now()}`,
    };

    return mode === "learn" ? createLearnSession(input) : createReviewSession(input);
  });

  const current = state.current;
  const choice = useMemo(() => {
    if (!current || state.stage !== "recognitionChoice") {
      return null;
    }

    return buildMeaningChoice({
      entry: current.entry,
      allEntries: wordbook.entries,
      seed: `${state.sessionId}:${current.entry.lemma}:${current.failedAttempts}`,
    });
  }, [current, state.sessionId, state.stage, wordbook.entries]);

  function persistUpdates(updates: WordStudyProgress[]) {
    updates.forEach((update) => saveWordProgress(update));
  }

  const dispatch = useCallback((action: StudySessionAction) => {
    const result = applyStudyAction(state, action);

    persistUpdates(result.progressUpdates);
    setState(result.state);
  }, [state]);

  if (state.stage === "complete" || !current) {
    return (
      <section className="space-y-5 rounded-[1.5rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">
          {mode === "learn" ? "Learn" : "Review"}
        </p>
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-slate-950">
          本轮完成
        </h2>
        <p className="text-sm text-slate-600">
          完成 {state.completedTargetLemmas.length} / {state.totalTargets} 个目标词。
        </p>
        <button
          type="button"
          onClick={onExit}
          className="inline-flex h-11 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white"
        >
          返回
        </button>
      </section>
    );
  }

  const progressText = `${state.completedTargetLemmas.length} / ${state.totalTargets}`;

  return (
    <section className="mx-auto flex min-h-[520px] w-full max-w-3xl flex-col justify-between rounded-[1.5rem] border border-slate-200 bg-white/95 p-5 shadow-sm sm:p-8">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4 text-sm text-slate-500">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 px-3 text-sm font-medium text-slate-600"
          >
            退出
          </button>
          <span>{progressText}</span>
        </div>

        <div className="space-y-3 text-center">
          <div className="flex items-center justify-center gap-3">
            <h2 className="break-words font-serif text-5xl font-semibold tracking-normal text-slate-950">
              {current.entry.lemma}
            </h2>
            <MasteryDots dots={current.masteryDots} />
          </div>
          {current.entry.pos.length > 0 ? (
            <p className="text-sm text-slate-500">{current.entry.pos.join(" / ")}</p>
          ) : null}
        </div>

        <StageBody
          state={state}
          choice={choice}
          onAction={dispatch}
        />
      </div>
    </section>
  );
}

export function prepareProgressRecordsForSession(
  wordbook: Wordbook,
  now: Date = new Date(),
) {
  const progressRecords = loadProgressRecords();
  let wroteBlockedProgress = false;

  for (const entry of wordbook.entries) {
    const existing = progressRecords.find(
      (progress) =>
        progress.wordbookId === wordbook.id &&
        progress.lemma.toLowerCase() === entry.lemma.toLowerCase(),
    );

    if (existing?.status === "blockedContent") {
      continue;
    }

    const choice = buildMeaningChoice({
      entry,
      allEntries: wordbook.entries,
      seed: `preflight:${entry.lemma}`,
    });

    if (choice.kind !== "blocked") {
      continue;
    }

    const blockedProgress = createBlockedProgress(wordbook, entry.lemma, now);

    if (!blockedProgress) {
      continue;
    }

    saveWordProgress({
      ...blockedProgress,
      seenCount: (existing?.seenCount ?? 0) + 1,
      correctCount: existing?.correctCount ?? 0,
      wrongCount: existing?.wrongCount ?? 0,
      reviewStrength: existing?.reviewStrength ?? 0,
    });
    wroteBlockedProgress = true;
  }

  return wroteBlockedProgress ? loadProgressRecords() : progressRecords;
}

function MasteryDots({ dots }: { dots: number }) {
  return (
    <div aria-label={`${dots} 个掌握点`} className="flex gap-1.5">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={`h-2.5 w-2.5 rounded-full ${
            index < dots ? "bg-emerald-500" : "bg-slate-200"
          }`}
        />
      ))}
    </div>
  );
}

function StageBody({
  state,
  choice,
  onAction,
}: {
  state: StudySessionState;
  choice: ReturnType<typeof buildMeaningChoice> | null;
  onAction: (action: StudySessionAction) => void;
}) {
  const current = state.current;

  if (!current) {
    return null;
  }

  if (state.stage === "hiddenSelfRecall") {
    return (
      <ActionGroup>
        <button type="button" className={primaryButton} onClick={() => onAction({ type: "markKnown" })}>
          认识
        </button>
        <button type="button" className={secondaryButton} onClick={() => onAction({ type: "markFuzzy" })}>
          模糊
        </button>
        <button type="button" className={dangerButton} onClick={() => onAction({ type: "markForgotten" })}>
          忘记了
        </button>
      </ActionGroup>
    );
  }

  if (state.stage === "recognitionChoice") {
    if (choice?.kind !== "ready") {
      return (
        <div className="space-y-4 text-center">
          <p className="text-sm text-slate-600">这个词暂时缺少足够的选项。</p>
          <button type="button" className={secondaryButton} onClick={() => onAction({ type: "blockCurrent" })}>
            跳过
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {choice.options.map((option) => (
            <button
              key={option.id}
              type="button"
              className="min-h-14 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium leading-6 text-slate-800 transition hover:border-sky-200 hover:bg-sky-50"
              onClick={() =>
                onAction({ type: "chooseMeaning", isCorrect: option.isCorrect })
              }
            >
              {option.meaningZh}
            </button>
          ))}
        </div>
        <button type="button" className={secondaryButton} onClick={() => onAction({ type: "showAnswer" })}>
          看答案
        </button>
      </div>
    );
  }

  if (
    state.stage === "detailReveal" ||
    state.stage === "reviewDetail" ||
    state.stage === "fuzzyDetail" ||
    state.stage === "forgotDetail" ||
    state.stage === "answerReveal"
  ) {
    const isReviewPass = state.stage === "reviewDetail";
    const buttonLabel = isReviewPass ? "下一词" : "继续";
    const actionType = isReviewPass ? "nextCard" : "continueFromDetail";

    return (
      <div className="space-y-5">
        <DetailBlock state={state} />
        <button type="button" className={primaryButton} onClick={() => onAction({ type: actionType })}>
          {buttonLabel}
        </button>
      </div>
    );
  }

  if (state.stage === "guidedRecall") {
    return (
      <div className="space-y-5">
        <p className="rounded-2xl bg-slate-50 px-4 py-4 text-center text-sm leading-7 text-slate-600">
          {current.entry.examples[0] ?? current.entry.collocations[0] ?? "先在心里说出核心意思。"}
        </p>
        <ActionGroup>
          <button type="button" className={primaryButton} onClick={() => onAction({ type: "markKnown" })}>
            认识
          </button>
          <button type="button" className={dangerButton} onClick={() => onAction({ type: "markUnknown" })}>
            不认识
          </button>
        </ActionGroup>
      </div>
    );
  }

  if (state.stage === "finalRecall") {
    return (
      <ActionGroup>
        <button type="button" className={primaryButton} onClick={() => onAction({ type: "markKnown" })}>
          认识
        </button>
        <button type="button" className={dangerButton} onClick={() => onAction({ type: "markUnknown" })}>
          记错了
        </button>
      </ActionGroup>
    );
  }

  return null;
}

function DetailBlock({ state }: { state: StudySessionState }) {
  const entry = state.current?.entry;

  if (!entry) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-2xl bg-slate-50 px-5 py-5 text-slate-700">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
          Meaning
        </p>
        <p className="mt-2 text-lg font-semibold text-slate-950">
          {entry.meaningsZh.join("；")}
        </p>
      </div>
      {entry.examples[0] ? (
        <p className="text-sm leading-7">{entry.examples[0]}</p>
      ) : null}
      {entry.collocations[0] ? (
        <p className="text-sm text-slate-500">{entry.collocations[0]}</p>
      ) : null}
    </div>
  );
}

function ActionGroup({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-3">{children}</div>;
}

const primaryButton =
  "inline-flex h-12 min-w-28 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800";
const secondaryButton =
  "inline-flex h-12 min-w-28 items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50";
const dangerButton =
  "inline-flex h-12 min-w-28 items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100";
