"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { buildMeaningChoice } from "@/features/wordbook/distractors";
import {
  clearActiveStudySession,
  loadActiveStudySession,
  saveActiveStudySession,
} from "@/features/wordbook/wordbook-active-session-store";
import { loadActiveWordbookId } from "@/features/wordbook/wordbook-active-store";
import { getWordbookById } from "@/features/wordbook/wordbook-data";
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
  StudySessionGoal,
  StudySessionAction,
  StudySessionState,
  Wordbook,
  WordbookId,
  WordStudyProgress,
} from "@/features/wordbook/wordbook-types";

type StudySessionProps = {
  mode: StudyMode;
  targetCount: StudySessionGoal;
  wordbookId?: WordbookId;
  onExit: () => void;
};

export function StudySession({ mode, targetCount, wordbookId, onExit }: StudySessionProps) {
  const wordbook = getWordbookById(wordbookId ?? loadActiveWordbookId());
  const [session, setSession] = useState(() =>
    createInitialStudySession({ mode, targetCount, wordbook }),
  );
  const state = session.state;

  useEffect(() => {
    persistActiveSessionState({
      mode,
      wordbookId: wordbook.id,
      targetCount: session.targetCount,
      state,
    });
  }, [mode, session.targetCount, state, wordbook.id]);

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
    persistActiveSessionState({
      mode,
      wordbookId: wordbook.id,
      targetCount: session.targetCount,
      state: result.state,
    });
    setSession((currentSession) => ({
      ...currentSession,
      state: result.state,
    }));
  }, [mode, session.targetCount, state, wordbook.id]);

  if ((state.stage === "complete" || !current) && state.totalTargets === 0) {
    return (
      <section className="space-y-5 rounded-[1.5rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">
          {mode === "learn" ? "Learn" : "Review"}
        </p>
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-slate-950">
          {mode === "learn" ? "现在没有可学习词" : "现在没有到期复习词"}
        </h2>
        <p className="text-sm leading-6 text-slate-600">
          {mode === "learn"
            ? "这本词书当前没有可进入 Learn 的目标词；如果有待复习或补救词，请去 Review 处理。"
            : "今天没有需要处理的 Review 目标词；补救词会继续留在 Review 队列，到期词会按调度时间回来。"}
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

function createInitialStudySession({
  mode,
  targetCount,
  wordbook,
}: {
  mode: StudyMode;
  targetCount: StudySessionGoal;
  wordbook: Wordbook;
}): { state: StudySessionState; targetCount: StudySessionGoal } {
  const activeSnapshot = loadActiveStudySession({
    mode,
    wordbookId: wordbook.id,
  });

  if (activeSnapshot) {
    if (isStudySessionCompatible(activeSnapshot.state, wordbook, mode)) {
      return {
        state: activeSnapshot.state,
        targetCount: activeSnapshot.targetCount,
      };
    }

    clearActiveStudySession({ mode, wordbookId: wordbook.id });
  }

  const now = new Date();
  const progressRecords = prepareProgressRecordsForSession(wordbook, now);
  const input = {
    wordbook,
    progressRecords,
    now,
    sessionId: `${mode}-${Date.now()}`,
    targetCount,
  };

  return {
    state: mode === "learn" ? createLearnSession(input) : createReviewSession(input),
    targetCount,
  };
}

function persistActiveSessionState({
  mode,
  wordbookId,
  targetCount,
  state,
}: {
  mode: StudyMode;
  wordbookId: WordbookId;
  targetCount: StudySessionGoal;
  state: StudySessionState;
}) {
  if (state.stage === "complete" || state.totalTargets <= 0 || !state.current) {
    clearActiveStudySession({ mode, wordbookId });
    return;
  }

  saveActiveStudySession({
    mode,
    wordbookId,
    targetCount,
    state,
  });
}

function isStudySessionCompatible(
  state: StudySessionState,
  wordbook: Wordbook,
  mode: StudyMode,
) {
  if (state.mode !== mode || state.wordbookId !== wordbook.id) {
    return false;
  }

  const availableLemmas = new Set(
    wordbook.entries.map((entry) => entry.lemma.toLowerCase()),
  );
  const targets = [
    ...(state.current ? [state.current] : []),
    ...state.pending,
    ...state.reserve,
  ];

  return targets.every((target) =>
    availableLemmas.has(target.entry.lemma.toLowerCase()),
  );
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

    const correctOption = choice.options.find((option) => option.isCorrect);

    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {choice.options.map((option) => (
            <button
              key={option.id}
              type="button"
              className="min-h-14 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium leading-6 text-slate-800 transition hover:border-sky-200 hover:bg-sky-50"
              onClick={() =>
                onAction({
                  type: "chooseMeaning",
                  isCorrect: option.isCorrect,
                  selectedMeaning: option.meaningZh,
                  correctMeaning: correctOption?.meaningZh,
                  ...(option.isCorrect ? {} : { selectedLemma: option.lemma }),
                })
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

  if (state.stage === "wrongChoiceContrast") {
    return (
      <div className="space-y-5">
        <WrongChoiceContrast state={state} />
        <button type="button" className={primaryButton} onClick={() => onAction({ type: "continueFromDetail" })}>
          继续
        </button>
      </div>
    );
  }

  if (
    state.stage === "detailReveal" ||
    state.stage === "guidedDetail" ||
    state.stage === "passDetail" ||
    state.stage === "reviewDetail" ||
    state.stage === "fuzzyDetail" ||
    state.stage === "forgotDetail" ||
    state.stage === "answerReveal"
  ) {
    const isReviewPass = state.stage === "reviewDetail";
    const isLearnPass = state.stage === "passDetail";
    const buttonLabel = isReviewPass || isLearnPass ? "下一词" : "继续";
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

function WrongChoiceContrast({ state }: { state: StudySessionState }) {
  const mistake = state.current?.lastMistake;

  if (!mistake) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-2xl bg-amber-50 px-5 py-5 text-slate-700">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-700">
        Choice Contrast
      </p>
      <div>
        <p className="text-xs font-medium text-slate-500">You chose</p>
        <p className="mt-1 text-base font-semibold text-slate-950">
          {mistake.selectedMeaning}
        </p>
        {mistake.selectedLemma ? (
          <p className="mt-1 text-sm text-slate-600">
            Distractor word: {mistake.selectedLemma}
          </p>
        ) : null}
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">Correct meaning</p>
        <p className="mt-1 text-base font-semibold text-slate-950">
          {mistake.correctMeaning}
        </p>
      </div>
    </div>
  );
}

export function DetailBlock({ state }: { state: StudySessionState }) {
  const entry = state.current?.entry;

  if (!entry) {
    return null;
  }

  const depth = getDetailDepth(state);
  const meanings =
    depth === "complete" ? entry.meaningsZh : entry.meaningsZh.slice(0, 1);
  const examples =
    depth === "complete" ? entry.examples : entry.examples.slice(0, 1);
  const collocations =
    depth === "first" ? [] : entry.collocations;
  const meaningLine = formatMeaningLine(entry.pos, meanings);

  return (
    <div className="space-y-4 rounded-2xl bg-slate-50 px-5 py-5 text-slate-700">
      {state.stage === "passDetail" ? (
        <p className="text-xs font-semibold text-emerald-700">本轮已通过</p>
      ) : null}
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
          Meaning
        </p>
        <p className="mt-2 text-lg font-semibold text-slate-950">
          {meaningLine}
        </p>
      </div>
      {examples.map((example) => (
        <p key={example} className="text-sm leading-7">{example}</p>
      ))}
      {collocations.map((collocation) => (
        <p key={collocation} className="text-sm text-slate-500">{collocation}</p>
      ))}
    </div>
  );
}

function getDetailDepth(state: StudySessionState): "first" | "second" | "complete" {
  if (state.mode === "review") {
    return "complete";
  }

  if (state.stage === "passDetail" || state.current?.resumeStage === "finalRecall") {
    return "complete";
  }

  if (state.stage === "guidedDetail" || state.current?.resumeStage === "guidedRecall") {
    return "second";
  }

  return "first";
}

function formatMeaningLine(pos: string[], meaningsZh: string[]) {
  const posLabel = formatPartOfSpeech(pos);
  const meaningText = meaningsZh.join("；");

  return posLabel ? `${posLabel} ${meaningText}` : meaningText;
}

function formatPartOfSpeech(pos: string[]) {
  const labels: Record<string, string> = {
    adjective: "adj.",
    adverb: "adv.",
    conjunction: "conj.",
    determiner: "det.",
    interjection: "interj.",
    noun: "n.",
    preposition: "prep.",
    pronoun: "pron.",
    verb: "v.",
  };

  return pos
    .map((part) => {
      const normalized = part.trim().toLowerCase();

      return labels[normalized] ?? part.trim();
    })
    .filter(Boolean)
    .join("/");
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
