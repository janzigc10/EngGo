// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
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
});
