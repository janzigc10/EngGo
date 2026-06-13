// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveWordbookSnapshot } from "@/features/wordbook/wordbook-active-store";
import {
  wordbookDailyStatsStorageKey,
} from "@/features/wordbook/wordbook-daily-stats-store";
import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import { WordbookManagementPanel } from "@/features/wordbook/wordbook-management-panel";
import {
  createDefaultProgress,
  saveWordProgress,
} from "@/features/wordbook/wordbook-progress-store";
import {
  loadWordbookStudySettings,
} from "@/features/wordbook/wordbook-study-settings-store";

function expectMetricValue(label: string, value: number) {
  const metric = screen.getByText(label).closest("div");

  expect(metric).toHaveTextContent(new RegExp(`^${label}\\s*${value}$`));
}

describe("WordbookManagementPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 13, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the active wordbook dashboard, selector, settings, and empty activity summary", () => {
    render(<WordbookManagementPanel />);

    expect(
      screen.getByRole("heading", { name: "CET-6 ECDICT 基础词书 V1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "选择词书" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "词书进度" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Learn 每组" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("过去 7 天还没有 Learn / Review 活动记录。"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: /过去 7 天还没有 Learn \/ Review 活动记录/,
      }),
    ).toBeInTheDocument();
  });

  it("renders a compact activity summary from daily stats", () => {
    window.localStorage.setItem(
      wordbookDailyStatsStorageKey,
      JSON.stringify({
        records: [
          {
            date: "2026-06-12",
            wordbookId: "cet6-foundation-v1",
            learnActivityCount: 2,
            learnCompletedCount: 1,
            reviewActivityCount: 0,
            reviewCompletedCount: 0,
            updatedAt: "2026-06-12T01:00:00.000Z",
          },
          {
            date: "2026-06-13",
            wordbookId: "cet6-foundation-v1",
            learnActivityCount: 0,
            learnCompletedCount: 0,
            reviewActivityCount: 3,
            reviewCompletedCount: 2,
            updatedAt: "2026-06-13T01:00:00.000Z",
          },
          {
            date: "2026-06-13",
            wordbookId: "cet4-foundation-v1",
            learnActivityCount: 99,
            learnCompletedCount: 99,
            reviewActivityCount: 99,
            reviewCompletedCount: 99,
            updatedAt: "2026-06-13T01:00:00.000Z",
          },
        ],
      }),
    );

    render(<WordbookManagementPanel />);

    expect(
      screen.getByText(
        "过去 7 天记录 5 次活动：Learn 2 次，Review 3 次，完成 3 次。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: /06\/12: Learn 2, Review 0；06\/13: Learn 0, Review 3/,
      }),
    ).toBeInTheDocument();
  });

  it("switches the active wordbook from the dashboard selector", () => {
    render(<WordbookManagementPanel />);

    fireEvent.click(screen.getByRole("button", { name: /高考/ }));

    expect(getActiveWordbookSnapshot()).toBe("gaokao-foundation-v1");
    expect(
      screen.getByRole("heading", { name: "高考 ECDICT 基础词书 V1" }),
    ).toBeInTheDocument();
  });

  it("renders seeded progress metrics with progressbar semantics", () => {
    const wordbook = getDefaultWordbook();
    const [learningEntry, dueEntry, rescueEntry, blockedEntry] = wordbook.entries;

    saveWordProgress({
      ...createDefaultProgress(learningEntry, wordbook.id, new Date("2026-06-10")),
      status: "learning",
      masteryDots: 1,
      seenCount: 1,
    });
    saveWordProgress({
      ...createDefaultProgress(dueEntry, wordbook.id, new Date("2026-06-10")),
      status: "passed",
      masteryDots: 3,
      reviewStrength: 1,
      nextReviewAt: "2026-06-01T00:00:00.000Z",
    });
    saveWordProgress({
      ...createDefaultProgress(rescueEntry, wordbook.id, new Date("2026-06-10")),
      status: "reviewLapsed",
      masteryDots: 1,
      reviewStrength: 1,
      wrongCount: 1,
    });
    saveWordProgress({
      ...createDefaultProgress(blockedEntry, wordbook.id, new Date("2026-06-10")),
      status: "blockedContent",
    });

    render(<WordbookManagementPanel />);

    expectMetricValue("总词数", wordbook.entries.length);
    expectMetricValue("未学习", wordbook.entries.length - 4);
    expectMetricValue("学习中", 1);
    expectMetricValue("待复习", 2);
    expectMetricValue("补救中", 1);
    expectMetricValue("已通过", 1);
    expect(
      screen.getByRole("progressbar", { name: "词书进度" }),
    ).toHaveAttribute(
      "aria-valuenow",
      String(Math.round((1 / wordbook.entries.length) * 100)),
    );
  });

  it("persists study settings from the management page", () => {
    render(<WordbookManagementPanel />);

    fireEvent.click(
      within(screen.getByRole("group", { name: "Learn 每组" })).getByRole(
        "button",
        { name: "20" },
      ),
    );

    expect(loadWordbookStudySettings()).toEqual({
      learnTargetCount: 20,
      reviewTargetCount: 10,
    });

    fireEvent.click(
      within(screen.getByRole("group", { name: "Review 每组" })).getByRole(
        "button",
        { name: "30" },
      ),
    );

    expect(loadWordbookStudySettings()).toEqual({
      learnTargetCount: 20,
      reviewTargetCount: 30,
    });
  });
});
