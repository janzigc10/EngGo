import type {
  ReviewStrength,
  WordStudyProgress,
} from "@/features/wordbook/wordbook-types";

export type ReviewScheduleReason =
  | "learnPass"
  | "reviewCleanPass"
  | "reviewRescuePass"
  | "reviewRescueIncomplete";

export type ReviewSchedule = {
  reason: ReviewScheduleReason;
  reviewStrength: ReviewStrength;
  nextReviewAt: string;
  explanation: string;
};

const reviewDayOffsets: Record<ReviewStrength, number> = {
  0: 0,
  1: 1,
  2: 3,
  3: 7,
};

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

export function getNextReviewAt(now: Date, reviewStrength: ReviewStrength): string {
  const next = new Date(now);

  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + reviewDayOffsets[reviewStrength]);

  return next.toISOString();
}

export function scheduleLearnPass(now: Date): ReviewSchedule {
  return {
    reason: "learnPass",
    reviewStrength: 1,
    nextReviewAt: getNextReviewAt(now, 1),
    explanation: "新学通过后先安排到明天复习，保持轻量首轮巩固。",
  };
}

export function scheduleReviewCleanPass(
  now: Date,
  currentStrength: ReviewStrength,
): ReviewSchedule {
  const reviewStrength = clampReviewStrength(currentStrength + 1);

  return {
    reason: "reviewCleanPass",
    reviewStrength,
    nextReviewAt: getNextReviewAt(now, reviewStrength),
    explanation: "Review 干净通过会延长下一次复习间隔。",
  };
}

export function scheduleReviewRescuePass(now: Date): ReviewSchedule {
  return {
    reason: "reviewRescuePass",
    reviewStrength: 1,
    nextReviewAt: getNextReviewAt(now, 1),
    explanation: "Review 补救通过后仍算完成，但下一次复习保持短间隔。",
  };
}

export function scheduleReviewRescueIncomplete(
  now: Date,
  currentStrength: ReviewStrength,
): ReviewSchedule {
  const loweredStrength = clampReviewStrength(currentStrength - 1);
  const reviewStrength = loweredStrength > 1 ? 1 : loweredStrength;

  return {
    reason: "reviewRescueIncomplete",
    reviewStrength,
    nextReviewAt: getNextReviewAt(now, 0),
    explanation: "Review 补救未完成时继续留在今天的复习队列。",
  };
}

export function getDueReviewTime(
  progress: WordStudyProgress,
  now: Date,
): number | null {
  if (progress.status === "lapsed" || progress.status === "reviewLapsed") {
    return 0;
  }

  if (progress.status !== "passed" && progress.status !== "reviewing") {
    return null;
  }

  if (!progress.nextReviewAt) {
    return null;
  }

  const dueAt = new Date(progress.nextReviewAt).getTime();

  if (Number.isNaN(dueAt) || dueAt > now.getTime()) {
    return null;
  }

  return dueAt;
}

export function compareReviewProgressForQueue(
  left: WordStudyProgress,
  right: WordStudyProgress,
  now: Date,
) {
  const leftDueTime = getDueReviewTime(left, now);
  const rightDueTime = getDueReviewTime(right, now);

  if (leftDueTime === null && rightDueTime === null) {
    return 0;
  }

  if (leftDueTime === null) {
    return 1;
  }

  if (rightDueTime === null) {
    return -1;
  }

  return leftDueTime - rightDueTime;
}
