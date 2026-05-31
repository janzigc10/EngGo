import { describe, expect, it } from "vitest";

import {
  compareReviewProgressForQueue,
  getDueReviewTime,
  scheduleLearnPass,
  scheduleReviewCleanPass,
  scheduleReviewRescueIncomplete,
  scheduleReviewRescuePass,
} from "@/features/wordbook/wordbook-review-scheduling";
import type { WordStudyProgress } from "@/features/wordbook/wordbook-types";

const now = new Date("2026-05-30T12:00:00.000Z");

function progress(
  lemma: string,
  overrides: Partial<WordStudyProgress> = {},
): WordStudyProgress {
  return {
    wordbookId: "cet6-foundation-v1",
    lemma,
    status: "passed",
    masteryDots: 3,
    reviewStrength: 1,
    seenCount: 1,
    correctCount: 1,
    wrongCount: 0,
    nextReviewAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("wordbook review scheduling", () => {
  it("names the first review after a learned word passes", () => {
    const schedule = scheduleLearnPass(now);

    expect(schedule).toMatchObject({
      reason: "learnPass",
      reviewStrength: 1,
    });
    expect(new Date(schedule.nextReviewAt).getDate()).toBe(31);
  });

  it("separates clean review passes from rescue passes", () => {
    const clean = scheduleReviewCleanPass(now, 2);
    const rescue = scheduleReviewRescuePass(now);

    expect(clean).toMatchObject({
      reason: "reviewCleanPass",
      reviewStrength: 3,
    });
    expect(rescue).toMatchObject({
      reason: "reviewRescuePass",
      reviewStrength: 1,
    });
    expect(new Date(rescue.nextReviewAt).getTime()).toBeLessThan(
      new Date(clean.nextReviewAt).getTime(),
    );
  });

  it("keeps unfinished rescue words due today", () => {
    const schedule = scheduleReviewRescueIncomplete(now, 3);

    expect(schedule).toMatchObject({
      reason: "reviewRescueIncomplete",
      reviewStrength: 1,
    });
    const nextReviewAt = new Date(schedule.nextReviewAt);

    expect(nextReviewAt.getHours()).toBe(0);
    expect(nextReviewAt.getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it("orders rescue words before older due words, then by due time", () => {
    const rescue = progress("rescue", { status: "reviewLapsed" });
    const earlier = progress("earlier", {
      nextReviewAt: "2026-05-28T00:00:00.000Z",
    });
    const later = progress("later", {
      nextReviewAt: "2026-05-30T00:00:00.000Z",
    });
    const future = progress("future", {
      nextReviewAt: "2026-06-01T00:00:00.000Z",
    });

    expect(getDueReviewTime(future, now)).toBeNull();
    expect([later, future, rescue, earlier].sort((left, right) =>
      compareReviewProgressForQueue(left, right, now),
    ).map((item) => item.lemma)).toEqual([
      "rescue",
      "earlier",
      "later",
      "future",
    ]);
  });
});
