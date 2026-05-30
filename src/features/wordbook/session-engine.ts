import {
  createDefaultProgress,
  getNextReviewAt,
  getProgressForEntry,
} from "@/features/wordbook/wordbook-progress-store";
import type {
  MasteryDots,
  ReviewStrength,
  StudyCardStage,
  StudyEngineResult,
  StudySessionAction,
  StudySessionState,
  StudySessionTarget,
  Wordbook,
  WordStudyProgress,
} from "@/features/wordbook/wordbook-types";

type CreateSessionInput = {
  wordbook: Wordbook;
  progressRecords: WordStudyProgress[];
  now: Date;
  sessionId: string;
};

function clampDots(value: number): MasteryDots {
  if (value >= 3) {
    return 3;
  }

  if (value === 2) {
    return 2;
  }

  if (value === 1) {
    return 1;
  }

  return 0;
}

function clampReviewStrength(value: number): ReviewStrength {
  if (value >= 3) {
    return 3;
  }

  if (value === 2) {
    return 2;
  }

  if (value === 1) {
    return 1;
  }

  return 0;
}

function toTarget(progress: WordStudyProgress, wordbook: Wordbook): StudySessionTarget {
  const entry = wordbook.entries.find((item) => item.lemma === progress.lemma);

  if (!entry) {
    throw new Error(`Missing wordbook entry for ${progress.lemma}`);
  }

  return {
    entry,
    progress,
    masteryDots: 0,
    failedAttempts: 0,
  };
}

function createState(
  input: CreateSessionInput,
  mode: "learn" | "review",
  targets: StudySessionTarget[],
): StudySessionState {
  const [current, ...pending] = targets;

  return {
    mode,
    sessionId: input.sessionId,
    wordbookId: input.wordbook.id,
    stage: current
      ? mode === "learn"
        ? "recognitionChoice"
        : "hiddenSelfRecall"
      : "complete",
    current: current ?? null,
    pending,
    completedTargetLemmas: [],
    totalTargets: targets.length,
  };
}

function selectLearnProgress(input: CreateSessionInput) {
  return input.wordbook.entries
    .map((entry) => getProgressForEntry(entry, input.progressRecords, input.now))
    .filter(
      (progress) =>
        progress.status === "unseen" ||
        progress.status === "learning" ||
        progress.status === "lapsed",
    )
    .slice(0, 10);
}

function selectReviewProgress(input: CreateSessionInput) {
  return input.wordbook.entries
    .map((entry) => getProgressForEntry(entry, input.progressRecords, input.now))
    .filter((progress) => {
      if (progress.status === "lapsed") {
        return true;
      }

      if (progress.status !== "passed" && progress.status !== "reviewing") {
        return false;
      }

      if (!progress.nextReviewAt) {
        return false;
      }

      return new Date(progress.nextReviewAt).getTime() <= input.now.getTime();
    })
    .slice(0, 10);
}

export function createLearnSession(input: CreateSessionInput): StudySessionState {
  const targets = selectLearnProgress(input).map((progress) =>
    toTarget(progress, input.wordbook),
  );

  return createState(input, "learn", targets);
}

export function createReviewSession(input: CreateSessionInput): StudySessionState {
  const targets = selectReviewProgress(input).map((progress) =>
    toTarget(progress, input.wordbook),
  );

  return createState(input, "review", targets);
}

function finishCurrentTarget(
  state: StudySessionState,
  update?: WordStudyProgress,
): StudyEngineResult {
  if (!state.current) {
    return { state, progressUpdates: [] };
  }

  const [next, ...rest] = state.pending;
  const completedTargetLemmas = [
    ...state.completedTargetLemmas,
    state.current.entry.lemma,
  ];

  return {
    state: {
      ...state,
      current: next ?? null,
      pending: rest,
      completedTargetLemmas,
      stage: next
        ? state.mode === "learn"
          ? "recognitionChoice"
          : "hiddenSelfRecall"
        : "complete",
    },
    progressUpdates: update ? [update] : [],
  };
}

function requeueCurrentTarget(
  state: StudySessionState,
  current: StudySessionTarget,
  update?: WordStudyProgress,
): StudyEngineResult {
  if (current.failedAttempts >= 3) {
    return finishCurrentTarget(state, update);
  }

  const nextPending = [...state.pending];
  const insertionIndex = Math.min(3, nextPending.length);

  nextPending.splice(insertionIndex, 0, current);

  const [next, ...rest] = nextPending;

  return {
    state: {
      ...state,
      current: next ?? null,
      pending: rest,
      stage: next
        ? state.mode === "learn"
          ? "recognitionChoice"
          : "hiddenSelfRecall"
        : "complete",
    },
    progressUpdates: update ? [update] : [],
  };
}

