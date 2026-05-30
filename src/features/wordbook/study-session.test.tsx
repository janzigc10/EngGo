// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import {
  prepareProgressRecordsForSession,
  StudySession,
} from "@/features/wordbook/study-session";
import {
  createDefaultProgress,
  getNextReviewAt,
  saveWordProgress,
  wordbookProgressStorageKey,
} from "@/features/wordbook/wordbook-progress-store";
import type { Wordbook } from "@/features/wordbook/wordbook-types";

function storedRecords() {
  return JSON.parse(window.localStorage.getItem(wordbookProgressStorageKey) ?? "{}") as {
    records?: Array<{ lemma: string; status: string; reviewStrength: number }>;
  };
}

describe("StudySession", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("opens a Learn recognition card with exactly four options", () => {
    const wordbook = getDefaultWordbook();

    render(<StudySession mode="learn" onExit={vi.fn()} />);

    expect(screen.getByText(wordbook.entries[0].lemma)).toBeInTheDocument();
    const optionButtons = screen
      .getAllByRole("button")
      .filter((button) =>
        wordbook.entries.some((entry) => entry.meaningsZh[0] === button.textContent),
      );

    expect(optionButtons).toHaveLength(4);
  });

  it("passes a Learn word after three mastery checks and persists progress", async () => {
    const user = userEvent.setup();
    const wordbook = getDefaultWordbook();
    const entry = wordbook.entries[0];

    render(<StudySession mode="learn" onExit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: entry.meaningsZh[0] }));
    expect(screen.getByText("Meaning")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "认识" }));
    await user.click(screen.getByRole("button", { name: "认识" }));

    await waitFor(() => {
      expect(storedRecords().records?.[0]).toMatchObject({
        lemma: entry.lemma,
        status: "passed",
        reviewStrength: 1,
      });
    });
  });

  it("reveals the answer after a wrong Learn choice", async () => {
    const user = userEvent.setup();
    const wordbook = getDefaultWordbook();
    const entry = wordbook.entries[0];

    render(<StudySession mode="learn" onExit={vi.fn()} />);

    const wrongButton = screen
      .getAllByRole("button")
      .find(
        (button) =>
          button.textContent &&
          button.textContent !== entry.meaningsZh[0] &&
          button.textContent !== "看答案" &&
          button.textContent !== "退出",
      );

    expect(wrongButton).toBeDefined();
    await user.click(wrongButton!);

    expect(screen.getByText("Meaning")).toBeInTheDocument();
    expect(screen.getByText(entry.meaningsZh.join("；"))).toBeInTheDocument();
    expect(storedRecords().records?.[0]).toMatchObject({
      lemma: entry.lemma,
      status: "learning",
    });
  });

  it("starts Review with hidden self recall and passes remembered words", async () => {
    const user = userEvent.setup();
    const wordbook = getDefaultWordbook();
    const entry = wordbook.entries[0];

    saveWordProgress({
      ...createDefaultProgress(entry, wordbook.id, new Date("2026-05-29")),
      status: "passed",
      masteryDots: 3,
      reviewStrength: 1,
      nextReviewAt: getNextReviewAt(new Date("2026-05-29"), 1),
    });

    render(<StudySession mode="review" onExit={vi.fn()} />);

    const actions = screen.getAllByRole("button");
    expect(within(document.body).getByRole("button", { name: "认识" })).toBeInTheDocument();
    expect(actions.some((button) => button.textContent === "模糊")).toBe(true);
    expect(actions.some((button) => button.textContent === "忘记了")).toBe(true);

    await user.click(screen.getByRole("button", { name: "认识" }));
    expect(screen.getByText("Meaning")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一词" }));

    await waitFor(() => {
      expect(storedRecords().records?.[0]).toMatchObject({
        lemma: entry.lemma,
        status: "passed",
        reviewStrength: 2,
      });
    });
  });

  it("routes forgotten Review words through detail and recognition", async () => {
    const user = userEvent.setup();
    const wordbook = getDefaultWordbook();
    const entry = wordbook.entries[0];

    saveWordProgress({
      ...createDefaultProgress(entry, wordbook.id, new Date("2026-05-29")),
      status: "passed",
      masteryDots: 3,
      reviewStrength: 2,
      nextReviewAt: getNextReviewAt(new Date("2026-05-29"), 1),
    });

    render(<StudySession mode="review" onExit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "忘记了" }));
    expect(screen.getByText("Meaning")).toBeInTheDocument();
    expect(storedRecords().records?.[0]).toMatchObject({
      lemma: entry.lemma,
      status: "lapsed",
      reviewStrength: 1,
    });

    await user.click(screen.getByRole("button", { name: "继续" }));
    expect(screen.getByRole("button", { name: entry.meaningsZh[0] })).toBeInTheDocument();
  });

  it("preflights blocked entries before a session starts", () => {
    const sparseWordbook: Wordbook = {
      id: "cet6-foundation-v1",
      label: "Sparse",
      sourceLabel: "test",
      entries: [
        {
          id: "solo",
          lemma: "solo",
          aliases: [],
          pos: ["noun"],
          meaningsZh: ["单独"],
          examScopes: ["cet6"],
          examples: [],
          collocations: [],
        },
      ],
    };

    const records = prepareProgressRecordsForSession(
      sparseWordbook,
      new Date("2026-05-30"),
    );

    expect(records).toEqual([
      expect.objectContaining({
        lemma: "solo",
        status: "blockedContent",
      }),
    ]);
  });
});
