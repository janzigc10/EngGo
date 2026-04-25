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
            emphasisNote: "常见搭配 remain stationary，表示保持静止。",
            inScope: true,
          },
          {
            entryId: "stationery",
            lemma: "stationery",
            meaningsZh: ["文具"],
            emphasisNote: "常见搭配 stationery store，表示文具店。",
            inScope: true,
          },
        ],
      },
    };

    const prompt = buildSystemPrompt(grounding);

    expect(prompt).toContain("当前考试范围");
    expect(prompt).toContain("范围内相似词");
    expect(prompt).toContain("词义速览");
    expect(prompt).toContain("重点区分");
    expect(prompt).toContain("做题抓手");
    expect(prompt).toContain("每个词必须带中文核心义");
    expect(prompt).toContain("先列范围内召回到的相似词");
    expect(prompt).toContain("优先区分最容易混的 2 个");
    expect(prompt).toContain("不要把回答写成泛泛词典百科");
    expect(prompt).toContain("总长度控制在 260 个汉字以内");
    expect(prompt).toContain("最多 4 段");
    expect(prompt).toContain("每个词只给一行边界");
    expect(prompt).toContain("只输出这 4 段");
    expect(prompt).toContain("禁止例句、长列表和补充扩展");
    expect(prompt).toContain("短答示例");
    expect(prompt).toContain("范围内相似词：stationary / stationery");
    expect(prompt).toContain("词义速览：stationary=静止的；stationery=文具");
    expect(prompt).toContain("做题抓手：文具=stationery");
    expect(prompt).toContain("超过 2 个词时，用公式行压缩");
    expect(prompt).toContain("不要使用 e= envelope 这类牵强字母口诀");
    expect(prompt).not.toContain("必须出现“先问一句”");
    expect(prompt).not.toContain("e 可联想 envelope");
    expect(prompt).not.toContain("a 可联想 stay");
    expect(prompt).toContain("不要再套用通用四段标题");
  });

  it("adapts confusion-untangle guidance for root-family cluster labels", () => {
    const grounding: AnswerGrounding = {
      activeExamTarget: "cet6",
      activeExamTargetLabel: "CET-6",
      query: "institute substitute constitute 怎么分",
      queryMode: "direct_compare",
      answerStyle: "confusion_untangle",
      resolution: "resolved",
      noMatchReason: null,
      mainAnswer: [
        {
          entryId: "institute",
          lemma: "institute",
          meaningsZh: ["设立", "机构"],
          matchedAlias: null,
          scopeCodes: ["cet6"],
          inScope: true,
          reason: "来自同一个易混词组",
          score: 300,
        },
      ],
      confusionBoundary: [],
      scopeReminder: "这次回答已优先锁定在 CET-6 范围内。",
      followUpPrompt: "我可以继续拆 institute / institution 的区别。",
      rootFamilyView: null,
      comparisonView: {
        id: "root-stitute",
        labels: ["root_family", "shape_like", "exam_high_value"],
        anchorPattern: "stitute",
        quickDistinction: "institute=设立/机构；constitute=构成；substitute=替代",
        examHook: "先抓 institute / institution，再用 constitute / substitute 做对比。",
        whyConfusing: "这组词共享 stitute 片段，词形相近但现代意思不同。",
        commonMisusePoints: [],
        semanticBoundaryNotes: [],
        members: [],
      },
    };

    const prompt = buildSystemPrompt(grounding);

    expect(prompt).toContain("同根");
    expect(prompt).toContain("共同片段");
    expect(prompt).toContain("不要硬套词源");
    expect(prompt).toContain("anchorPattern");
    expect(prompt).not.toContain("碎片判断、家族地图、优先背、谨慎提醒");
  });

  it("adapts direct-comparison guidance for shape-like cluster labels", () => {
    const grounding: AnswerGrounding = {
      activeExamTarget: "cet6",
      activeExamTargetLabel: "CET-6",
      query: "access assess excess 怎么区分",
      queryMode: "direct_compare",
      answerStyle: "confusion_untangle",
      resolution: "resolved",
      noMatchReason: null,
      mainAnswer: [],
      confusionBoundary: [],
      scopeReminder: "这次回答已优先锁定在 CET-6 范围内。",
      followUpPrompt: "我可以继续拆 access / assess / excess。",
      rootFamilyView: null,
      comparisonView: {
        id: "access-assess-excess",
        labels: ["shape_like", "exam_high_value"],
        anchorPattern: "access / assess / excess",
        quickDistinction: "access=进入/使用；assess=评估；excess=过量。",
        examHook: "阅读里先看搭配对象，再看词性。",
        whyConfusing: "三个词拼写接近，考试中容易看错。",
        commonMisusePoints: [],
        semanticBoundaryNotes: [],
        members: [],
      },
    };

    const prompt = buildSystemPrompt(grounding);

    expect(prompt).toContain("形近");
    expect(prompt).toContain("拼写边界");
    expect(prompt).toContain("anchorPattern");
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
    expect(prompt).toContain("总长度控制在 280 个汉字以内");
    expect(prompt).toContain("最多 4 段");
    expect(prompt).toContain("不要写成长讲义");
    expect(prompt).toContain("只输出这 4 段");
    expect(prompt).toContain("禁止例句、词源长故事和完整列表");
    expect(prompt).toContain("短答示例");
    expect(prompt).toContain("碎片判断：stitute 不是完整单词");
    expect(prompt).toContain("优先背：institute / institution");
    expect(prompt).toContain("优先背最多 2 个");
    expect(prompt).toContain("不要再套用通用四段标题");
  });
});