function buildProgressUpdate(
  state: StudySessionState,
  current: StudySessionTarget,
  overrides: Partial<WordStudyProgress>,
  now: Date,
): WordStudyProgress {
  return {
    ...current.progress,
    wordbookId: state.wordbookId,
    lemma: current.entry.lemma,
    lastSeenAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

function failCurrentTarget(
  state: StudySessionState,
  now: Date,
  nextStage: StudyCardStage = "answerReveal",
): StudyEngineResult {
  if (!state.current) {
    return { state, progressUpdates: [] };
  }

  const current = {
    ...state.current,
    failedAttempts: state.current.failedAttempts + 1,
  };
  const progressUpdate = buildProgressUpdate(
    state,
    current,
    {
      status: "learning",
      masteryDots: current.masteryDots,
      seenCount: current.progress.seenCount + 1,
      wrongCount: current.progress.wrongCount + 1,
    },
    now,
  );

  if (current.failedAttempts >= 3) {
    return finishCurrentTarget(
      {
        ...state,
        current: {
          ...current,
          progress: progressUpdate,
        },
      },
      progressUpdate,
    );
  }

  return {
    state: {
      ...state,
      current: {
        ...current,
        progress: progressUpdate,
      },
      stage: nextStage,
    },
    progressUpdates: [progressUpdate],
  };
}

function blockCurrentTarget(state: StudySessionState, now: Date): StudyEngineResult {
  if (!state.current) {
    return { state, progressUpdates: [] };
  }

  const update = buildProgressUpdate(
    state,
    state.current,
    {
      status: "blockedContent",
      masteryDots: 0,
      seenCount: state.current.progress.seenCount + 1,
    },
    now,
  );

  return finishCurrentTarget(
    {
      ...state,
      current: {
        ...state.current,
        progress: update,
      },
    },
    update,
  );
}

function passLearnTarget(
  state: StudySessionState,
  current: StudySessionTarget,
  now: Date,
): StudyEngineResult {
  const update = buildProgressUpdate(
    state,
    current,
    {
      status: "passed",
      masteryDots: 3,
      reviewStrength: 1,
      seenCount: current.progress.seenCount + 1,
      correctCount: current.progress.correctCount + 1,
      nextReviewAt: getNextReviewAt(now, 1),
    },
    now,
  );

  return finishCurrentTarget(state, update);
}

function passReviewTarget(
  state: StudySessionState,
  current: StudySessionTarget,
  now: Date,
  strength: ReviewStrength,
): StudyEngineResult {
  const update = buildProgressUpdate(
    state,
    current,
    {
      status: "passed",
      masteryDots: 3,
      reviewStrength: strength,
      seenCount: current.progress.seenCount + 1,
      correctCount: current.progress.correctCount + 1,
      nextReviewAt: getNextReviewAt(now, strength),
    },
    now,
  );

  return finishCurrentTarget(state, update);
}

function lapseReviewTarget(
  state: StudySessionState,
  current: StudySessionTarget,
  now: Date,
): StudyEngineResult {
  const nextStrength =
    current.progress.status === "lapsed"
      ? current.progress.reviewStrength
      : clampReviewStrength(current.progress.reviewStrength - 1);
  const update = buildProgressUpdate(
    state,
    current,
    {
      status: "lapsed",
      masteryDots: 0,
      reviewStrength: nextStrength,
      seenCount: current.progress.seenCount + 1,
      wrongCount: current.progress.wrongCount + 1,
      nextReviewAt: getNextReviewAt(now, 0),
    },
    now,
  );

  return requeueCurrentTarget(
    state,
    {
      ...current,
      failedAttempts: current.failedAttempts + 1,
      progress: update,
      reviewPath: "forgotten",
    },
    update,
  );
}

export function applyStudyAction(
  state: StudySessionState,
  action: StudySessionAction,
  helpers: { now?: Date } = {},
): StudyEngineResult {
  const now = helpers.now ?? new Date();
  const current = state.current;

  if (!current || state.stage === "complete") {
    return { state, progressUpdates: [] };
  }

  if (action.type === "blockCurrent") {
    return blockCurrentTarget(state, now);
  }

  if (state.mode === "learn") {
    if (action.type === "chooseMeaning" && state.stage === "recognitionChoice") {
      if (!action.isCorrect) {
        return failCurrentTarget(state, now);
      }
      const progressUpdate = buildProgressUpdate(
        state,
        current,
        {
          status: "learning",
          masteryDots: 1,
          seenCount: current.progress.seenCount + 1,
          correctCount: current.progress.correctCount + 1,
        },
        now,
      );

      return {
        state: {
          ...state,
          current: {
            ...current,
            masteryDots: clampDots(Math.max(current.masteryDots, 1)),
            progress: progressUpdate,
          },
          stage: "detailReveal",
        },
        progressUpdates: [progressUpdate],
      };
    }

    if (
      (action.type === "showAnswer" && state.stage === "recognitionChoice") ||
      (action.type === "markUnknown" &&
        (state.stage === "guidedRecall" || state.stage === "finalRecall"))
    ) {
      return failCurrentTarget(state, now);
    }

    if (action.type === "continueFromDetail" && state.stage === "answerReveal") {
      return requeueCurrentTarget(state, current);
    }

    if (action.type === "continueFromDetail" && state.stage === "detailReveal") {
      return {
        state: { ...state, stage: "guidedRecall" },
        progressUpdates: [],
      };
    }

    if (action.type === "markKnown" && state.stage === "guidedRecall") {
      const progressUpdate = buildProgressUpdate(
        state,
        current,
        {
          status: "learning",
          masteryDots: 2,
          seenCount: current.progress.seenCount + 1,
          correctCount: current.progress.correctCount + 1,
        },
        now,
      );

      return {
        state: {
          ...state,
          current: {
            ...current,
            masteryDots: clampDots(2),
            progress: progressUpdate,
          },
          stage: "finalRecall",
        },
        progressUpdates: [progressUpdate],
      };
    }

    if (action.type === "markKnown" && state.stage === "finalRecall") {
      return passLearnTarget(
        state,
        { ...current, masteryDots: clampDots(3) },
        now,
      );
    }
  }

  if (state.mode === "review") {
    if (action.type === "markKnown" && state.stage === "hiddenSelfRecall") {
      const progressUpdate = buildProgressUpdate(
        state,
        current,
        {
          status: "reviewing",
          masteryDots: 3,
          seenCount: current.progress.seenCount + 1,
          correctCount: current.progress.correctCount + 1,
        },
        now,
      );

      return {
        state: {
          ...state,
          current: {
            ...current,
            reviewPath: "remembered",
            masteryDots: 3,
            progress: progressUpdate,
          },
          stage: "reviewDetail",
        },
        progressUpdates: [progressUpdate],
      };
    }

    if (action.type === "markFuzzy" && state.stage === "hiddenSelfRecall") {
      const progressUpdate = buildProgressUpdate(
        state,
        current,
        {
          status: "reviewing",
          seenCount: current.progress.seenCount + 1,
        },
        now,
      );

      return {
        state: {
          ...state,
          current: { ...current, reviewPath: "fuzzy", progress: progressUpdate },
          stage: "fuzzyDetail",
        },
        progressUpdates: [progressUpdate],
      };
    }

    if (action.type === "markForgotten" && state.stage === "hiddenSelfRecall") {
      const progressUpdate = buildProgressUpdate(
        state,
        current,
        {
          status: "lapsed",
          masteryDots: 0,
          reviewStrength: clampReviewStrength(current.progress.reviewStrength - 1),
          seenCount: current.progress.seenCount + 1,
          wrongCount: current.progress.wrongCount + 1,
          nextReviewAt: getNextReviewAt(now, 0),
        },
        now,
      );

      return {
        state: {
          ...state,
          current: {
            ...current,
            reviewPath: "forgotten",
            progress: progressUpdate,
          },
          stage: "forgotDetail",
        },
        progressUpdates: [progressUpdate],
      };
    }

    if (action.type === "nextCard" && state.stage === "reviewDetail") {
      return passReviewTarget(
        state,
        current,
        now,
        clampReviewStrength(current.progress.reviewStrength + 1),
      );
    }

    if (action.type === "continueFromDetail" && state.stage === "fuzzyDetail") {
      return { state: { ...state, stage: "finalRecall" }, progressUpdates: [] };
    }

    if (action.type === "continueFromDetail" && state.stage === "forgotDetail") {
      return { state: { ...state, stage: "recognitionChoice" }, progressUpdates: [] };
    }

    if (action.type === "chooseMeaning" && state.stage === "recognitionChoice") {
      if (action.isCorrect) {
        return { state: { ...state, stage: "finalRecall" }, progressUpdates: [] };
      }

      return lapseReviewTarget(state, current, now);
    }

    if (action.type === "showAnswer" && state.stage === "recognitionChoice") {
      return lapseReviewTarget(state, current, now);
    }

    if (action.type === "markKnown" && state.stage === "finalRecall") {
      const nextStrength =
        current.reviewPath === "forgotten"
          ? current.progress.reviewStrength
          : current.progress.reviewStrength;

      return passReviewTarget(state, current, now, nextStrength);
    }

    if (action.type === "markUnknown" && state.stage === "finalRecall") {
      return lapseReviewTarget(state, current, now);
    }
  }

  return { state, progressUpdates: [] };
}

export function createBlockedProgress(
  wordbook: Wordbook,
  lemma: string,
  now: Date = new Date(),
): WordStudyProgress | null {
  const entry = wordbook.entries.find((item) => item.lemma === lemma);

  if (!entry) {
    return null;
  }

  return {
    ...createDefaultProgress(entry, wordbook.id, now),
    status: "blockedContent",
  };
}
