import { describe, expect, it } from "vitest";

import type { AnswerGrounding } from "@/features/answering/build-grounding";
import { buildSystemPrompt } from "@/features/answering/build-system-prompt";

describe("buildSystemPrompt", () => {
  it("keeps standard lookup short and grounded", () => {
    const grounding: AnswerGrounding = {
      activeExamTarget: "cet4",
      activeExamTargetLabel: "CET-4",
      query: "academic 是什么意思",
      queryMode: "fuzzy_recall",
      answerStyle: "standard_lookup",
      resolution: "resolved",
      noMatchReason: null,
      mainAnswer: [
        {
          entryId: "academic",
          lemma: "academic",
          meaningsZh: ["学术的"],
          matchedAlias: null,
          scopeCodes: ["cet4", "cet6"],
          inScope: true,
          reason: "当前考试范围命中",
          score: 100,
        },
      ],
      confusionBoundary: [],
      scopeReminder: "这次回答已优先锁定在 CET-4 范围内。",
      followUpPrompt: "如果你愿意，我可以继续把 academic 的近义词拆开。",
      comparisonView: null,
      rootFamilyView: null,
    };

    const prompt = buildSystemPrompt(grounding);

    expect(prompt).toContain("普通查词模式");
    expect(prompt).toContain("禁止例句");
    expect(prompt).toContain("不要把“主答案”“易混边界”“范围提醒”写成可见小标题");
    expect(prompt).toContain("最终答案不要出现“主答案”“易混边界”“范围提醒”“没有需要区分”这些字样");
    expect(prompt).toContain("最终答案不要出现 Markdown 符号");
    expect(prompt).toContain("即使用户问“怎么用”，也不要写完整英文句子");
    expect(prompt).toContain("不要使用“如”“例如”“常用搭配如”引出搭配");
    expect(prompt).toContain("没有 confusionBoundary 时直接省略边界，不要写“没有需要区分的易混词”");
    expect(prompt).toContain("本次不要主动写范围提醒");
    expect(prompt).toContain("最终答案不要出现 CET-4、考试范围、范围内这类范围提示");
    expect(prompt).toContain("不要主动输出下一步追问");
    expect(prompt).toContain("不要主动补充未召回的新词");
    expect(prompt).toContain("只用 grounding 里的主答案和易混边界");
    expect(prompt).not.toContain("当前考试范围：CET-4");
    expect(prompt).not.toContain("范围提醒素材");
    expect(prompt).not.toContain("这次回答已优先锁定在 CET-4 范围内。");
    expect(prompt).not.toContain("4. 下一步");
    expect(prompt).not.toContain("建议的下一步追问");
    expect(prompt).not.toContain("建议的范围提醒：");
    expect(prompt).not.toContain("例句保留原文");
  });

  it("guides standard lookup typo corrections as corrected-word answers", () => {
    const grounding: AnswerGrounding = {
      activeExamTarget: "cet6",
      activeExamTargetLabel: "CET-6",
      query: "generte 是什么意思",
      queryMode: "fuzzy_recall",
      answerStyle: "standard_lookup",
      resolution: "resolved",
      noMatchReason: null,
      mainAnswer: [
        {
          entryId: "generate",
          lemma: "generate",
          meaningsZh: ["产生", "生成"],
          matchedAlias: null,
          scopeCodes: ["cet6"],
          inScope: true,
          reason: "当前考试范围命中，单编辑 typo 召回",
          score: 363,
        },
      ],
      confusionBoundary: [],
      scopeReminder: "这次回答已优先锁定在 CET-6 范围内。",
      followUpPrompt: "如果你愿意，我可以继续把 generate 的近义词拆开。",
      comparisonView: null,
      rootFamilyView: null,
      spellingCorrection: {
        input: "generte",
        lemma: "generate",
      },
    };

    const prompt = buildSystemPrompt(grounding);

    expect(prompt).toContain("本次是拼写纠错查词");
    expect(prompt).toContain("用户输入 generte，grounding 主答案是 generate");
    expect(prompt).toContain("第一句必须写“你可能想查的是 generate。”");
    expect(prompt).toContain("不要只把 generate 当成普通查词开头");
    expect(prompt).toContain("本次不要主动写范围提醒");
    expect(prompt).toContain("最终答案不要出现 CET-6、考试范围、范围内这类范围提示");
    expect(prompt).not.toContain("范围提醒素材");
    expect(prompt).not.toContain("这次回答已优先锁定在 CET-6 范围内。");
  });

  it("guides source-lemma standard lookup as a student-facing micro dictionary entry", () => {
    const grounding: AnswerGrounding = {
      activeExamTarget: "cet4",
      activeExamTargetLabel: "CET-4",
      query: "accent",
      queryMode: "direct_lookup",
      answerStyle: "standard_lookup",
      resolution: "resolved",
      noMatchReason: null,
      mainAnswer: [
        {
          entryId: "source-lemma:accent",
          lemma: "accent",
          meaningsZh: [],
          matchedAlias: null,
          scopeCodes: ["gaokao", "cet4", "cet6"],
          inScope: true,
          reason: "source lemma exact match",
          score: 18,
          sourceKind: "source_lemma",
        },
      ],
      confusionBoundary: [],
      scopeReminder: "这次回答已优先锁定在 CET-4 范围内。",
      followUpPrompt: "如果你愿意，我可以继续把 accent 的常见用法拆开。",
      comparisonView: null,
      rootFamilyView: null,
      matchType: "source_lemma_exact",
    };

    const prompt = buildSystemPrompt(grounding);

    expect(prompt).toContain("source-only 查词输出模板");
    expect(prompt).toContain("常见词性");
    expect(prompt).toContain("简单理解");
    expect(prompt).toContain("不确定词性时省略词性");
    expect(prompt).toContain("不要写 source lemma");
    expect(prompt).not.toContain("这次回答已优先锁定在 CET-4 范围内。");
  });

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
    expect(prompt).toContain("讲清真正的语义、词性、搭配或对象边界");
    expect(prompt).toContain("不要把回答写成泛泛词典百科");
    expect(prompt).toContain("总长度控制在 450 个汉字以内");
    expect(prompt).toContain("最多 4 段");
    expect(prompt).toContain("只输出这 4 段");
    expect(prompt).toContain("禁止例句、长列表和补充扩展");
    expect(prompt).toContain("短答示例");
    expect(prompt).toContain("范围内相似词：stationary / stationery");
    expect(prompt).toContain("词义速览：stationary=静止的；stationery=文具");
    expect(prompt).toContain("重点区分：一个看状态，一个看物品");
    expect(prompt).toContain("做题抓手：文具=stationery");
    expect(prompt).toContain("超过 2 个词时，用公式行压缩");
    expect(prompt).toContain("不要使用 e= envelope 这类牵强字母口诀");
    expect(prompt).toContain("不要只说字母哪里不同");
    expect(prompt).toContain("必须出现“范围内相似词”");
    expect(prompt).toContain("必须出现“词义速览”");
    expect(prompt).toContain("必须出现“重点区分”");
    expect(prompt).not.toContain("混淆入口");
    expect(prompt).not.toContain("核心边界");
    expect(prompt).not.toContain("只输出这 3 段");
    expect(prompt).not.toContain("建议的范围提醒：");
    expect(prompt).not.toContain("建议的下一步追问");
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

  it("guides expression-recall answers as Chinese-to-English expression expansion", () => {
    const grounding: AnswerGrounding = {
      activeExamTarget: "cet6",
      activeExamTargetLabel: "CET-6",
      query: "遵从怎么说",
      queryMode: "meaning_lookup",
      answerStyle: "expression_recall",
      resolution: "resolved",
      noMatchReason: null,
      mainAnswer: [
        {
          entryId: "comply",
          lemma: "comply",
          meaningsZh: ["遵从", "依从"],
          matchedAlias: null,
          scopeCodes: ["cet6"],
          inScope: true,
          reason: "当前考试范围命中，中文释义命中",
          score: 300,
        },
      ],
      confusionBoundary: [
        {
          entryId: "conform",
          lemma: "conform",
          meaningsZh: ["符合", "遵照"],
          matchedAlias: null,
          scopeCodes: ["cet6"],
          inScope: true,
          reason: "当前考试范围命中，来自同一表达召回组",
          score: 260,
        },
        {
          entryId: "defer",
          lemma: "defer",
          meaningsZh: ["听从", "遵从"],
          matchedAlias: null,
          scopeCodes: ["cet6"],
          inScope: true,
          reason: "当前考试范围命中，来自同一表达召回组",
          score: 240,
        },
      ],
      scopeReminder: "这次回答已优先锁定在 CET-6 范围内。",
      followUpPrompt: "我可以继续按作文语境帮你分正式程度。",
      rootFamilyView: null,
      comparisonView: {
        id: "comply-conform-defer",
        labels: ["meaning_near", "collocation_boundary", "exam_high_value"],
        purposes: ["expression_recall", "confusion_untangle"],
        anchorPattern: null,
        quickDistinction: "comply with rules；conform to standards；defer to authority。",
        examHook: "写作表达扩展时先给可替换表达，再给搭配边界。",
        whyConfusing: "这几个词都能靠近“遵从”，但适用语境不同。",
        commonMisusePoints: [],
        semanticBoundaryNotes: [],
        members: [],
      },
    };

    const prompt = buildSystemPrompt(grounding);

    expect(prompt).toContain("中文表达召回");
    expect(prompt).toContain("可替换表达");
    expect(prompt).toContain("使用边界");
    expect(prompt).toContain("写作抓手");
    expect(prompt).toContain("不要把它写成易混词纠错课");
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
            partOfSpeech: "v. / n.",
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
            partOfSpeech: "n.",
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
            partOfSpeech: "v.",
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

    expect(prompt).toContain("同根/碎片召回总结");
    expect(prompt).toContain("碎片定位");
    expect(prompt).toContain("家族召回");
    expect(prompt).toContain("意义分流");
    expect(prompt).toContain("总长度控制在 420 个汉字以内");
    expect(prompt).toContain("最多 3 段");
    expect(prompt).toContain("只输出这 3 段：碎片定位、家族召回、意义分流");
    expect(prompt).toContain("家族召回必须列出当前考试范围内召回到的家族成员");
    expect(prompt).toContain("每个成员都要带中文核心义");
    expect(prompt).toContain("每个成员必须写成 word=中文义");
    expect(prompt).toContain("不许省略英文词");
    expect(prompt).toContain("不要因为低优先级或语义跑远就写成不硬背");
    expect(prompt).toContain("语义跑远的成员也要保留在家族里");
    expect(prompt).toContain("讲清前缀、后缀或现代义分流");
    expect(prompt).toContain("只有当 rootFamilyView.members 里真的有 lemma 与用户片段完全相同");
    expect(prompt).toContain("否则只能说是词形片段或前缀线索");
    expect(prompt).toContain("不能只给背诵优先级");
    expect(prompt).toContain("短答示例");
    expect(prompt).toContain("碎片定位：stitute 不是完整单词");
    expect(prompt).toContain("家族召回：institute=设立/机构；institution=机构/制度；constitute=构成；substitute=替代/替代品");
    expect(prompt).toContain("意义分流：它们共享 stitute");
    expect(prompt).toContain("不要主动点名未召回的低频或范围外分支");
    expect(prompt).toContain("如果用户问到的片段本身也是成员词");
    expect(prompt).not.toContain("优先背最多 2 个");
    expect(prompt).not.toContain("其他成员只用“眼熟即可/不硬背”一句带过");
    expect(prompt).not.toContain("必须写出“优先背”");
    expect(prompt).not.toContain("谨慎提醒");
    expect(prompt).not.toContain("不是所有前缀组合都成立");
    expect(prompt).not.toContain("建议的范围提醒");
    expect(prompt).not.toContain("建议的下一步追问");
    expect(prompt).toContain("不要再套用通用四段标题");
  });

  it("guides broad root fragment summaries to render every member in a table", () => {
    const grounding: AnswerGrounding = {
      activeExamTarget: "cet6",
      activeExamTargetLabel: "CET-6",
      query: "con 开头的词有哪些",
      queryMode: "root_family_summary",
      answerStyle: "root_family_summary",
      resolution: "resolved",
      noMatchReason: null,
      mainAnswer: [
        {
          entryId: "concept",
          lemma: "concept",
          meaningsZh: ["概念"],
          matchedAlias: null,
          scopeCodes: ["cet4", "cet6"],
          inScope: true,
          reason: "当前考试范围命中，来自词形片段召回",
          score: 260,
        },
      ],
      confusionBoundary: [],
      scopeReminder: "这次回答已优先锁定在 CET-6 范围内。",
      followUpPrompt: "如果你愿意，我可以继续按意思分组。",
      comparisonView: null,
      rootFamilyView: {
        id: "fragment-prefix-con",
        fragment: "con-",
        coreImage: "按词形碎片召回",
        note: "这是按用户给出的词首，从当前考试范围内做的保守召回。",
        caution: "只列当前词库里命中的词。",
        members: [
          "concept",
          "concern",
          "conclude",
          "condition",
          "conduct",
          "confirm",
          "conform",
          "construct",
          "control",
        ].map((lemma) => ({
          lemma,
          partOfSpeech: "n.",
          prefix: "con-",
          prefixDirection: "词首片段 con-",
          actionStory: "命中 con- 这个词形线索",
          modernMeaningZh: "核心义",
          priority: "recognize",
          entryId: lemma,
          inScope: true,
        })),
      },
    };

    const prompt = buildSystemPrompt(grounding);

    expect(prompt).toContain("本次召回成员较多（9 个）");
    expect(prompt).toContain("总长度可放宽到 1500 个汉字以内");
    expect(prompt).toContain("家族召回段必须用 Markdown 表格");
    expect(prompt).toContain("word | 词性 | 核心义");
    expect(prompt).toContain("词性列必须使用 rootFamilyView.members.partOfSpeech");
    expect(prompt).toContain("把 rootFamilyView.members 全部列出，不要省略");
    expect(prompt).toContain("word 列必须逐字复制 rootFamilyView.members.lemma");
    expect(prompt).toContain("禁止改拼写");
    expect(prompt).toContain("不要写“等”");
    expect(prompt).toContain("意义分流只用 1-2 句概括");
    expect(prompt).toContain("意义分流段必须只写这两句，不要改写");
    expect(prompt).toContain("这些词共享 con- 这个词形线索");
    expect(prompt).toContain("如果觉得太多，可以继续按词性或意思缩小范围");
    expect(prompt).toContain("禁止举例");
    expect(prompt).toContain("不拆后续词根");
    expect(prompt).toContain("不写“例如”");
  });
});
