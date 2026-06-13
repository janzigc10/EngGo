// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { examTargetStorageKey } from "@/features/exam-target/exam-target-store";
import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import {
  loadActiveStudySession,
  saveActiveStudySession,
} from "@/features/wordbook/wordbook-active-session-store";
import { saveActiveWordbookId } from "@/features/wordbook/wordbook-active-store";
import { WordbookDashboard } from "@/features/wordbook/wordbook-dashboard";
import {
  createDefaultProgress,
  getNextReviewAt,
  saveWordProgress,
  wordbookProgressStorageKey,
} from "@/features/wordbook/wordbook-progress-store";
import { wordbookStudySettingsStorageKey } from "@/features/wordbook/wordbook-study-settings-store";
import type {
  StudyMode,
  StudySessionGoal,
  StudySessionState,
  WordStudyProgress,
} from "@/features/wordbook/wordbook-types";

function makeActiveSessionState(
  mode: StudyMode,
  targetCount: StudySessionGoal,
): StudySessionState {
  const wordbook = getDefaultWordbook();
  const [entry, nextEntry] = wordbook.entries;

  return {
    mode,
    sessionId: `${mode}-dashboard-test`,
    wordbookId: wordbook.id,
    stage: mode === "learn" ? "recognitionChoice" : "hiddenSelfRecall",
    current: {
      entry,
      progress: createDefaultProgress(entry, wordbook.id, new Date("2026-05-31")),
      masteryDots: 0,
      failedAttempts: 0,
      resumeStage: mode === "learn" ? "recognitionChoice" : "hiddenSelfRecall",
      eligibleAfterExposure: 0,
    },
    pending: [
      {
        entry: nextEntry,
        progress: createDefaultProgress(
          nextEntry,
          wordbook.id,
          new Date("2026-05-31"),
        ),
        masteryDots: 0,
        failedAttempts: 0,
        resumeStage: mode === "learn" ? "recognitionChoice" : "hiddenSelfRecall",
        eligibleAfterExposure: 0,
      },
    ],
    reserve: [],
    completedTargetLemmas: ["abandon", "ability"],
    totalTargets: targetCount,
    cardExposureCount: 4,
  };
}

function saveProgressRecords(records: WordStudyProgress[]) {
  window.localStorage.setItem(
    wordbookProgressStorageKey,
    JSON.stringify({ records }),
  );
}

