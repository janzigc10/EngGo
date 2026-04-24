import { describe, expect, it } from "vitest";

import type { AnswerGrounding } from "@/features/answering/build-grounding";
import { buildSystemPrompt } from "@/features/answering/build-system-prompt";

describe("buildSystemPrompt", () => {
  it("guides shape-neighbor answers as lookalike clusters", () => {
    const grounding: AnswerGrounding = {
      activeExamTarget: "cet6",
      activeExamTargetLabel: "CET-6",
      query: "跟 recent 很像的词有哪些",
      queryMode: "shape_neighbor_search",
      resolution: "resolved",
      noMatchReason: null,
      mainAnswer: [
        {
          entryId: "recent",
          lemma: "recent",
          meaningsZh: ["最近的"],
          matchedAlias: null,
          scopeCodes: ["cet6"],
          inScope: true,
          reason: "当前考试范围命中，来自同一易混词组",
          score: 300,
        },
        {
          entryId: "resent",
          lemma: "resent",
          meaningsZh: ["怨恨"],
          matchedAlias: null,
          scopeCodes: ["cet6"],
          inScope: true,
          reason: "当前考试范围命中，来自同一易混词组",
          score: 300,
        },
      ],
      confusionBoundary: [],
      scopeReminder: "这次回答已优先锁定在 CET-6 范围内。",
      followUpPrompt: "如果你愿意，我可以继续把 recent / resent 的区别拆开。",
      comparisonView: {
        id: "recent-resent",
        whyConfusing: "recent 和 resent 只差一个字母。",
        commonMisusePoints: [],
        semanticBoundaryNotes: ["recent 看时间线，resent 看情绪态度。"],
        members: [
          {
            entryId: "recent",
            lemma: "recent",
            meaningsZh: ["最近的"],
            emphasisNote: null,
            inScope: true,
          },
          {
            entryId: "resent",
            lemma: "resent",
            meaningsZh: ["怨恨"],
            emphasisNote: null,
            inScope: true,
          },
        ],
      },
    };

    expect(buildSystemPrompt(grounding)).toContain("形近词簇");
  });
});
