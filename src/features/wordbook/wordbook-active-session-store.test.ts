// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  activeStudySessionStorageKey,
  clearActiveStudySession,
  hasActiveStudySession,
  loadActiveStudySession,
  saveActiveStudySession,
} from "@/features/wordbook/wordbook-active-session-store";
import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import { createDefaultProgress } from "@/features/wordbook/wordbook-progress-store";
import type {
  StudyMode,
  StudySessionGoal,
  StudySessionState,
} from "@/features/wordbook/wordbook-types";

function makeSessionState(
  mode: StudyMode = "learn",
  targetCount: StudySessionGoal = 10,
): StudySessionState {
  const wordbook = getDefaultWordbook();
  const [entry, nextEntry] = wordbook.entries;
  const progress = createDefaultProgress(entry, wordbook.id, new Date("2026-05-31"));
  const nextProgress = createDefaultProgress(
    nextEntry,
    wordbook.id,
    new Date("2026-05-31"),
  );

  return {
    mode,
    sessionId: `${mode}-test-session`,
    wordbookId: wordbook.id,
    stage: mode === "learn" ? "recognitionChoice" : "hiddenSelfRecall",
    current: {
      entry,
      progress,
      masteryDots: 0,
      failedAttempts: 0,
      resumeStage: mode === "learn" ? "recognitionChoice" : "hiddenSelfRecall",
      eligibleAfterExposure: 0,
    },
    pending: [
      {
        entry: nextEntry,
        progress: nextProgress,
        masteryDots: 0,
        failedAttempts: 0,
        resumeStage: mode === "learn" ? "recognitionChoice" : "hiddenSelfRecall",
        eligibleAfterExposure: 0,
      },
    ],
    reserve: [],
    completedTargetLemmas: [],
    totalTargets: targetCount,
    cardExposureCount: 1,
  };
}

describe("wordbook active session store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("saves and restores an active session snapshot", () => {
    const state = makeSessionState("learn", 20);

    saveActiveStudySession({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
      targetCount: 20,
      state,
    });

    const snapshot = loadActiveStudySession({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
    });

    expect(snapshot).toMatchObject({
      version: 1,
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
      targetCount: 20,
      sessionId: "learn-test-session",
    });
    expect(snapshot?.state.current?.entry.lemma).toBe(state.current?.entry.lemma);
    expect(hasActiveStudySession({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
    })).toBe(true);
  });

  it("safely ignores malformed and incompatible snapshots", () => {
    window.localStorage.setItem(activeStudySessionStorageKey, "{not-json");

    expect(loadActiveStudySession({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
    })).toBeNull();

    window.localStorage.setItem(
      activeStudySessionStorageKey,
      JSON.stringify({
        sessions: [
          {
            version: 99,
            mode: "learn",
            wordbookId: "cet6-foundation-v1",
          },
        ],
      }),
    );

    expect(loadActiveStudySession({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
    })).toBeNull();
  });

  it("does not restore a different mode or missing wordbook", () => {
    const state = makeSessionState("learn");

    saveActiveStudySession({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
      targetCount: 10,
      state,
    });

    expect(loadActiveStudySession({
      mode: "review",
      wordbookId: "cet6-foundation-v1",
    })).toBeNull();

    window.localStorage.setItem(
      activeStudySessionStorageKey,
      JSON.stringify({
        sessions: [
          {
            version: 1,
            mode: "learn",
            wordbookId: "__missing__",
            targetCount: 10,
            sessionId: "bad",
            startedAt: "2026-05-31T00:00:00.000Z",
            updatedAt: "2026-05-31T00:00:00.000Z",
            state,
          },
        ],
      }),
    );

    expect(loadActiveStudySession({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
    })).toBeNull();
  });

  it("keeps Learn and Review sessions separate and clears one mode at a time", () => {
    saveActiveStudySession({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
      targetCount: 10,
      state: makeSessionState("learn"),
    });
    saveActiveStudySession({
      mode: "review",
      wordbookId: "cet6-foundation-v1",
      targetCount: 30,
      state: makeSessionState("review", 30),
    });

    clearActiveStudySession({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
    });

    expect(loadActiveStudySession({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
    })).toBeNull();
    expect(loadActiveStudySession({
      mode: "review",
      wordbookId: "cet6-foundation-v1",
    })?.targetCount).toBe(30);
  });

  it("drops legacy review buffer targets while preserving the session goal", () => {
    const wordbook = getDefaultWordbook();
    const state = makeSessionState("review", 10);
    const reserveEntry = wordbook.entries[2];
    const legacyBuffer = {
      entry: reserveEntry,
      progress: createDefaultProgress(
        reserveEntry,
        wordbook.id,
        new Date("2026-05-31"),
      ),
      masteryDots: 0,
      failedAttempts: 0,
      resumeStage: "hiddenSelfRecall" as const,
      eligibleAfterExposure: 0,
      countsTowardGoal: false,
    };

    saveActiveStudySession({
      mode: "review",
      wordbookId: "cet6-foundation-v1",
      targetCount: 10,
      state: {
        ...state,
        pending: [legacyBuffer, ...state.pending],
        reserve: [legacyBuffer],
      },
    });

    const snapshot = loadActiveStudySession({
      mode: "review",
      wordbookId: "cet6-foundation-v1",
    });

    expect(snapshot?.state.totalTargets).toBe(10);
    expect(snapshot?.state.reserve).toEqual([]);
    expect(snapshot?.state.pending).toHaveLength(state.pending.length);
    expect(
      snapshot?.state.pending.some(
        (target) => target.countsTowardGoal === false,
      ),
    ).toBe(false);
  });
});
