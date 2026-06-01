// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ProgressPanel } from "@/features/collections/study-panels";
import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import {
  createDefaultProgress,
  getNextReviewAt,
  saveWordProgress,
} from "@/features/wordbook/wordbook-progress-store";

describe("wordbook progress summary", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows wordbook progress and keeps collection totals visible", () => {
    const wordbook = getDefaultWordbook();
    const entry = wordbook.entries[0];

    window.localStorage.setItem(
      "enggo.collectedWords",
      JSON.stringify({
        cet6: [
          {
            examTarget: "cet6",
            lemma: "access",
            note: "进入权；使用权",
            meaningZh: "进入权；使用权",
            collectedAt: "2026-05-16T07:00:00.000Z",
          },
        ],
      }),
    );
    saveWordProgress({
      ...createDefaultProgress(entry, wordbook.id, new Date("2026-05-29")),
      status: "passed",
      masteryDots: 3,
      reviewStrength: 1,
      nextReviewAt: getNextReviewAt(new Date("2026-05-29"), 1),
    });

    render(<ProgressPanel />);

    expect(screen.getByText("总收藏词条")).toBeInTheDocument();
    expect(screen.getByText("词书进度")).toBeInTheDocument();
    expect(screen.getByText("CET-6 ECDICT 基础词书 V1")).toBeInTheDocument();
    expect(screen.getByText("未学习")).toBeInTheDocument();
    expect(screen.getByText("学习中")).toBeInTheDocument();
    expect(screen.getByText("待复习")).toBeInTheDocument();
    expect(screen.getByText("补救中")).toBeInTheDocument();
    expect(screen.getByText("已阶段通过")).toBeInTheDocument();
    expect(
      screen.getByText(/今天需要 Review 的词，包含到期词和补救词/),
    ).toBeInTheDocument();
  });
});
