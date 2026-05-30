// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { examTargetStorageKey } from "@/features/exam-target/exam-target-store";
import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import { WordbookDashboard } from "@/features/wordbook/wordbook-dashboard";
import {
  createDefaultProgress,
  getNextReviewAt,
  saveWordProgress,
} from "@/features/wordbook/wordbook-progress-store";
import { wordbookStudySettingsStorageKey } from "@/features/wordbook/wordbook-study-settings-store";

describe("WordbookDashboard", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the CET-6 foundation wordbook and dashboard counts", () => {
    const wordbook = getDefaultWordbook();

    render(<WordbookDashboard mode="learn" onStartSession={vi.fn()} />);

    expect(screen.getByText("CET-6 基础词书 V1")).toBeInTheDocument();
    expect(screen.getAllByText(String(wordbook.entries.length)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /开始 Learn/ })).toBeEnabled();
  });

  it("calls the start action for learn sessions", async () => {
    const user = userEvent.setup();
    const onStartSession = vi.fn();

    render(<WordbookDashboard mode="learn" onStartSession={onStartSession} />);

    await user.click(screen.getByRole("button", { name: /开始 Learn/ }));

    expect(onStartSession).toHaveBeenCalledWith("learn", 10);
  });

  it("persists Learn target count from dashboard settings", async () => {
    const user = userEvent.setup();
    const onStartSession = vi.fn();

    render(<WordbookDashboard mode="learn" onStartSession={onStartSession} />);

    await user.click(
      within(screen.getByRole("group", { name: "Learn 每组" })).getByRole(
        "button",
        { name: "20" },
      ),
    );
    await user.click(screen.getByRole("button", { name: /开始 Learn/ }));

    expect(JSON.parse(window.localStorage.getItem(wordbookStudySettingsStorageKey) ?? "{}")).toMatchObject({
      learnTargetCount: 20,
      reviewTargetCount: 10,
    });
    expect(onStartSession).toHaveBeenCalledWith("learn", 20);
  });

  it("keeps Review quiet when there are no due words", () => {
    render(<WordbookDashboard mode="review" onStartSession={vi.fn()} />);

    expect(screen.getByRole("button", { name: /开始 Review/ })).toBeDisabled();
    expect(screen.getByText("现在没有到期复习词。")).toBeInTheDocument();
    expect(screen.getByText("未到期")).toBeInTheDocument();
    expect(screen.queryByText("可学习")).not.toBeInTheDocument();
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

  it("shows the postgrad boundary note without fabricating a postgrad wordbook", () => {
    window.localStorage.setItem(examTargetStorageKey, "postgrad");

    render(<WordbookDashboard mode="learn" onStartSession={vi.fn()} />);

    expect(screen.getByText("CET-6 基础词书 V1")).toBeInTheDocument();
    expect(
      screen.getByText("考研词书还没接入可机读来源，先用 CET-6 基础词书 V1。"),
    ).toBeInTheDocument();
  });
});
