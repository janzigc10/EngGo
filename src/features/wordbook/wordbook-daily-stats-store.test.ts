// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import {
  buildWordbookDailyActivitySeries,
  loadWordbookDailyStats,
  recordWordbookDailyActivity,
  subscribeWordbookDailyStatsChanges,
  wordbookDailyStatsStorageKey,
} from "@/features/wordbook/wordbook-daily-stats-store";
import {
  createDefaultProgress,
} from "@/features/wordbook/wordbook-progress-store";
import type {
  WordStudyProgress,
} from "@/features/wordbook/wordbook-types";

function makeProgress(
  lemma: string,
  overrides: Partial<WordStudyProgress> = {},
): WordStudyProgress {
  return {
    ...createDefaultProgress(
      { ...getDefaultWordbook().entries[0], lemma },
      getDefaultWordbook().id,
      new Date(2026, 5, 13, 9),
    ),
    ...overrides,
  };
}

describe("wordbook daily stats store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns empty stats when storage is missing or invalid", () => {
    expect(loadWordbookDailyStats()).toEqual([]);

    window.localStorage.setItem(wordbookDailyStatsStorageKey, "{not-json");

    expect(loadWordbookDailyStats()).toEqual([]);
  });

  it("normalizes malformed records, ignores unknown wordbook ids, and merges by date and wordbook", () => {
    window.localStorage.setItem(
      wordbookDailyStatsStorageKey,
      JSON.stringify({
        records: [
          {
            date: "2026-06-13",
            wordbookId: "cet6-foundation-v1",
            learnActivityCount: 2.8,
            learnCompletedCount: -1,
            reviewActivityCount: 1,
            reviewCompletedCount: 0,
            updatedAt: "2026-06-13T01:00:00.000Z",
          },
          {
            date: "2026-06-13",
            wordbookId: "cet6-foundation-v1",
            learnActivityCount: 1,
            learnCompletedCount: 1,
            reviewActivityCount: 0,
            reviewCompletedCount: 1,
            updatedAt: "2026-06-13T02:00:00.000Z",
          },
          {
            date: "2026-06-13",
            wordbookId: "unknown-wordbook",
            learnActivityCount: 99,
            updatedAt: "2026-06-13T03:00:00.000Z",
          },
          {
            date: "2026-02-31",
            wordbookId: "cet6-foundation-v1",
            learnActivityCount: 99,
            updatedAt: "2026-06-13T03:00:00.000Z",
          },
        ],
      }),
    );

    expect(loadWordbookDailyStats()).toEqual([
      {
        date: "2026-06-13",
        wordbookId: "cet6-foundation-v1",
        learnActivityCount: 3,
        learnCompletedCount: 1,
        reviewActivityCount: 1,
        reviewCompletedCount: 1,
        learnActivityLemmas: [],
        learnCompletedLemmas: [],
        reviewActivityLemmas: [],
        reviewCompletedLemmas: [],
        updatedAt: "2026-06-13T02:00:00.000Z",
      },
    ]);
  });

  it("records Learn activity by unique lemma and separates completed words", () => {
    recordWordbookDailyActivity({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
      now: new Date(2026, 5, 13, 9),
      progressUpdates: [
        makeProgress("abandon", { status: "learning" }),
        makeProgress("abandon", { status: "passed" }),
        makeProgress("ability", { status: "passed" }),
      ],
    });

    expect(loadWordbookDailyStats()).toEqual([
      expect.objectContaining({
        date: "2026-06-13",
        wordbookId: "cet6-foundation-v1",
        learnActivityCount: 2,
        learnCompletedCount: 2,
        reviewActivityCount: 0,
        reviewCompletedCount: 0,
        learnActivityLemmas: ["abandon", "ability"],
        learnCompletedLemmas: ["abandon", "ability"],
      }),
    ]);
  });

  it("persists the object storage schema with counts and lemma arrays", () => {
    recordWordbookDailyActivity({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
      now: new Date("2026-06-13T09:00:00.000Z"),
      progressUpdates: [
        makeProgress(" Abandon ", { status: "learning" }),
        makeProgress("Ability", { status: "passed" }),
      ],
    });

    const rawValue = window.localStorage.getItem(wordbookDailyStatsStorageKey);
    const parsed = JSON.parse(rawValue ?? "{}") as {
      records?: Array<Record<string, unknown>>;
    };

    expect(parsed).toEqual({
      records: [
        expect.objectContaining({
          date: "2026-06-13",
          wordbookId: "cet6-foundation-v1",
          learnActivityCount: 2,
          learnCompletedCount: 1,
          reviewActivityCount: 0,
          reviewCompletedCount: 0,
          learnActivityLemmas: ["abandon", "ability"],
          learnCompletedLemmas: ["ability"],
          reviewActivityLemmas: [],
          reviewCompletedLemmas: [],
          updatedAt: "2026-06-13T09:00:00.000Z",
        }),
      ],
    });
  });

  it("does not double-count the same lemma across separate calls on the same day", () => {
    recordWordbookDailyActivity({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
      now: new Date(2026, 5, 13, 9),
      progressUpdates: [makeProgress("abandon", { status: "learning" })],
    });
    recordWordbookDailyActivity({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
      now: new Date(2026, 5, 13, 10),
      progressUpdates: [makeProgress("abandon", { status: "passed" })],
    });
    recordWordbookDailyActivity({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
      now: new Date(2026, 5, 13, 11),
      progressUpdates: [makeProgress("ability", { status: "learning" })],
    });

    expect(loadWordbookDailyStats()).toEqual([
      expect.objectContaining({
        learnActivityCount: 2,
        learnCompletedCount: 1,
        learnActivityLemmas: ["abandon", "ability"],
        learnCompletedLemmas: ["abandon"],
      }),
    ]);
  });

  it("preserves legacy count-only records while adding unique lemma counts", () => {
    window.localStorage.setItem(
      wordbookDailyStatsStorageKey,
      JSON.stringify({
        records: [
          {
            date: "2026-06-13",
            wordbookId: "cet6-foundation-v1",
            learnActivityCount: 3,
            learnCompletedCount: 1,
            reviewActivityCount: 0,
            reviewCompletedCount: 0,
            updatedAt: "2026-06-13T01:00:00.000Z",
          },
        ],
      }),
    );

    recordWordbookDailyActivity({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
      now: new Date(2026, 5, 13, 9),
      progressUpdates: [makeProgress("abandon", { status: "learning" })],
    });
    recordWordbookDailyActivity({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
      now: new Date(2026, 5, 13, 10),
      progressUpdates: [makeProgress("abandon", { status: "passed" })],
    });

    expect(loadWordbookDailyStats()).toEqual([
      expect.objectContaining({
        learnActivityCount: 4,
        learnCompletedCount: 2,
        learnActivityLemmas: ["abandon"],
        learnCompletedLemmas: ["abandon"],
      }),
    ]);
  });

  it("records Review activity separately and no-ops on empty updates", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWordbookDailyStatsChanges(listener);

    recordWordbookDailyActivity({
      mode: "review",
      wordbookId: "cet6-foundation-v1",
      now: new Date(2026, 5, 13, 10),
      progressUpdates: [
        makeProgress("abandon", { status: "reviewLapsed" }),
        makeProgress("ability", { status: "passed" }),
      ],
    });
    recordWordbookDailyActivity({
      mode: "review",
      wordbookId: "cet6-foundation-v1",
      now: new Date(2026, 5, 13, 11),
      progressUpdates: [],
    });

    expect(loadWordbookDailyStats()).toEqual([
      expect.objectContaining({
        reviewActivityCount: 2,
        reviewCompletedCount: 1,
        reviewActivityLemmas: ["abandon", "ability"],
        reviewCompletedLemmas: ["ability"],
      }),
    ]);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("builds an empty-to-filled daily activity series for one wordbook", () => {
    const records = [
      {
        date: "2026-06-11",
        wordbookId: "cet6-foundation-v1" as const,
        learnActivityCount: 3,
        learnCompletedCount: 1,
        learnActivityLemmas: ["abandon", "ability", "able"],
        learnCompletedLemmas: ["abandon"],
        reviewActivityCount: 0,
        reviewCompletedCount: 0,
        reviewActivityLemmas: [],
        reviewCompletedLemmas: [],
        updatedAt: "2026-06-11T01:00:00.000Z",
      },
      {
        date: "2026-06-13",
        wordbookId: "cet6-foundation-v1" as const,
        learnActivityCount: 0,
        learnCompletedCount: 0,
        learnActivityLemmas: [],
        learnCompletedLemmas: [],
        reviewActivityCount: 2,
        reviewCompletedCount: 1,
        reviewActivityLemmas: ["abandon", "ability"],
        reviewCompletedLemmas: ["ability"],
        updatedAt: "2026-06-13T01:00:00.000Z",
      },
      {
        date: "2026-06-13",
        wordbookId: "cet4-foundation-v1" as const,
        learnActivityCount: 99,
        learnCompletedCount: 99,
        learnActivityLemmas: [],
        learnCompletedLemmas: [],
        reviewActivityCount: 99,
        reviewCompletedCount: 99,
        reviewActivityLemmas: [],
        reviewCompletedLemmas: [],
        updatedAt: "2026-06-13T01:00:00.000Z",
      },
    ];

    expect(
      buildWordbookDailyActivitySeries({
        wordbookId: "cet6-foundation-v1",
        records,
        now: new Date(2026, 5, 13, 12),
        days: 3,
      }),
    ).toEqual([
      expect.objectContaining({
        date: "2026-06-11",
        label: "06/11",
        totalActivityCount: 3,
      }),
      expect.objectContaining({
        date: "2026-06-12",
        label: "06/12",
        totalActivityCount: 0,
      }),
      expect.objectContaining({
        date: "2026-06-13",
        label: "06/13",
        totalActivityCount: 2,
      }),
    ]);
  });
});