describe("WordbookDashboard", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the active wordbook summary without management controls", () => {
    const wordbook = getDefaultWordbook();

    render(<WordbookDashboard mode="learn" onStartSession={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Learn session" }),
    ).toBeInTheDocument();
    expect(screen.getByText("当前词书：CET-6 ECDICT 基础词书 V1")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "管理词书" }),
    ).toHaveAttribute("href", "/wordbook");
    expect(screen.getByText("考试目标")).toBeInTheDocument();
    expect(screen.getByText("本轮数量")).toBeInTheDocument();
    expect(screen.getByText("可学习")).toBeInTheDocument();
    expect(screen.getByText(String(wordbook.entries.length))).toBeInTheDocument();
    expect(screen.queryByText("总词数")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "选择词书" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Learn 每组" })).not.toBeInTheDocument();
    expect(screen.queryByText("学习设置")).not.toBeInTheDocument();
    expect(screen.queryByText("掌握进度")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /开始 Learn/ })).toBeEnabled();
  });

  it("calls the start action for learn sessions", async () => {
    const user = userEvent.setup();
    const onStartSession = vi.fn();

    render(<WordbookDashboard mode="learn" onStartSession={onStartSession} />);

    await user.click(screen.getByRole("button", { name: /开始 Learn/ }));

    expect(onStartSession).toHaveBeenCalledWith(
      "learn",
      10,
      "cet6-foundation-v1",
    );
  });

  it("uses the stored Learn target count without rendering settings controls", async () => {
    const user = userEvent.setup();
    const onStartSession = vi.fn();
    window.localStorage.setItem(
      wordbookStudySettingsStorageKey,
      JSON.stringify({
        learnTargetCount: 20,
        reviewTargetCount: 10,
      }),
    );

    render(<WordbookDashboard mode="learn" onStartSession={onStartSession} />);

    expect(screen.queryByRole("group", { name: "Learn 每组" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /开始 Learn/ }));

    expect(onStartSession).toHaveBeenCalledWith(
      "learn",
      20,
      "cet6-foundation-v1",
    );
  });

  it("shows a continue entry for an active Learn session", async () => {
    const user = userEvent.setup();
    const onStartSession = vi.fn();

    saveActiveStudySession({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
      targetCount: 20,
      state: makeActiveSessionState("learn", 20),
    });

    render(<WordbookDashboard mode="learn" onStartSession={onStartSession} />);

    expect(screen.getByText("有一轮 Learn 正在进行")).toBeInTheDocument();
    expect(screen.getByText("继续 Learn 2 / 20")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "继续" }));

    expect(onStartSession).toHaveBeenCalledWith(
      "learn",
      20,
      "cet6-foundation-v1",
    );
  });

  it("abandons only the active session without touching progress", async () => {
    const user = userEvent.setup();
    const wordbook = getDefaultWordbook();
    const entry = wordbook.entries[0];

    saveWordProgress({
      ...createDefaultProgress(entry, wordbook.id, new Date("2026-05-31")),
      status: "learning",
      masteryDots: 1,
      seenCount: 1,
    });
    saveActiveStudySession({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
      targetCount: 10,
      state: makeActiveSessionState("learn", 10),
    });

    render(<WordbookDashboard mode="learn" onStartSession={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "放弃本轮" }));

    expect(loadActiveStudySession({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
    })).toBeNull();
    expect(screen.queryByText("有一轮 Learn 正在进行")).not.toBeInTheDocument();
    expect(screen.getByText("学习中").closest("div")).toHaveTextContent("1");
  });

  it("keeps a continued session target count when stored settings differ", async () => {
    const user = userEvent.setup();
    const onStartSession = vi.fn();
    window.localStorage.setItem(
      wordbookStudySettingsStorageKey,
      JSON.stringify({
        learnTargetCount: 30,
        reviewTargetCount: 10,
      }),
    );

    saveActiveStudySession({
      mode: "learn",
      wordbookId: "cet6-foundation-v1",
      targetCount: 10,
      state: makeActiveSessionState("learn", 10),
    });

    render(<WordbookDashboard mode="learn" onStartSession={onStartSession} />);

    await user.click(screen.getByRole("button", { name: "继续" }));

    expect(onStartSession).toHaveBeenCalledWith(
      "learn",
      10,
      "cet6-foundation-v1",
    );
  });

  it("keeps Review quiet when there are no due words", () => {
    render(<WordbookDashboard mode="review" onStartSession={vi.fn()} />);

    expect(screen.getByRole("button", { name: /开始 Review/ })).toBeDisabled();
    expect(screen.getByText("先完成 Learn，Review 会在词到期后出现。")).toBeInTheDocument();
    expect(screen.queryByText(/未到期/)).not.toBeInTheDocument();
    expect(screen.queryByText("可学习")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "管理词书" }),
    ).toHaveAttribute("href", "/wordbook");
    expect(screen.queryByText("总词数")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "选择词书" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Review 每组" })).not.toBeInTheDocument();
    expect(screen.queryByText("学习设置")).not.toBeInTheDocument();
    expect(screen.queryByText("掌握进度")).not.toBeInTheDocument();
  });

  it("explains when Learn is empty because review work remains", () => {
    const wordbook = getDefaultWordbook();

    saveProgressRecords(
      wordbook.entries.map((entry) => ({
        ...createDefaultProgress(entry, wordbook.id, new Date("2026-05-30")),
        status: "passed",
        masteryDots: 3,
        reviewStrength: 1,
        nextReviewAt: "2026-05-30T00:00:00.000Z",
      })),
    );

    render(<WordbookDashboard mode="learn" onStartSession={vi.fn()} />);

    expect(screen.getByRole("button", { name: /开始 Learn/ })).toBeDisabled();
    expect(
      screen.getByText("现在没有新词可学，先去 Review 处理到期或补救词。"),
    ).toBeInTheDocument();
  });

  it("explains review rescue counts on the dashboard", () => {
    const wordbook = getDefaultWordbook();
    const entry = wordbook.entries[0];

    saveWordProgress({
      ...createDefaultProgress(entry, wordbook.id, new Date("2026-05-30")),
      status: "reviewLapsed",
      masteryDots: 1,
      reviewStrength: 1,
      wrongCount: 1,
    });

    render(<WordbookDashboard mode="review" onStartSession={vi.fn()} />);

    expect(screen.getByText("补救中").closest("div")).toHaveTextContent("1");
    expect(screen.queryByText(/Review 里失误后仍留在 Review 队列/)).not.toBeInTheDocument();
  });

  it("enables Review when a passed word is due", () => {
    const wordbook = getDefaultWordbook();
    const entry = wordbook.entries[0];

    saveWordProgress({
      ...createDefaultProgress(entry, wordbook.id, new Date("2026-05-30")),
      status: "passed",
      masteryDots: 3,
      reviewStrength: 1,
      nextReviewAt: getNextReviewAt(new Date("2026-05-29"), 1),
    });

    render(<WordbookDashboard mode="review" onStartSession={vi.fn()} />);

    expect(screen.getByRole("button", { name: /开始 Review \(1\)/ })).toBeEnabled();
  });

  it("counts lapsed words in the Review entry count", () => {
    const wordbook = getDefaultWordbook();
    const entry = wordbook.entries[0];

    saveWordProgress({
      ...createDefaultProgress(entry, wordbook.id, new Date("2026-05-30")),
      status: "lapsed",
      wrongCount: 1,
    });

    render(<WordbookDashboard mode="review" onStartSession={vi.fn()} />);

    expect(screen.getByRole("button", { name: /开始 Review \(1\)/ })).toBeEnabled();
  });

  it("shows the active postgrad wordbook", () => {
    window.localStorage.setItem(examTargetStorageKey, "postgrad");
    saveActiveWordbookId("postgrad-foundation-v1");

    render(<WordbookDashboard mode="learn" onStartSession={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Learn session" }),
    ).toBeInTheDocument();
    expect(screen.getByText("当前词书：考研 ECDICT 基础词书 V1")).toBeInTheDocument();
    expect(screen.getByText("考研")).toBeInTheDocument();
    expect(screen.queryByText(/考研词书还没接入/)).not.toBeInTheDocument();
  });
});
