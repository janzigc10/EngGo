// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { AnswerActions } from "@/components/chat/answer-actions";

describe("AnswerActions", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows saved state from persisted collections on initial render", () => {
    window.localStorage.setItem(
      "enggo.collectedWords",
      JSON.stringify({
        cet6: [
          {
            examTarget: "cet6",
            lemma: "comply",
            note: "遵从",
            collectedAt: "2026-04-21T00:00:00.000Z",
          },
        ],
      }),
    );

    render(
      <AnswerActions
        grounding={{
          activeExamTarget: "cet6",
          activeExamTargetLabel: "CET-6",
          query: "遵从怎么说",
          queryMode: "meaning_lookup",
          resolution: "resolved",
          noMatchReason: null,
          mainAnswer: [
            {
              entryId: "comply",
              lemma: "comply",
              meaningsZh: ["遵从"],
              matchedAlias: "comply with",
              scopeCodes: ["cet6"],
              inScope: true,
              reason: "in-scope main answer",
              score: 10,
            },
          ],
          confusionBoundary: [],
          scopeReminder: "scope reminder",
          followUpPrompt: "follow-up",
          comparisonView: null,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "已收藏" })).toBeInTheDocument();
  });

  it("collapses long main-answer action lists until the learner expands them", async () => {
    const user = userEvent.setup();
    const candidates = Array.from({ length: 8 }, (_, index) => ({
      entryId: `word-${index + 1}`,
      lemma: `word${index + 1}`,
      meaningsZh: [`释义${index + 1}`],
      matchedAlias: null,
      scopeCodes: ["cet6"],
      inScope: true,
      reason: "in-scope main answer",
      score: 10 - index,
    }));

    render(
      <AnswerActions
        grounding={{
          activeExamTarget: "cet6",
          activeExamTargetLabel: "CET-6",
          query: "tion 结尾的词有哪些",
          queryMode: "root_family_summary",
          answerStyle: "root_family_summary",
          resolution: "resolved",
          noMatchReason: null,
          mainAnswer: candidates,
          confusionBoundary: [],
          scopeReminder: "scope reminder",
          followUpPrompt: "follow-up",
          comparisonView: null,
          rootFamilyView: null,
        }}
      />,
    );

    expect(screen.getAllByRole("button", { name: "加入收藏" })).toHaveLength(5);
    expect(screen.queryByText("word6")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开全部 8 个" }));

    expect(screen.getAllByRole("button", { name: "加入收藏" })).toHaveLength(8);
    expect(screen.getByText("word8")).toBeInTheDocument();
  });
});
