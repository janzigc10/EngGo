// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TodayEntry } from "@/app/today/today-entry";
import {
  saveActiveStudySession,
} from "@/features/wordbook/wordbook-active-session-store";
import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import {
  createDefaultProgress,
  saveWordProgress,
} from "@/features/wordbook/wordbook-progress-store";
import type {
  StudySessionState,
  Wordbook,
} from "@/features/wordbook/wordbook-types";

function buildActiveLearnState(wordbook: Wordbook): StudySessionState {
  const [entry, nextEntry] = wordbook.entries;

  return {
    mode: "learn",
    sessionId: "today-entry-learn-test",
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

function buildActiveReviewState(wordbook: Wordbook): StudySessionState {
  const [entry, nextEntry] = wordbook.entries;

  return {
    mode: "review",
    sessionId: "today-entry-review-test",
    wordbookId: wordbook.id,
    stage: "hiddenSelfRecall",
    current: {
      entry,
      progress: createDefaultProgress(entry, wordbook.id, new Date("2026-06-12")),
      masteryDots: 3,
      failedAttempts: 0,
      resumeStage: "hiddenSelfRecall",
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
        masteryDots: 3,
        failedAttempts: 0,
        resumeStage: "hiddenSelfRecall",
        eligibleAfterExposure: 0,
      },
    ],
    reserve: [],
    completedTargetLemmas: ["abandon"],
    totalTargets: 10,
    cardExposureCount: 3,
  };
}

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

describe("TodayEntry", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders Learn, Review, and Chat as free-choice entry points", () => {
    render(<TodayEntry />);

    const entryNav = screen.getByRole("navigation", { name: "今日入口" });

    expect(within(entryNav).getByRole("link", { name: /Learn/ })).toHaveAttribute(
      "href",
      "/learn",
    );
    expect(
      within(entryNav).getByRole("link", { name: /Review/ }),
    ).toHaveAttribute("href", "/review");
    expect(within(entryNav).getByRole("link", { name: /Chat/ })).toHaveAttribute(
      "href",
      "/chat",
    );
    expect(screen.getByText(/状态只负责摊开，不替你排序/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/必须|推荐|优先|先做/);
  });

  it("surfaces active learn state and due review without collapsing them", async () => {
    const wordbook = getDefaultWordbook();

    saveDueReviewWord(wordbook);
    saveActiveStudySession({
      mode: "learn",
      wordbookId: wordbook.id,
      targetCount: 10,
      state: buildActiveLearnState(wordbook),
    });

    render(<TodayEntry />);

    const overviewNav = screen.getByRole("navigation", { name: "学习入口" });

    expect(await screen.findByRole("link", { name: /继续学习/ })).toHaveAttribute(
      "href",
      "/learn",
    );
    expect(screen.getByText("已完成 2 / 10")).toBeInTheDocument();
    expect(within(overviewNav).getByRole("link", { name: /复习到期词/ })).toHaveAttribute(
      "href",
      "/review",
    );
    expect(within(overviewNav).getByRole("link", { name: /查看进度/ })).toHaveAttribute(
      "href",
      "/wordbook",
    );
  });

  it("surfaces an active review session as a separate continuation", async () => {
    const wordbook = getDefaultWordbook();

    saveActiveStudySession({
      mode: "review",
      wordbookId: wordbook.id,
      targetCount: 10,
      state: buildActiveReviewState(wordbook),
    });

    render(<TodayEntry />);

    const overviewNav = screen.getByRole("navigation", { name: "学习入口" });

    expect(await within(overviewNav).findByRole("link", { name: /继续复习/ })).toHaveAttribute(
      "href",
      "/review",
    );
    expect(screen.getByText("已完成 1 / 10")).toBeInTheDocument();
    expect(within(overviewNav).getByRole("link", { name: /学习新词/ })).toHaveAttribute(
      "href",
      "/learn",
    );
  });
});
