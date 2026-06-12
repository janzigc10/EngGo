// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  saveActiveStudySession,
} from "@/features/wordbook/wordbook-active-session-store";
import { WordbookDailyOverviewPanel } from "@/features/wordbook/wordbook-daily-overview-panel";
import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import {
  createDefaultProgress,
  saveWordProgress,
} from "@/features/wordbook/wordbook-progress-store";
import type {
  StudySessionState,
  Wordbook,
} from "@/features/wordbook/wordbook-types";

function saveDueReviewWord(wordbook: Wordbook) {
  const entry = wordbook.entries[0];

  saveWordProgress({
    ...createDefaultProgress(entry, wordbook.id, new Date("2026-06-01")),
    status: "passed",
    masteryDots: 3,
    reviewStrength: 1,
    nextReviewAt: "2026-06-01T00:00:00.000Z",
  });
}

function buildActiveLearnState(wordbook: Wordbook): StudySessionState {
  const [entry, nextEntry] = wordbook.entries;

  return {
    mode: "learn",
    sessionId: "learn-overview-panel-test",
    wordbookId: wordbook.id,
    stage: "recognitionChoice",
    current: {
      entry,
      progress: createDefaultProgress(entry, wordbook.id, new Date("2026-06-12")),
      masteryDots: 0,
      failedAttempts: 0,
      resumeStage: "recognitionChoice",
      eligibleAfterExposure: 0,
    },
    pending: [
      {
        entry: nextEntry,
        progress: createDefaultProgress(
          nextEntry,
          wordbook.id,
          new Date("2026-06-12"),
        ),
        masteryDots: 0,
        failedAttempts: 0,
        resumeStage: "recognitionChoice",
        eligibleAfterExposure: 0,
      },
    ],
    reserve: [],
    completedTargetLemmas: ["abandon", "ability"],
    totalTargets: 10,
    cardExposureCount: 4,
  };
}

describe("WordbookDailyOverviewPanel", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders the current wordbook overview on the chat workspace side rail", () => {
    render(<WordbookDailyOverviewPanel />);

    expect(screen.getByLabelText("今日学习概览")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "可以继续扩充词书" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /学习新词/ })).toHaveAttribute(
      "href",
      "/learn",
    );
    expect(screen.getByRole("link", { name: /查看进度/ })).toHaveAttribute(
      "href",
      "/progress",
    );
    expect(screen.getByText(/CET-6 ECDICT 基础词书 V1/)).toBeInTheDocument();
  });

  it("reads due review and active learn state without collapsing them into one action", async () => {
    const wordbook = getDefaultWordbook();

    saveDueReviewWord(wordbook);
    saveActiveStudySession({
      mode: "learn",
      wordbookId: wordbook.id,
      targetCount: 10,
      state: buildActiveLearnState(wordbook),
    });

    render(<WordbookDailyOverviewPanel />);

    expect(await screen.findByRole("link", { name: /继续学习/ })).toHaveAttribute(
      "href",
      "/learn",
    );
    expect(screen.getByText("已完成 2 / 10")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /复习到期词/ })).toHaveAttribute(
      "href",
      "/review",
    );
    expect(screen.getByRole("link", { name: /查看进度/ })).toHaveAttribute(
      "href",
      "/progress",
    );
  });
});
