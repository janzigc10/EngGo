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
      answerStyle: "confusion_untangle",
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
      rootFamilyView: null,
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

  it("guides confusion-untangle answers with a decision split", () => {
    const grounding: AnswerGrounding = {
      activeExamTarget: "cet4",
      activeExamTargetLabel: "CET-4",
      query: "stationary 和 stationery 哪个是文具",
      queryMode: "direct_compare",
      answerStyle: "confusion_untangle",
      resolution: "resolved",
      noMatchReason: null,
      mainAnswer: [
        {
          entryId: "stationary",
          lemma: "stationary",
          meaningsZh: ["静止的"],
          matchedAlias: null,
          scopeCodes: ["cet4"],
          inScope: true,
          reason: "当前考试范围命中，来自同一易混词组",
          score: 300,
        },
        {
          entryId: "stationery",
          lemma: "stationery",
          meaningsZh: ["文具"],
          matchedAlias: null,
          scopeCodes: ["cet4"],
          inScope: true,
          reason: "当前考试范围命中，来自同一易混词组",
          score: 300,
        },
      ],
      confusionBoundary: [],
      scopeReminder: "这次回答已优先锁定在 CET-4 范围内。",
      followUpPrompt: "如果你愿意，我可以继续把 stationary / stationery 的区别拆开。",
      rootFamilyView: null,
      comparisonView: {
        id: "stationary-stationery",
        whyConfusing: "stationary 和 stationery 只差 a/e，是经典形近拼写混淆。",
        commonMisusePoints: ["stationary 是形容词，stationery 是名词。"],
        semanticBoundaryNotes: ["stationary 描述不动，stationery 指纸笔等文具。"],
        members: [
          {
            entryId: "stationary",
            lemma: "stationary",
            meaningsZh: ["静止的"],
            emphasisNote: "a 可联想 stay，表示不动。",
            inScope: true,
          },
          {
            entryId: "stationery",
            lemma: "stationery",
            meaningsZh: ["文具"],
            emphasisNote: "e 可联想 envelope，表示文具。",
            inScope: true,
          },
        ],
      },
    };

    const prompt = buildSystemPrompt(grounding);

    expect(prompt).toContain("先问一句");
    expect(prompt).toContain("2-4 个分流项");
    expect(prompt).toContain("题里抓");
    expect(prompt).toContain("不要把回答写成泛泛词典百科");
  });

  it("guides root-family answers as a structured map", () => {
    const grounding: AnswerGrounding = {
      activeExamTarget: "cet6",
      activeExamTargetLabel: "CET-6",
      query: "stitute 是什么",
      queryMode: "root_family_summary",
      resolution: "resolved",
      noMatchReason: null,
      mainAnswer: [
        {
          entryId: "institute",
          lemma: "institute",
          meaningsZh: ["设立", "机构"],
          matchedAlias: "institute a policy",
          scopeCodes: ["cet6", "postgrad"],
          inScope: true,
          reason: "当前考试范围命中，来自词根家族原型",
          score: 300,
        },
        {
          entryId: "institution",
          lemma: "institution",
          meaningsZh: ["机构", "制度"],
          matchedAlias: "public institution",
          scopeCodes: ["cet4", "cet6", "postgrad"],
          inScope: true,
          reason: "当前考试范围命中，来自词根家族原型",
          score: 280,
        },
      ],
      confusionBoundary: [],
      scopeReminder: "这次回答已优先锁定在 CET-6 范围内。",
      followUpPrompt: "如果你愿意，我可以继续把 institute / institution 的区别也拆开。",
      comparisonView: null,
      answerStyle: "root_family_summary",
      rootFamilyView: {
        id: "root-stitute",
        fragment: "stitute",
        coreImage: "放置 / 建立",
        note: "stitute 不是独立单词，更像构词部件。",
        caution: "不是每个前缀组合都成立，不要硬凑。",
        members: [
          {
            lemma: "institute",
            prefix: "in-",
            prefixDirection: "放进去",
            actionStory: "把制度或机构放进去",
            modernMeaningZh: "设立；机构",
            priority: "must_memorize",
            entryId: "institute",
            inScope: true,
          },
          {
            lemma: "institution",
            prefix: null,
            prefixDirection: "已经形成的结果",
            actionStory: "由设立动作沉淀出来的机构或制度",
            modernMeaningZh: "机构；制度",
            priority: "must_memorize",
            entryId: "institution",
            inScope: true,
          },
          {
            lemma: "constitute",
            prefix: "con-",
            prefixDirection: "放到一起",
            actionStory: "把部分放到一起形成整体",
            modernMeaningZh: "构成",
            priority: "recognize",
            entryId: null,
            inScope: false,
          },
        ],
      },
    };

    const prompt = buildSystemPrompt(grounding);

    expect(prompt).toContain("词根家族地图");
    expect(prompt).toContain("前缀方向");
    expect(prompt).toContain("优先背");
    expect(prompt).toContain("不成立");
    expect(prompt).toContain("不要硬凑");
  });
});
