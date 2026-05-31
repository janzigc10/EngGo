// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import {
  buildWordbookProgressExplanations,
  buildWordbookProgressSnapshot,
  createDefaultProgress,
  getNextReviewAt,
  getProgressForEntry,
  loadProgressRecords,
  saveWordProgress,
  subscribeWordbookProgressChanges,
  wordbookProgressStorageKey,
} from "@/features/wordbook/wordbook-progress-store";
import type { WordStudyProgress } from "@/features/wordbook/wordbook-types";

describe("wordbook progress store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("hydrates missing storage to default progress for entries", () => {
    const wordbook = getDefaultWordbook();
    const progress = getProgressForEntry(wordbook.entries[0], [], new Date("2026-05-30"));

    expect(progress.status).toBe("unseen");
    expect(progress.masteryDots).toBe(0);
    expect(progress.lemma).toBe(wordbook.entries[0].lemma);
  });

  it("persists one lemma under the wordbook progress key", () => {
    const wordbook = getDefaultWordbook();
    const progress: WordStudyProgress = {
      ...createDefaultProgress(wordbook.entries[0], wordbook.id, new Date("2026-05-30")),
      status: "learning",
      seenCount: 1,
    };

    saveWordProgress(progress);

    expect(window.localStorage.getItem(wordbookProgressStorageKey)).toContain(
      progress.lemma,
    );
    expect(loadProgressRecords()).toEqual([progress]);
  });

  it("returns empty progress for invalid JSON", () => {
    window.localStorage.setItem(wordbookProgressStorageKey, "{not-json");

    expect(loadProgressRecords()).toEqual([]);
  });

  it("ignores records for lemmas outside the current wordbook snapshot", () => {
    const wordbook = getDefaultWordbook();

    window.localStorage.setItem(
      wordbookProgressStorageKey,
      JSON.stringify({
        records: [
          {
            wordbookId: wordbook.id,
            lemma: "__missing__",
            status: "passed",
            masteryDots: 3,
            reviewStrength: 1,
            seenCount: 1,
            correctCount: 1,
            wrongCount: 0,
            updatedAt: "2026-05-30T00:00:00.000Z",
            nextReviewAt: "2026-05-30T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(
      buildWordbookProgressSnapshot(wordbook, new Date("2026-05-30")).passed,
    ).toBe(0);
  });

  it("counts legacy lapsed words as due review but not learnable", () => {
    const wordbook = getDefaultWordbook();
    const entry = wordbook.entries[0];

    saveWordProgress({
      ...createDefaultProgress(entry, wordbook.id, new Date("2026-05-30")),
      status: "lapsed",
      wrongCount: 1,
      nextReviewAt: "2026-05-30T00:00:00.000Z",
    });

    const snapshot = buildWordbookProgressSnapshot(wordbook, new Date("2026-05-30"));

    expect(snapshot.learnable).toBe(wordbook.entries.length - 1);
    expect(snapshot.dueReview).toBe(1);
    expect(snapshot.reviewRescue).toBe(1);
  });

  it("explains unseen, learning, due, rescue, scheduled, and blocked counts", () => {
    const wordbook = getDefaultWordbook();
    const [learning, due, rescue, scheduled, blocked] = wordbook.entries;

    saveWordProgress({
      ...createDefaultProgress(learning, wordbook.id, new Date("2026-05-30")),
      status: "learning",
      masteryDots: 1,
    });
    saveWordProgress({
      ...createDefaultProgress(due, wordbook.id, new Date("2026-05-30")),
      status: "passed",
      masteryDots: 3,
      reviewStrength: 1,
      nextReviewAt: "2026-05-30T00:00:00.000Z",
    });
    saveWordProgress({
      ...createDefaultProgress(rescue, wordbook.id, new Date("2026-05-30")),
      status: "reviewLapsed",
      masteryDots: 1,
      reviewStrength: 1,
    });
    saveWordProgress({
      ...createDefaultProgress(scheduled, wordbook.id, new Date("2026-05-30")),
      status: "passed",
      masteryDots: 3,
      reviewStrength: 2,
      nextReviewAt: "2026-06-02T00:00:00.000Z",
    });
    saveWordProgress({
      ...createDefaultProgress(blocked, wordbook.id, new Date("2026-05-30")),
      status: "blockedContent",
    });

    const snapshot = buildWordbookProgressSnapshot(wordbook, new Date("2026-05-30"));
    const explanations = buildWordbookProgressExplanations(snapshot);

    expect(snapshot.unseen).toBe(wordbook.entries.length - 5);
    expect(snapshot.learning).toBe(1);
    expect(snapshot.learnable).toBe(wordbook.entries.length - 4);
    expect(snapshot.dueReview).toBe(2);
    expect(snapshot.reviewRescue).toBe(1);
    expect(snapshot.scheduledReview).toBe(1);
    expect(snapshot.blocked).toBe(1);
    expect(explanations.map((item) => item.label)).toEqual([
      "未学习",
      "学习中",
      "待复习",
      "补救中",
      "未到期",
      "内容不足",
    ]);
  });

  it("notifies subscribers after writes", () => {
    const wordbook = getDefaultWordbook();
    const listener = vi.fn();
    const unsubscribe = subscribeWordbookProgressChanges(listener);

    saveWordProgress(createDefaultProgress(wordbook.entries[0]));

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("uses rough local-day review offsets", () => {
    const now = new Date(2026, 4, 30, 16, 0, 0);
    const today = new Date(getNextReviewAt(now, 0));
    const tomorrow = new Date(getNextReviewAt(now, 1));
    const threeDays = new Date(getNextReviewAt(now, 2));
    const sevenDays = new Date(getNextReviewAt(now, 3));

    expect(today.getHours()).toBe(0);
    expect(tomorrow.getTime() - today.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(threeDays.getTime() - today.getTime()).toBe(3 * 24 * 60 * 60 * 1000);
    expect(sevenDays.getTime() - today.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
