import { describe, expect, it } from "vitest";

import type { ActiveStudySessionSnapshot } from "@/features/wordbook/wordbook-active-session-store";
import { buildWordbookDailyOverview } from "@/features/wordbook/wordbook-daily-overview";
import type { WordbookProgressSnapshot } from "@/features/wordbook/wordbook-progress-store";
import type {
  StudyMode,
  StudySessionGoal,
  Wordbook,
} from "@/features/wordbook/wordbook-types";

const wordbook: Wordbook = {
  id: "cet6-foundation-v1",
  examTarget: "cet6",
  label: "CET-6 ECDICT 基础词书 V1",
  sourceLabel: "test",
  entries: [],
};

const baseSnapshot: WordbookProgressSnapshot = {
  total: 20,
  passed: 4,
  learnable: 16,
  unseen: 16,
  learning: 0,
  dueReview: 0,
  reviewRescue: 0,
  scheduledReview: 4,
  blocked: 0,
};

function buildSnapshot(
  overrides: Partial<WordbookProgressSnapshot>,
): WordbookProgressSnapshot {
  return {
    ...baseSnapshot,
    ...overrides,
  };
}

function buildSession(
  mode: StudyMode,
  targetCount: StudySessionGoal,
  completedCount: number,
): ActiveStudySessionSnapshot {
  return {
    version: 1,
    mode,
    wordbookId: wordbook.id,
    targetCount,
    sessionId: `${mode}-session`,
    startedAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:10:00.000Z",
    state: {
      mode,
      sessionId: `${mode}-session`,
      wordbookId: wordbook.id,
      stage: mode === "learn" ? "recognitionChoice" : "hiddenSelfRecall",
      current: null,
      pending: [],
      reserve: [],
      completedTargetLemmas: Array.from(
        { length: completedCount },
        (_, index) => `${mode}-${index}`,
      ),
      totalTargets: targetCount,
      cardExposureCount: 0,
    },
  };
}

function buildOverview(
  input: Partial<Parameters<typeof buildWordbookDailyOverview>[0]> = {},
) {
  return buildWordbookDailyOverview({
    wordbook,
    snapshot: baseSnapshot,
    settings: {
      learnTargetCount: 10,
      reviewTargetCount: 20,
    },
    activeLearnSession: null,
    activeReviewSession: null,
    ...input,
  });
}

describe("buildWordbookDailyOverview", () => {
  it("shows review and learn as choices instead of one forced daily decision", () => {
    const overview = buildOverview({
      snapshot: buildSnapshot({
        dueReview: 3,
        learnable: 8,
        unseen: 8,
        passed: 12,
      }),
    });

    expect(overview.title).toBe("复习和新词都在这里");
    expect(overview.summary).toContain("不替你排序");
    expect(overview.summary).not.toMatch(/必须|推荐|优先|先做/);
    expect(overview.actions.map((action) => action.kind)).toEqual([
      "start_review",
      "start_learn",
      "view_progress",
    ]);
    expect(overview.actions.map((action) => action.label)).toEqual([
      "复习到期词",
      "学习新词",
      "查看进度",
    ]);
  });

  it("keeps unfinished learn and review sessions as separate continuation entries", () => {
    const overview = buildOverview({
      snapshot: buildSnapshot({
        dueReview: 5,
        learnable: 7,
      }),
      activeLearnSession: buildSession("learn", 10, 2),
      activeReviewSession: buildSession("review", 20, 6),
    });

    expect(overview.title).toBe("有未完成的学习轮次");
    expect(overview.actions.map((action) => action.kind)).toEqual([
      "continue_review",
      "continue_learn",
      "view_progress",
    ]);
    expect(overview.actions[0]).toMatchObject({
      label: "继续复习",
      detail: "已完成 6 / 20",
    });
    expect(overview.actions[1]).toMatchObject({
      label: "继续学习",
      detail: "已完成 2 / 10",
    });
  });

  it("falls back to progress when there is no due review or learnable word", () => {
    const overview = buildOverview({
      snapshot: buildSnapshot({
        passed: 20,
        learnable: 0,
        unseen: 0,
        dueReview: 0,
        scheduledReview: 20,
      }),
    });

    expect(overview.title).toBe("今天没有堆积任务");
    expect(overview.summary).toContain("没有到期复习，也没有可学新词");
    expect(overview.actions).toEqual([
      {
        kind: "view_progress",
        href: "/progress",
        label: "查看进度",
        detail: "20 / 20 已阶段通过",
        tone: "strong",
      },
    ]);
  });
});
