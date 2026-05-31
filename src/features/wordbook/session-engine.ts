import {
  createDefaultProgress,
  getProgressForEntry,
} from "@/features/wordbook/wordbook-progress-store";
import {
  compareReviewProgressForQueue,
  getDueReviewTime,
  type ReviewSchedule,
  scheduleLearnPass,
  scheduleReviewCleanPass,
  scheduleReviewRescueIncomplete,
  scheduleReviewRescuePass,
} from "@/features/wordbook/wordbook-review-scheduling";
import type {
  MasteryDots,
  StudyCardStage,
  StudyEngineResult,
  StudyMistake,
  StudySessionAction,
  StudySessionState,
  StudySessionTarget,
  StudySessionGoal,
  Wordbook,
  WordStudyProgress,
} from "@/features/wordbook/wordbook-types";

type CreateSessionInput = {
  wordbook: Wordbook;
  progressRecords: WordStudyProgress[];
  now: Date;
  sessionId: string;
  targetCount: StudySessionGoal;
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

function normalizeStudySessionGoal(value: unknown): StudySessionGoal {
  return value === 10 || value === 20 || value === 30 ? value : 10;
}

function toTarget(
  progress: WordStudyProgress,
  wordbook: Wordbook,
  resumeStage: StudyCardStage,
  options: { countsTowardGoal?: boolean } = {},
): StudySessionTarget {
  const entry = wordbook.entries.find((item) => item.lemma === progress.lemma);

  if (!entry) {
    throw new Error(`Missing wordbook entry for ${progress.lemma}`);
  }

  return {
    entry,
    progress,
    masteryDots: 0,
    failedAttempts: 0,
    resumeStage,
    eligibleAfterExposure: 0,
    countsTowardGoal: options.countsTowardGoal,
  };
}

function createState(
  input: CreateSessionInput,
  mode: "learn" | "review",
  targets: StudySessionTarget[],
  reserveTargets: StudySessionTarget[] = [],
): StudySessionState {
  const [current, ...pending] = targets;

  return {
    mode,
    sessionId: input.sessionId,
    wordbookId: input.wordbook.id,
    stage: current ? current.resumeStage : "complete",
    current: current ?? null,
    pending,
    reserve: reserveTargets,
    completedTargetLemmas: [],
    totalTargets: targets.length,
    cardExposureCount: current ? 1 : 0,
  };
}

function withoutLastMistake(target: StudySessionTarget): StudySessionTarget {
  const rest = { ...target };

  delete rest.lastMistake;
  return rest;
}

function selectLearnProgress(input: CreateSessionInput) {
  const targetCount = normalizeStudySessionGoal(input.targetCount);

  return input.wordbook.entries
    .map((entry) =>
      getProgressForEntry(entry, input.progressRecords, input.now, input.wordbook.id),
    )
    .filter(
      (progress) =>
        progress.status === "unseen" ||
        progress.status === "learning",
    )
    .slice(0, targetCount);
}

function selectReviewProgress(input: CreateSessionInput, limit?: number) {
  const targetCount = limit ?? normalizeStudySessionGoal(input.targetCount);

  return input.wordbook.entries
    .map((entry) =>
      getProgressForEntry(entry, input.progressRecords, input.now, input.wordbook.id),
    )
    .filter((progress) => getDueReviewTime(progress, input.now) !== null)
    .sort((left, right) =>
      compareReviewProgressForQueue(left, right, input.now) ||
      left.lemma.localeCompare(right.lemma),
    )
    .slice(0, targetCount);
}

export function createLearnSession(input: CreateSessionInput): StudySessionState {
  const targets = selectLearnProgress(input).map((progress) =>
    toTarget(progress, input.wordbook, "recognitionChoice"),
  );

  return createState(input, "learn", targets);
}

function toReviewTarget(
  progress: WordStudyProgress,
  wordbook: Wordbook,
  options: { countsTowardGoal?: boolean } = {},
): StudySessionTarget {
  if (progress.status === "lapsed") {
    return {
      ...toTarget(progress, wordbook, "recognitionChoice", options),
      failedAttempts: 1,
    };
  }

  if (progress.status === "reviewLapsed") {
    const resumeStage =
      progress.masteryDots >= 2
        ? "finalRecall"
        : progress.masteryDots >= 1
          ? "guidedRecall"
          : "recognitionChoice";

    return {
      ...toTarget(progress, wordbook, resumeStage, options),
      failedAttempts: 1,
      masteryDots: progress.masteryDots,
    };
  }

  return toTarget(progress, wordbook, "hiddenSelfRecall", options);
}

export function createReviewSession(input: CreateSessionInput): StudySessionState {
  const targetCount = normalizeStudySessionGoal(input.targetCount);
  const targets = selectReviewProgress(input, targetCount).map((progress) =>
    toReviewTarget(progress, input.wordbook),
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

  const completedTargetLemmas =
    state.current.countsTowardGoal === false
      ? state.completedTargetLemmas
      : [...state.completedTargetLemmas, state.current.entry.lemma];

  const nextState = advanceToNextTarget({
    ...state,
    completedTargetLemmas,
  });

  return {
    state: nextState,
    progressUpdates: update ? [update] : [],
  };
}

function advanceToNextTarget(state: StudySessionState): StudySessionState {
  const firstGoalIndex = state.pending.findIndex(
    (target) => target.countsTowardGoal !== false,
  );

  if (firstGoalIndex < 0) {
    return {
      ...state,
      current: null,
      pending: [],
      reserve: state.mode === "review" ? [] : state.reserve,
      stage: "complete",
    };
  }

  const eligibleIndex = state.pending.findIndex(
    (target) =>
      target.countsTowardGoal !== false &&
      target.eligibleAfterExposure <= state.cardExposureCount,
  );
  const nextIndex = eligibleIndex >= 0 ? eligibleIndex : firstGoalIndex;
  const next = state.pending[nextIndex];
  const rest = state.pending.filter(
    (target, index) => index !== nextIndex && target.countsTowardGoal !== false,
  );

  return {
    ...state,
    current: next,
    pending: rest,
    reserve: state.mode === "review" ? [] : state.reserve,
    stage: next.resumeStage,
    cardExposureCount: state.cardExposureCount + 1,
  };
}

function requeueWithDelay(
  state: StudySessionState,
  current: StudySessionTarget,
  delay: number,
  resumeStage: StudyCardStage,
  update?: WordStudyProgress,
): StudyEngineResult {
  const nextPending = state.pending.filter(
    (target) => target.countsTowardGoal !== false,
  );

  const insertionIndex = Math.min(delay, nextPending.length);

  nextPending.splice(insertionIndex, 0, {
    ...withoutLastMistake(current),
    resumeStage,
    eligibleAfterExposure: state.cardExposureCount + delay,
  });

  const nextState = advanceToNextTarget({
    ...state,
    pending: nextPending,
    reserve: state.mode === "review" ? [] : state.reserve,
  });

  return {
    state: nextState,
    progressUpdates: update ? [update] : [],
  };
}

function requeueCurrentTarget(
  state: StudySessionState,
  current: StudySessionTarget,
  options: {
    delay?: number;
    resumeStage?: StudyCardStage;
    update?: WordStudyProgress;
    autoCompleteAfterFailures?: boolean;
  } = {},
): StudyEngineResult {
  const delay = options.delay ?? 3;
  const resumeStage = options.resumeStage ?? current.resumeStage;
  const autoCompleteAfterFailures = options.autoCompleteAfterFailures ?? true;

  if (autoCompleteAfterFailures && current.failedAttempts >= 3) {
    return finishCurrentTarget(state, options.update);
  }

  return requeueWithDelay(
    state,
    current,
    delay,
    resumeStage,
    options.update,
  );
}

function requeueLearnTarget(
  state: StudySessionState,
  current: StudySessionTarget,
  resumeStage: StudyCardStage,
  delay: number,
  update?: WordStudyProgress,
): StudyEngineResult {
  return requeueCurrentTarget(state, current, {
    delay,
    resumeStage,
    update,
    autoCompleteAfterFailures: false,
  });
}

function getLearnFailureDelay(resumeStage: StudyCardStage) {
  if (resumeStage === "recognitionChoice") {
    return 2;
  }

  return 3;
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
  mistake?: StudyMistake,
): StudyEngineResult {
  if (!state.current) {
    return { state, progressUpdates: [] };
  }

  const current = {
    ...withoutLastMistake(state.current),
    failedAttempts: state.current.failedAttempts + 1,
    ...(mistake ? { lastMistake: mistake } : {}),
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

function failReviewTarget(
  state: StudySessionState,
  now: Date,
  options: {
    nextStage?: StudyCardStage;
    mistake?: StudyMistake;
    reviewPath?: StudySessionTarget["reviewPath"];
  } = {},
): StudyEngineResult {
  if (!state.current) {
    return { state, progressUpdates: [] };
  }

  const current = {
    ...withoutLastMistake(state.current),
    failedAttempts: state.current.failedAttempts + 1,
    ...(options.reviewPath ? { reviewPath: options.reviewPath } : {}),
    ...(options.mistake ? { lastMistake: options.mistake } : {}),
  };
  const schedule = scheduleReviewRescueIncomplete(
    now,
    current.progress.reviewStrength,
  );
  const progressUpdate = buildProgressUpdate(
    state,
    current,
    {
      status: "reviewLapsed",
      masteryDots: current.masteryDots,
      reviewStrength: schedule.reviewStrength,
      seenCount: current.progress.seenCount + 1,
      wrongCount: current.progress.wrongCount + 1,
      nextReviewAt: schedule.nextReviewAt,
    },
    now,
  );

  return {
    state: {
      ...state,
      current: {
        ...current,
        progress: progressUpdate,
      },
      stage: options.nextStage ?? "answerReveal",
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
  options: { countAnswer?: boolean } = {},
): StudyEngineResult {
  const shouldCountAnswer = options.countAnswer ?? true;
  const schedule = scheduleLearnPass(now);
  const update = buildProgressUpdate(
    state,
    current,
    {
      status: "passed",
      masteryDots: 3,
      reviewStrength: schedule.reviewStrength,
      seenCount: current.progress.seenCount + (shouldCountAnswer ? 1 : 0),
      correctCount: current.progress.correctCount + (shouldCountAnswer ? 1 : 0),
      nextReviewAt: schedule.nextReviewAt,
    },
    now,
  );

  return finishCurrentTarget(state, update);
}

function passReviewTarget(
  state: StudySessionState,
  current: StudySessionTarget,
  now: Date,
  schedule: ReviewSchedule,
  options: { countAnswer?: boolean } = {},
): StudyEngineResult {
  const shouldCountAnswer = options.countAnswer ?? true;
  const update = buildProgressUpdate(
    state,
    current,
    {
      status: "passed",
      masteryDots: 3,
      reviewStrength: schedule.reviewStrength,
      seenCount: current.progress.seenCount + (shouldCountAnswer ? 1 : 0),
      correctCount: current.progress.correctCount + (shouldCountAnswer ? 1 : 0),
      nextReviewAt: schedule.nextReviewAt,
    },
    now,
  );

  return finishCurrentTarget(state, update);
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
        return failCurrentTarget(state, now, "wrongChoiceContrast", {
          selectedMeaning: action.selectedMeaning ?? "",
          correctMeaning:
            action.correctMeaning ?? current.entry.meaningsZh[0]?.trim() ?? "",
          selectedLemma: action.selectedLemma,
        });
      }
      const cleanCurrent = withoutLastMistake(current);
      const progressUpdate = buildProgressUpdate(
        state,
        cleanCurrent,
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
            ...cleanCurrent,
            masteryDots: clampDots(Math.max(cleanCurrent.masteryDots, 1)),
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
      return requeueCurrentTarget(state, current, {
        delay: getLearnFailureDelay(current.resumeStage),
        resumeStage: current.resumeStage,
        autoCompleteAfterFailures: false,
      });
    }

    if (
      action.type === "continueFromDetail" &&
      state.stage === "wrongChoiceContrast"
    ) {
      return {
        state: {
          ...state,
          current: withoutLastMistake(current),
          stage: "answerReveal",
        },
        progressUpdates: [],
      };
    }

    if (action.type === "continueFromDetail" && state.stage === "detailReveal") {
      return requeueLearnTarget(state, current, "guidedRecall", 3);
    }

    if (action.type === "continueFromDetail" && state.stage === "guidedDetail") {
      return requeueLearnTarget(state, current, "finalRecall", 4);
    }

    if (action.type === "continueFromDetail" && state.stage === "passDetail") {
      return passLearnTarget(state, current, now, { countAnswer: false });
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
            ...withoutLastMistake(current),
            masteryDots: clampDots(2),
            progress: progressUpdate,
          },
          stage: "guidedDetail",
        },
        progressUpdates: [progressUpdate],
      };
    }

    if (action.type === "markKnown" && state.stage === "finalRecall") {
      const progressUpdate = buildProgressUpdate(
        state,
        current,
        {
          status: "learning",
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
            ...withoutLastMistake(current),
            masteryDots: clampDots(3),
            progress: progressUpdate,
          },
          stage: "passDetail",
        },
        progressUpdates: [progressUpdate],
      };
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
      return failReviewTarget(state, now, {
        nextStage: "fuzzyDetail",
        reviewPath: "fuzzy",
      });
    }

    if (action.type === "markForgotten" && state.stage === "hiddenSelfRecall") {
      return failReviewTarget(state, now, {
        nextStage: "forgotDetail",
        reviewPath: "forgotten",
      });
    }

    if (action.type === "chooseMeaning" && state.stage === "recognitionChoice") {
      if (!action.isCorrect) {
        return failReviewTarget(state, now, {
          nextStage: "wrongChoiceContrast",
          mistake: {
            selectedMeaning: action.selectedMeaning ?? "",
            correctMeaning:
              action.correctMeaning ?? current.entry.meaningsZh[0]?.trim() ?? "",
            selectedLemma: action.selectedLemma,
          },
        });
      }

      const cleanCurrent = withoutLastMistake(current);
      const progressUpdate = buildProgressUpdate(
        state,
        cleanCurrent,
        {
          status: "reviewLapsed",
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
            ...cleanCurrent,
            masteryDots: 1,
            progress: progressUpdate,
          },
          stage: "detailReveal",
        },
        progressUpdates: [progressUpdate],
      };
    }

    if (action.type === "showAnswer" && state.stage === "recognitionChoice") {
      return failReviewTarget(state, now);
    }

    if (
      action.type === "continueFromDetail" &&
      state.stage === "wrongChoiceContrast"
    ) {
      return {
        state: {
          ...state,
          current: withoutLastMistake(current),
          stage: "answerReveal",
        },
        progressUpdates: [],
      };
    }

    if (action.type === "continueFromDetail" && state.stage === "answerReveal") {
      return requeueCurrentTarget(state, current, {
        delay: getLearnFailureDelay(current.resumeStage),
        resumeStage: current.resumeStage,
        autoCompleteAfterFailures: false,
      });
    }

    if (action.type === "continueFromDetail" && state.stage === "detailReveal") {
      return requeueCurrentTarget(state, current, {
        delay: 3,
        resumeStage: "guidedRecall",
        autoCompleteAfterFailures: false,
      });
    }

    if (action.type === "markUnknown" && state.stage === "guidedRecall") {
      return failReviewTarget(state, now);
    }

    if (action.type === "markKnown" && state.stage === "guidedRecall") {
      const progressUpdate = buildProgressUpdate(
        state,
        current,
        {
          status: "reviewLapsed",
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
            ...withoutLastMistake(current),
            masteryDots: 2,
            progress: progressUpdate,
          },
          stage: "guidedDetail",
        },
        progressUpdates: [progressUpdate],
      };
    }

    if (action.type === "continueFromDetail" && state.stage === "guidedDetail") {
      return requeueCurrentTarget(state, current, {
        delay: 4,
        resumeStage: "finalRecall",
        autoCompleteAfterFailures: false,
      });
    }

    if (action.type === "markUnknown" && state.stage === "finalRecall") {
      return failReviewTarget(state, now);
    }

    if (action.type === "markKnown" && state.stage === "finalRecall") {
      const progressUpdate = buildProgressUpdate(
        state,
        current,
        {
          status: "reviewLapsed",
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
            ...withoutLastMistake(current),
            masteryDots: 3,
            progress: progressUpdate,
          },
          stage: "reviewDetail",
        },
        progressUpdates: [progressUpdate],
      };
    }

    if (action.type === "nextCard" && state.stage === "reviewDetail") {
      return passReviewTarget(
        state,
        current,
        now,
        current.failedAttempts > 0
          ? scheduleReviewRescuePass(now)
          : scheduleReviewCleanPass(now, current.progress.reviewStrength),
        { countAnswer: false },
      );
    }

    if (action.type === "continueFromDetail" && state.stage === "fuzzyDetail") {
      return requeueCurrentTarget(state, current, {
        delay: 3,
        resumeStage: "recognitionChoice",
        autoCompleteAfterFailures: false,
      });
    }

    if (action.type === "continueFromDetail" && state.stage === "forgotDetail") {
      return requeueCurrentTarget(state, current, {
        delay: 3,
        resumeStage: "recognitionChoice",
        autoCompleteAfterFailures: false,
      });
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
