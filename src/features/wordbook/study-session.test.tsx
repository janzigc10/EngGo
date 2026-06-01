// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import {
  DetailBlock,
  prepareProgressRecordsForSession,
  StudySession,
} from "@/features/wordbook/study-session";
import {
  loadActiveStudySession,
  saveActiveStudySession,
} from "@/features/wordbook/wordbook-active-session-store";
import {
  createDefaultProgress,
  getNextReviewAt,
  saveWordProgress,
  wordbookProgressStorageKey,
} from "@/features/wordbook/wordbook-progress-store";
import {
  saveWordbookStudySettings,
} from "@/features/wordbook/wordbook-study-settings-store";
import type {
  StudyCardStage,
  StudySessionState,
  WordStudyProgress,
  Wordbook,
  WordbookEntry,
} from "@/features/wordbook/wordbook-types";

function storedRecords() {
  return JSON.parse(window.localStorage.getItem(wordbookProgressStorageKey) ?? "{}") as {
    records?: Array<{ lemma: string; status: string; reviewStrength: number }>;
  };
}

function saveProgressRecords(records: WordStudyProgress[]) {
  window.localStorage.setItem(
    wordbookProgressStorageKey,
    JSON.stringify({ records }),
  );
}

function savePassedEntry(entry: WordbookEntry, wordbook: Wordbook) {
  saveWordProgress({
    ...createDefaultProgress(entry, wordbook.id, new Date("2026-05-29")),
    status: "passed",
    masteryDots: 3,
    reviewStrength: 1,
    nextReviewAt: getNextReviewAt(new Date("2026-05-29"), 1),
  });
}

function makeDetailState(
  entry: WordbookEntry,
  stage: StudyCardStage,
  resumeStage?: StudyCardStage,
): StudySessionState {
  const progress = createDefaultProgress(
    entry,
    "cet6-foundation-v1",
    new Date("2026-05-30"),
  );

  return {
    mode: "learn",
    sessionId: `test-${stage}`,
    wordbookId: "cet6-foundation-v1",
    stage,
    current: {
      entry,
      progress,
      masteryDots: stage === "passDetail" ? 3 : stage === "guidedDetail" ? 2 : 1,
      failedAttempts: 0,
      resumeStage: resumeStage ??
        stage === "passDetail"
          ? "finalRecall"
          : stage === "guidedDetail"
            ? "guidedRecall"
            : "recognitionChoice",
      eligibleAfterExposure: 0,
    },
    pending: [],
    reserve: [],
    completedTargetLemmas: [],
    totalTargets: 1,
    cardExposureCount: 1,
  };
}

function makeLayeredDetailEntry(): WordbookEntry {
  return {
    id: "aboard-test",
    lemma: "aboard",
    aliases: [],
    pos: ["adverb", "preposition"],
    meaningsZh: ["在船上", "在飞机上", "上交通工具"],
    examScopes: ["cet6"],
    examples: ["Passengers are already aboard the plane."],
    collocations: ["go aboard", "aboard the ship"],
  };
}

describe("StudySession", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("opens a Learn recognition card with exactly four options", () => {
    const wordbook = getDefaultWordbook();

    render(<StudySession mode="learn" targetCount={10} onExit={vi.fn()} />);

    expect(screen.getByText(wordbook.entries[0].lemma)).toBeInTheDocument();
    const optionButtons = screen
      .getAllByRole("button")
      .filter((button) =>
        wordbook.entries.some((entry) => entry.meaningsZh[0] === button.textContent),
      );

    expect(optionButtons).toHaveLength(4);
  });

  it("renders a Learn empty state instead of a 0 target completion", () => {
    const wordbook = getDefaultWordbook();

    saveProgressRecords(
      wordbook.entries.map((entry) => ({
        ...createDefaultProgress(entry, wordbook.id, new Date("2026-05-30")),
        status: "passed",
        masteryDots: 3,
        reviewStrength: 2,
        nextReviewAt: "2026-06-02T00:00:00.000Z",
      })),
    );

    render(<StudySession mode="learn" targetCount={10} onExit={vi.fn()} />);

    expect(screen.getByText("现在没有可学习词")).toBeInTheDocument();
    expect(screen.queryByText("本轮完成")).not.toBeInTheDocument();
    expect(screen.queryByText("0 / 10")).not.toBeInTheDocument();
  });

  it("renders a Review empty state when there are no due words", () => {
    render(<StudySession mode="review" targetCount={10} onExit={vi.fn()} />);

    expect(screen.getByText("现在没有到期复习词")).toBeInTheDocument();
    expect(screen.queryByText("本轮完成")).not.toBeInTheDocument();
    expect(screen.queryByText("0 / 10")).not.toBeInTheDocument();
  });

  it("keeps the active session denominator frozen after settings change", () => {
    render(<StudySession mode="learn" targetCount={20} onExit={vi.fn()} />);

    expect(screen.getByText("0 / 20")).toBeInTheDocument();

    saveWordbookStudySettings({
      learnTargetCount: 10,
      reviewTargetCount: 30,
    });

    expect(screen.getByText("0 / 20")).toBeInTheDocument();
    expect(screen.queryByText("0 / 10")).not.toBeInTheDocument();
  });

  it("restores an in-progress Learn session after exit and remount", async () => {
    const user = userEvent.setup();
    const wordbook = getDefaultWordbook();
    const entry = wordbook.entries[0];
    const nextEntry = wordbook.entries[1];
    const firstRender = render(
      <StudySession mode="learn" targetCount={10} onExit={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: entry.meaningsZh[0] }));
    await user.click(screen.getByRole("button", { name: "继续" }));

    expect(screen.getByText(nextEntry.lemma)).toBeInTheDocument();
    expect(loadActiveStudySession({
      mode: "learn",
      wordbookId: wordbook.id,
    })?.state.current?.entry.lemma).toBe(nextEntry.lemma);

    firstRender.unmount();
    render(<StudySession mode="learn" targetCount={10} onExit={vi.fn()} />);

    expect(screen.getByText(nextEntry.lemma)).toBeInTheDocument();
    expect(screen.getByText("0 / 10")).toBeInTheDocument();
  });

  it("restores a forgotten Review session without rebuilding the rescue queue", async () => {
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

    const firstRender = render(
      <StudySession mode="review" targetCount={10} onExit={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "忘记了" }));

    expect(screen.getByText("Meaning")).toBeInTheDocument();
    expect(loadActiveStudySession({
      mode: "review",
      wordbookId: wordbook.id,
    })?.state.stage).toBe("forgotDetail");

    firstRender.unmount();
    render(<StudySession mode="review" targetCount={10} onExit={vi.fn()} />);

    expect(screen.getByText(entry.lemma)).toBeInTheDocument();
    expect(screen.getByText("Meaning")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "模糊" })).not.toBeInTheDocument();
  });

  it("clears the active session after completion", async () => {
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

    render(<StudySession mode="review" targetCount={10} onExit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "认识" }));
    await user.click(screen.getByRole("button", { name: "下一词" }));

    expect(screen.getByText("本轮完成")).toBeInTheDocument();
    expect(loadActiveStudySession({
      mode: "review",
      wordbookId: wordbook.id,
    })).toBeNull();
  });

  it("drops an incompatible saved session and creates a fresh one", () => {
    const wordbook = getDefaultWordbook();
    const state = makeDetailState(wordbook.entries[0], "detailReveal");

    saveActiveStudySession({
      mode: "learn",
      wordbookId: wordbook.id,
      targetCount: 10,
      state: {
        ...state,
        current: state.current
          ? {
              ...state.current,
              entry: { ...state.current.entry, lemma: "__missing__" },
              progress: { ...state.current.progress, lemma: "__missing__" },
            }
          : null,
      },
    });

    render(<StudySession mode="learn" targetCount={10} onExit={vi.fn()} />);

    expect(screen.queryByText("__missing__")).not.toBeInTheDocument();
    expect(screen.getByText(wordbook.entries[0].lemma)).toBeInTheDocument();
  });

  it("moves away from a Learn word after the first mastery dot", async () => {
    const user = userEvent.setup();
    const wordbook = getDefaultWordbook();
    const entry = wordbook.entries[0];
    const nextEntry = wordbook.entries[1];

    render(<StudySession mode="learn" targetCount={10} onExit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: entry.meaningsZh[0] }));
    expect(screen.getByText("Meaning")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "继续" }));

    expect(screen.queryByText(entry.lemma)).not.toBeInTheDocument();
    expect(screen.getByText(nextEntry.lemma)).toBeInTheDocument();
    expect(storedRecords().records?.[0]).toMatchObject({
      lemma: entry.lemma,
      status: "learning",
      masteryDots: 1,
    });
  });

  it("renders first Learn detail without collocations", () => {
    const entry = makeLayeredDetailEntry();

    render(<DetailBlock state={makeDetailState(entry, "detailReveal")} />);

    expect(screen.getByText("adv./prep. 在船上")).toBeInTheDocument();
    expect(screen.queryByText(/在飞机上/)).not.toBeInTheDocument();
    expect(screen.getByText("Passengers are already aboard the plane.")).toBeInTheDocument();
    expect(screen.queryByText("go aboard")).not.toBeInTheDocument();
    expect(screen.queryByText("aboard the ship")).not.toBeInTheDocument();
  });

  it("renders second Learn detail with collocations when available", () => {
    const entry = makeLayeredDetailEntry();

    render(<DetailBlock state={makeDetailState(entry, "guidedDetail")} />);

    expect(screen.getByText("adv./prep. 在船上")).toBeInTheDocument();
    expect(screen.getByText("Passengers are already aboard the plane.")).toBeInTheDocument();
    expect(screen.getByText("go aboard")).toBeInTheDocument();
    expect(screen.getByText("aboard the ship")).toBeInTheDocument();
    expect(screen.queryByText(/在飞机上/)).not.toBeInTheDocument();
  });

  it("renders third Learn detail with complete entry details and pass confirmation", () => {
    const entry = makeLayeredDetailEntry();

    render(<DetailBlock state={makeDetailState(entry, "passDetail")} />);

    expect(screen.getByText("本轮已通过")).toBeInTheDocument();
    expect(screen.getByText("adv./prep. 在船上；在飞机上；上交通工具")).toBeInTheDocument();
    expect(screen.getByText("Passengers are already aboard the plane.")).toBeInTheDocument();
    expect(screen.getByText("go aboard")).toBeInTheDocument();
    expect(screen.getByText("aboard the ship")).toBeInTheDocument();
  });

  it("does not render pass confirmation on third-light failure detail", () => {
    const entry = makeLayeredDetailEntry();

    render(<DetailBlock state={makeDetailState(entry, "answerReveal", "finalRecall")} />);

    expect(screen.queryByText("本轮已通过")).not.toBeInTheDocument();
    expect(screen.getByText("adv./prep. 在船上；在飞机上；上交通工具")).toBeInTheDocument();
    expect(screen.getByText("go aboard")).toBeInTheDocument();
    expect(screen.getByText("aboard the ship")).toBeInTheDocument();
  });

  it("renders wrong-choice contrast before the answer detail", async () => {
    const user = userEvent.setup();
    const wordbook = getDefaultWordbook();
    const entry = wordbook.entries[0];

    render(<StudySession mode="learn" targetCount={10} onExit={vi.fn()} />);

    const wrongEntry = wordbook.entries.find((candidate) => {
      if (candidate.lemma === entry.lemma) {
        return false;
      }

      return screen.queryByRole("button", { name: candidate.meaningsZh[0] });
    });

    expect(wrongEntry).toBeDefined();
    await user.click(screen.getByRole("button", { name: wrongEntry!.meaningsZh[0] }));

    expect(screen.getByText("Choice Contrast")).toBeInTheDocument();
    expect(screen.getByText(wrongEntry!.meaningsZh[0])).toBeInTheDocument();
    expect(screen.getByText(entry.meaningsZh[0])).toBeInTheDocument();
    expect(screen.getByText(/Distractor word:/)).toBeInTheDocument();
    expect(screen.queryByText("Meaning")).not.toBeInTheDocument();
    expect(storedRecords().records?.[0]).toMatchObject({
      lemma: entry.lemma,
      status: "learning",
      masteryDots: 0,
      wrongCount: 1,
    });

    await user.click(screen.getByRole("button", { name: "继续" }));

    expect(screen.getByText("Meaning")).toBeInTheDocument();
    expect(screen.getByText(/放弃/)).toBeInTheDocument();
  });

  it("skips contrast for an active Learn answer reveal", async () => {
    const user = userEvent.setup();

    render(<StudySession mode="learn" targetCount={10} onExit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "看答案" }));

    expect(screen.queryByText("Choice Contrast")).not.toBeInTheDocument();
    expect(screen.getByText("Meaning")).toBeInTheDocument();
  });

  it("keeps abbreviated part of speech inside the Chinese meaning line", async () => {
    const user = userEvent.setup();
    const wordbook = getDefaultWordbook();
    const entryIndex = wordbook.entries.findIndex((candidate) => candidate.lemma === "able");

    expect(entryIndex).toBeGreaterThanOrEqual(0);
    const entry = wordbook.entries[entryIndex];

    wordbook.entries
      .slice(0, entryIndex)
      .forEach((candidate) => savePassedEntry(candidate, wordbook));

    render(<StudySession mode="learn" targetCount={10} onExit={vi.fn()} />);

    expect(screen.getByText("able")).toBeInTheDocument();
    expect(screen.queryByText("adjective")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: entry.meaningsZh[0] }));

    expect(screen.queryByText("adjective")).not.toBeInTheDocument();
    expect(screen.getByText("adj. 能干的, 能够的")).toBeInTheDocument();
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

    render(<StudySession mode="review" targetCount={10} onExit={vi.fn()} />);

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

  it("returns forgotten Review words to Review relearn choices after detail", async () => {
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

    render(<StudySession mode="review" targetCount={10} onExit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "忘记了" }));
    expect(screen.getByText("Meaning")).toBeInTheDocument();
    expect(storedRecords().records?.[0]).toMatchObject({
      lemma: entry.lemma,
      status: "reviewLapsed",
      reviewStrength: 1,
    });

    await user.click(screen.getByRole("button", { name: "继续" }));
    expect(screen.getByRole("button", { name: entry.meaningsZh[0] })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "模糊" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "忘记了" })).not.toBeInTheDocument();
  });

  it("returns fuzzy Review words to Review relearn choices after detail", async () => {
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

    render(<StudySession mode="review" targetCount={10} onExit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "模糊" }));
    expect(screen.getByText("Meaning")).toBeInTheDocument();
    expect(storedRecords().records?.[0]).toMatchObject({
      lemma: entry.lemma,
      status: "reviewLapsed",
      reviewStrength: 1,
    });

    await user.click(screen.getByRole("button", { name: "继续" }));
    expect(screen.getByRole("button", { name: entry.meaningsZh[0] })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "认识" })).not.toBeInTheDocument();
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
