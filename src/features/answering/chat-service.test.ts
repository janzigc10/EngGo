import { describe, expect, it } from "vitest";

import { buildGrounding } from "@/features/answering/build-grounding";
import { createChatService } from "@/features/answering/chat-service";
import type { GenerateAnswerInput } from "@/features/answering/chat-provider";
import type { RetrievalResult } from "@/features/retrieval/types";

function createMeaningLookupResult(): RetrievalResult {
  return {
    queryMode: "meaning_lookup",
    normalizedQuery: {
      raw: "遵从怎么说",
      normalizedText: "遵从怎么说",
      queryMode: "meaning_lookup",
      englishTerms: [],
      meaningHint: "遵从",
      compareTerms: [],
      groupSeedTerm: null,
    },
    resolution: "resolved",
    noMatchReason: null,
    comparisonView: null,
    candidates: [
      {
        entryId: "comply",
        lemma: "comply",
        meaningsZh: ["遵从，依从"],
        matchedAlias: "comply with",
        scopeCodes: ["cet6", "postgrad"],
        inScope: true,
        reason: "in-scope main answer",
        score: 10,
      },
      {
        entryId: "conform",
        lemma: "conform",
        meaningsZh: ["遵照，一致"],
        matchedAlias: "conform to",
        scopeCodes: ["cet6"],
        inScope: true,
        reason: "nearby confusion",
        score: 8,
      },
      {
        entryId: "abide",
        lemma: "abide",
        meaningsZh: ["遵守"],
        matchedAlias: "abide by",
        scopeCodes: ["postgrad"],
        inScope: false,
        reason: "useful but out of scope",
        score: 5,
      },
    ],
    mainAnswer: [
      {
        entryId: "comply",
        lemma: "comply",
        meaningsZh: ["遵从，依从"],
        matchedAlias: "comply with",
        scopeCodes: ["cet6", "postgrad"],
        inScope: true,
        reason: "in-scope main answer",
        score: 10,
      },
    ],
    confusionBoundary: [
      {
        entryId: "conform",
        lemma: "conform",
        meaningsZh: ["遵照，一致"],
        matchedAlias: "conform to",
        scopeCodes: ["cet6"],
        inScope: true,
        reason: "nearby confusion",
        score: 8,
      },
      {
        entryId: "abide",
        lemma: "abide",
        meaningsZh: ["遵守"],
        matchedAlias: "abide by",
        scopeCodes: ["postgrad"],
        inScope: false,
        reason: "useful but out of scope",
        score: 5,
      },
    ],
  };
}

describe("buildGrounding", () => {
  it("organizes response sections in MVP order", () => {
    const grounding = buildGrounding({
      activeExamTarget: "cet6",
      query: "遵从怎么说",
      queryMode: "meaning_lookup",
      resolution: "resolved",
      noMatchReason: null,
      mainAnswer: createMeaningLookupResult().mainAnswer,
      confusionBoundary: createMeaningLookupResult().confusionBoundary,
      comparisonView: null,
    });

    expect(grounding.mainAnswer[0]?.lemma).toBe("comply");
    expect(grounding.confusionBoundary.map((item) => item.lemma)).toContain("conform");
    expect(grounding.scopeReminder).toContain("abide");
    expect(grounding.followUpPrompt.length).toBeGreaterThan(0);
  });

  it("uses expression_recall for Chinese meaning lookups backed by an expression cluster", () => {
    const grounding = buildGrounding({
      activeExamTarget: "cet6",
      query: "遵从怎么说",
      queryMode: "meaning_lookup",
      resolution: "resolved",
      noMatchReason: null,
      mainAnswer: createMeaningLookupResult().mainAnswer,
      confusionBoundary: createMeaningLookupResult().confusionBoundary,
      comparisonView: {
        id: "comply-conform-defer",
        whyConfusing: "这几个词都能靠近“遵从”，但适用语境不同。",
        labels: ["meaning_near", "collocation_boundary", "exam_high_value"],
        purposes: ["expression_recall", "confusion_untangle"],
        anchorPattern: null,
        quickDistinction: "comply with rules；conform to standards；defer to authority。",
        examHook: "中文召回时先给可替换表达，再讲搭配边界。",
        commonMisusePoints: [],
        semanticBoundaryNotes: [],
        members: [],
      },
    });

    expect(grounding.answerStyle).toBe("expression_recall");
  });

  it("uses confusion_untangle for resolved shape-neighbor recall without a curated group", () => {
    const grounding = buildGrounding({
      activeExamTarget: "cet6",
      query: "跟 statue 很像的词有哪些",
      queryMode: "shape_neighbor_search",
      resolution: "resolved",
      noMatchReason: null,
      comparisonView: null,
      mainAnswer: [
        {
          entryId: "statue",
          lemma: "statue",
          meaningsZh: ["雕像"],
          matchedAlias: null,
          scopeCodes: ["gaokao", "cet4", "cet6"],
          inScope: true,
          reason: "当前考试范围命中，英文形近召回",
          score: 100,
        },
        {
          entryId: "statute",
          lemma: "statute",
          meaningsZh: ["法令"],
          matchedAlias: null,
          scopeCodes: ["cet6"],
          inScope: true,
          reason: "当前考试范围命中，英文形近召回",
          score: 90,
        },
      ],
      confusionBoundary: [],
    });

    expect(grounding.answerStyle).toBe("confusion_untangle");
  });

  it("does not route memory-map-only derivation groups into confusion_untangle", () => {
    const grounding = buildGrounding({
      activeExamTarget: "cet4",
      query: "respect 那组词怎么分",
      queryMode: "direct_compare",
      resolution: "resolved",
      noMatchReason: null,
      mainAnswer: [
        {
          entryId: "respect",
          lemma: "respect",
          meaningsZh: ["尊重"],
          matchedAlias: null,
          scopeCodes: ["cet4"],
          inScope: true,
          reason: "词族记忆组成员",
          score: 100,
        },
      ],
      confusionBoundary: [],
      comparisonView: {
        id: "respect-respective-respectful-respectable",
        whyConfusing: "这些词共享核心词 respect，但更适合做派生词族记忆。",
        labels: ["root_family"],
        purposes: ["memory_map"],
        anchorPattern: "respect",
        quickDistinction: "respect 是核心词，其余是派生词。",
        examHook: "派生词族留给学习流里的词族卡。",
        commonMisusePoints: [],
        semanticBoundaryNotes: [],
        members: [],
      },
    });

    expect(grounding.answerStyle).toBe("standard_lookup");
  });

  it("marks single-word typo lookups as spelling corrections", () => {
    const grounding = buildGrounding({
      activeExamTarget: "cet6",
      query: "generte 是什么意思",
      queryMode: "fuzzy_recall",
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
      comparisonView: null,
    });

    expect(grounding.answerStyle).toBe("standard_lookup");
    expect(grounding.spellingCorrection).toEqual({
      input: "generte",
      lemma: "generate",
    });
  });
});

describe("createChatService", () => {
  it("cleans provider decoration from standard lookup answers", async () => {
    const service = createChatService({
      provider: {
        async generateAnswer() {
          return {
            answer:
              "available 的核心义有两个：**可获得的**和**有空的**。您可根据语境选择对应含义。这里没有需要区分的易混词。无需要区分的易混词。",
            providerRequestId: "resp_standard_lookup",
          };
        },
      },
      createRequestId: () => "req_standard_lookup",
    });

    const result = await service.answer({
      activeExamTarget: "cet4",
      query: "available 怎么用",
      history: [],
      retrievalResult: {
        queryMode: "fuzzy_recall",
        normalizedQuery: {
          raw: "available 怎么用",
          normalizedText: "available 怎么用",
          queryMode: "fuzzy_recall",
          englishTerms: ["available"],
          meaningHint: "available",
          compareTerms: [],
          groupSeedTerm: null,
        },
        resolution: "resolved",
        noMatchReason: null,
        comparisonView: null,
        candidates: [],
        mainAnswer: [
          {
            entryId: "available",
            lemma: "available",
            meaningsZh: ["可获得的", "有空的"],
            matchedAlias: null,
            scopeCodes: ["cet4", "cet6"],
            inScope: true,
            reason: "当前考试范围命中",
            score: 100,
          },
        ],
        confusionBoundary: [],
      },
    });

    expect(result.answer).toBe("available 的核心义有两个：可获得的和有空的。");
    expect(result.answer).not.toContain("**");
    expect(result.answer).not.toContain("没有需要区分");
    expect(result.answer).not.toContain("无需要区分");
    expect(result.providerRequestId).toBe("resp_standard_lookup");
  });

  it("keeps source-lemma exact lookups inside the standard lookup boundary", async () => {
    const providerCalls: GenerateAnswerInput[] = [];
    const service = createChatService({
      provider: {
        async generateAnswer(input) {
          providerCalls.push(input);

          return {
            answer:
              "**accent** core meaning: accent or stress. CET-4 range note should be removed.",
            providerRequestId: "resp_source_lemma",
          };
        },
      },
      createRequestId: () => "req_source_lemma",
    });

    const retrievalResult = {
      queryMode: "direct_lookup",
      normalizedQuery: {
        raw: "accent",
        normalizedText: "accent",
        queryMode: "direct_lookup",
        englishTerms: ["accent"],
        meaningHint: "accent",
        compareTerms: [],
        groupSeedTerm: null,
      },
      resolution: "resolved",
      noMatchReason: null,
      comparisonView: null,
      candidates: [],
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
      matchType: "source_lemma_exact",
    } satisfies RetrievalResult;

    const result = await service.answer({
      activeExamTarget: "cet4",
      query: "accent",
      history: [],
      retrievalResult,
    });

    expect(result.answer).not.toContain("**");
    expect(result.answer).not.toContain("CET");
    expect(result.answerKind).toBe("grounded");
    expect(result.grounding?.answerStyle).toBe("standard_lookup");
    expect(providerCalls[0]?.systemPrompt).toContain("source lemma");
    expect(providerCalls[0]?.grounding?.mainAnswer[0]).toMatchObject({
      lemma: "accent",
      sourceKind: "source_lemma",
    });
  });

  it("does not leak source-lemma internals when source-only provider output is filtered out", async () => {
    const service = createChatService({
      provider: {
        async generateAnswer() {
          return {
            answer: "source lemma index only. CET-4 range note.",
            providerRequestId: "resp_source_lemma_filtered",
          };
        },
      },
      createRequestId: () => "req_source_lemma_filtered",
    });

    const result = await service.answer({
      activeExamTarget: "cet4",
      query: "accent",
      history: [],
      retrievalResult: {
        queryMode: "direct_lookup",
        normalizedQuery: {
          raw: "accent",
          normalizedText: "accent",
          queryMode: "direct_lookup",
          englishTerms: ["accent"],
          meaningHint: "accent",
          compareTerms: [],
          groupSeedTerm: null,
        },
        resolution: "resolved",
        noMatchReason: null,
        comparisonView: null,
        candidates: [],
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
        matchType: "source_lemma_exact",
      },
    });

    expect(result.answer).toBe("accent 暂时没有人工结构化释义，这次先不展开。");
    expect(result.answer).not.toContain("source lemma");
    expect(result.answer).not.toContain("CET");
  });

  it("removes source-only retrieval internals from standard lookup answers", async () => {
    const service = createChatService({
      provider: {
        async generateAnswer() {
          return {
            answer:
              "abolish 常见作 v.，但当前检索未提供中文核心义，无法进一步解释。abolish 的核心义是“废除”。",
            providerRequestId: "resp_source_lemma_retrieval_internal",
          };
        },
      },
      createRequestId: () => "req_source_lemma_retrieval_internal",
    });

    const result = await service.answer({
      activeExamTarget: "cet4",
      query: "abolish",
      history: [],
      retrievalResult: {
        queryMode: "direct_lookup",
        normalizedQuery: {
          raw: "abolish",
          normalizedText: "abolish",
          queryMode: "direct_lookup",
          englishTerms: ["abolish"],
          meaningHint: "abolish",
          compareTerms: [],
          groupSeedTerm: null,
        },
        resolution: "resolved",
        noMatchReason: null,
        comparisonView: null,
        candidates: [],
        mainAnswer: [
          {
            entryId: "source-lemma:abolish",
            lemma: "abolish",
            meaningsZh: [],
            matchedAlias: null,
            scopeCodes: ["cet4", "cet6"],
            inScope: true,
            reason: "source lemma exact match",
            score: 18,
            sourceKind: "source_lemma",
          },
        ],
        confusionBoundary: [],
        matchType: "source_lemma_exact",
      },
    });

    expect(result.answer).toBe("abolish 的核心义是“废除”。");
    expect(result.answer).not.toContain("当前检索");
    expect(result.answer).not.toContain("未提供中文核心义");
    expect(result.answer).not.toContain("无法进一步解释");
  });

  it("normalizes POS slash spacing in standard lookup answers", async () => {
    const service = createChatService({
      provider: {
        async generateAnswer() {
          return {
            answer: "accent 常见作 n./ v.，核心义是“口音；重音”。",
            providerRequestId: "resp_source_lemma_pos",
          };
        },
      },
      createRequestId: () => "req_source_lemma_pos",
    });

    const result = await service.answer({
      activeExamTarget: "cet4",
      query: "accent",
      history: [],
      retrievalResult: {
        queryMode: "direct_lookup",
        normalizedQuery: {
          raw: "accent",
          normalizedText: "accent",
          queryMode: "direct_lookup",
          englishTerms: ["accent"],
          meaningHint: "accent",
          compareTerms: [],
          groupSeedTerm: null,
        },
        resolution: "resolved",
        noMatchReason: null,
        comparisonView: null,
        candidates: [],
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
        matchType: "source_lemma_exact",
      },
    });

    expect(result.answer).toContain("n./v.");
    expect(result.answer).not.toContain("n./ v.");
  });

  it("normalizes Chinese POS labels in standard lookup answers", async () => {
    const service = createChatService({
      provider: {
        async generateAnswer() {
          return {
            answer: "institute 既可作动词，也可作名词。academic 常见作形容词。",
            providerRequestId: "resp_standard_lookup_pos_label",
          };
        },
      },
      createRequestId: () => "req_standard_lookup_pos_label",
    });

    const result = await service.answer({
      activeExamTarget: "cet6",
      query: "institute 是什么意思",
      history: [],
      retrievalResult: {
        queryMode: "fuzzy_recall",
        normalizedQuery: {
          raw: "institute 是什么意思",
          normalizedText: "institute 是什么意思",
          queryMode: "fuzzy_recall",
          englishTerms: ["institute"],
          meaningHint: "institute",
          compareTerms: [],
          groupSeedTerm: null,
        },
        resolution: "resolved",
        noMatchReason: null,
        comparisonView: null,
        candidates: [],
        mainAnswer: [
          {
            entryId: "institute",
            lemma: "institute",
            meaningsZh: ["设立", "制定", "机构"],
            matchedAlias: null,
            scopeCodes: ["cet6"],
            inScope: true,
            reason: "当前考试范围命中",
            score: 100,
          },
        ],
        confusionBoundary: [],
      },
    });

    expect(result.answer).toContain("v.");
    expect(result.answer).toContain("n.");
    expect(result.answer).toContain("adj.");
    expect(result.answer).not.toContain("动词");
    expect(result.answer).not.toContain("名词");
    expect(result.answer).not.toContain("形容词");
  });

  it("passes structured grounding and request ids into the provider", async () => {
    const providerCalls: Array<{
      query: string;
      history: Array<{ role: "user" | "assistant"; content: string }>;
      requestId: string;
      systemPrompt: string;
      grounding: ReturnType<typeof buildGrounding>;
    }> = [];

    const service = createChatService({
      provider: {
        async generateAnswer(input) {
          providerCalls.push(input);

          return {
            answer: "CET-6 里优先用 comply with，和 conform to 的语义边界要分开记。",
            providerRequestId: "resp_123",
          };
        },
      },
      createRequestId: () => "req_test_123",
    });

    const result = await service.answer({
      activeExamTarget: "cet6",
      query: "遵从怎么说",
      history: [{ role: "user", content: "我总把 comply 和 conform 搞混" }],
      retrievalResult: createMeaningLookupResult(),
    });

    expect(result.requestId).toBe("req_test_123");
    expect(result.providerRequestId).toBe("resp_123");
    expect(result.answer).toContain("comply");
    expect(result.grounding.mainAnswer[0]?.lemma).toBe("comply");
    expect(providerCalls[0]?.requestId).toBe("req_test_123");
    expect(providerCalls[0]?.grounding.confusionBoundary.map((item) => item.lemma)).toContain(
      "conform",
    );
    expect(providerCalls[0]?.systemPrompt).toContain("主答案");
    expect(providerCalls[0]?.systemPrompt).toContain("易混边界");
    expect(providerCalls[0]?.history).toHaveLength(1);
  });

  it("short-circuits provider calls for low-confidence no-match grounding", async () => {
    let providerCalled = false;

    const service = createChatService({
      provider: {
        async generateAnswer() {
          providerCalled = true;

          return {
            answer: "should not be used",
            providerRequestId: "resp_unused",
          };
        },
      },
      createRequestId: () => "req_no_match_123",
    });

    const result = await service.answer({
      activeExamTarget: "cet6",
      query: "recent 这个词什么意思",
      history: [],
      retrievalResult: {
        queryMode: "fuzzy_recall",
        normalizedQuery: {
          raw: "recent 这个词什么意思",
          normalizedText: "recent 这个词什么意思",
          queryMode: "fuzzy_recall",
          englishTerms: ["recent"],
          meaningHint: "recent",
          compareTerms: [],
          groupSeedTerm: null,
        },
        resolution: "no_match",
        noMatchReason: "low_confidence",
        comparisonView: null,
        candidates: [],
        mainAnswer: [],
        confusionBoundary: [],
      },
    });

    expect(providerCalled).toBe(false);
    expect(result.requestId).toBe("req_no_match_123");
    expect(result.providerRequestId).toBeNull();
    expect(result.grounding.resolution).toBe("no_match");
    expect(result.grounding.noMatchReason).toBe("low_confidence");
    expect(result.answer).toContain("这次先不硬猜");
    expect(result.grounding.followUpPrompt).toContain("中文义项");
  });

  it("uses a plain provider fallback for clear English-learning no-match questions", async () => {
    const providerCalls: Array<{
      query: string;
      systemPrompt: string;
      grounding?: ReturnType<typeof buildGrounding>;
    }> = [];

    const service = createChatService({
      provider: {
        async generateAnswer(input) {
          providerCalls.push(input);

          return {
            answer:
              "不是一个意思。complex 多表示“复杂的”，complicate 是“使复杂化”。这条先按通用英语解释。",
            providerRequestId: "resp_plain_123",
          };
        },
      },
      createRequestId: () => "req_plain_123",
    });

    const result = await service.answer({
      activeExamTarget: "cet6",
      query: "complex 和 complicate 是一个意思吗",
      history: [],
      retrievalResult: {
        queryMode: "fuzzy_recall",
        normalizedQuery: {
          raw: "complex 和 complicate 是一个意思吗",
          normalizedText: "complex 和 complicate 是一个意思吗",
          queryMode: "fuzzy_recall",
          englishTerms: ["complex", "complicate"],
          meaningHint: "",
          compareTerms: [],
          groupSeedTerm: null,
        },
        resolution: "no_match",
        noMatchReason: "low_confidence",
        comparisonView: null,
        candidates: [],
        mainAnswer: [],
        confusionBoundary: [],
      },
    });

    expect(providerCalls).toHaveLength(1);
    expect(result.requestId).toBe("req_plain_123");
    expect(result.providerRequestId).toBe("resp_plain_123");
    expect(result.answer).toContain("complex");
    expect(result.answerKind).toBe("plain");
    expect(result.grounding).toBeUndefined();
    expect(providerCalls[0]?.systemPrompt).toContain("通用英语学习问题");
    expect(providerCalls[0]?.systemPrompt).toContain("不要声称来自当前考试词库");
  });

  it("uses a plain provider fallback for single-word English-learning no-match questions", async () => {
    const providerCalls: Array<{
      query: string;
      systemPrompt: string;
      grounding?: ReturnType<typeof buildGrounding>;
    }> = [];

    const service = createChatService({
      provider: {
        async generateAnswer(input) {
          providerCalls.push(input);

          return {
            answer:
              "complex 通常表示“复杂的”。这条当前还没绑定到词库命中结果，所以先按通用英语理解。",
            providerRequestId: "resp_plain_single_123",
          };
        },
      },
      createRequestId: () => "req_plain_single_123",
    });

    const result = await service.answer({
      activeExamTarget: "cet6",
      query: "complex 是什么意思",
      history: [],
      retrievalResult: {
        queryMode: "fuzzy_recall",
        normalizedQuery: {
          raw: "complex 是什么意思",
          normalizedText: "complex 是什么意思",
          queryMode: "fuzzy_recall",
          englishTerms: ["complex"],
          meaningHint: "complex",
          compareTerms: [],
          groupSeedTerm: null,
        },
        resolution: "no_match",
        noMatchReason: "out_of_kb",
        comparisonView: null,
        candidates: [],
        mainAnswer: [],
        confusionBoundary: [],
      },
    });

    expect(providerCalls).toHaveLength(1);
    expect(result.requestId).toBe("req_plain_single_123");
    expect(result.providerRequestId).toBe("resp_plain_single_123");
    expect(result.answer).toContain("complex");
    expect(result.answerKind).toBe("plain");
    expect(result.grounding).toBeUndefined();
    expect(providerCalls[0]?.grounding).toBeUndefined();
    expect(providerCalls[0]?.systemPrompt).toContain("通用英语学习问题");
  });

  it("uses spelling assist for suspicious single-token typo misses", async () => {
    const providerCalls: Array<{
      query: string;
      systemPrompt: string;
      grounding?: ReturnType<typeof buildGrounding>;
    }> = [];

    const service = createChatService({
      provider: {
        async generateAnswer(input) {
          providerCalls.push(input);

          return {
            answer:
              "这个拼写还不能稳定定位。你可能想问：request（请求）或 requisite（必需的）。请先确认是哪一个。",
            providerRequestId: "resp_spelling_typo",
          };
        },
      },
      createRequestId: () => "req_typo_out_of_kb_123",
    });

    const result = await service.answer({
      activeExamTarget: "cet6",
      query: "reqxust 是什么意思",
      history: [],
      retrievalResult: {
        queryMode: "fuzzy_recall",
        normalizedQuery: {
          raw: "reqxust 是什么意思",
          normalizedText: "reqxust 是什么意思",
          queryMode: "fuzzy_recall",
          englishTerms: ["reqxust"],
          meaningHint: "reqxust",
          compareTerms: [],
          groupSeedTerm: null,
        },
        resolution: "no_match",
        noMatchReason: "out_of_kb",
        comparisonView: null,
        candidates: [],
        mainAnswer: [],
        confusionBoundary: [],
      },
    });

    expect(providerCalls).toHaveLength(1);
    expect(result.providerRequestId).toBe("resp_spelling_typo");
    expect(result.answerKind).toBe("plain");
    expect(result.grounding).toBeUndefined();
    expect(result.answer).toContain("request");
    expect(providerCalls[0]?.grounding).toBeUndefined();
    expect(providerCalls[0]?.systemPrompt).toContain("拼写候选");
    expect(providerCalls[0]?.systemPrompt).toContain("不要把用户输入直接当成标准词解释");
  });

  it("uses spelling assist for repeated suspicious typo tokens", async () => {
    const providerCalls: Array<{
      query: string;
      systemPrompt: string;
      grounding?: ReturnType<typeof buildGrounding>;
    }> = [];

    const service = createChatService({
      provider: {
        async generateAnswer(input) {
          providerCalls.push(input);

          return {
            answer: "可能是 request。请先确认拼写后我再解释。",
            providerRequestId: "resp_repeated_spelling_typo",
          };
        },
      },
      createRequestId: () => "req_repeated_typo_123",
    });

    const result = await service.answer({
      activeExamTarget: "cet6",
      query: "reqxust reqxust 是什么意思",
      history: [],
      retrievalResult: {
        queryMode: "fuzzy_recall",
        normalizedQuery: {
          raw: "reqxust reqxust 是什么意思",
          normalizedText: "reqxust reqxust 是什么意思",
          queryMode: "fuzzy_recall",
          englishTerms: ["reqxust", "reqxust"],
          meaningHint: "reqxust reqxust",
          compareTerms: [],
          groupSeedTerm: null,
        },
        resolution: "no_match",
        noMatchReason: "out_of_kb",
        comparisonView: null,
        candidates: [],
        mainAnswer: [],
        confusionBoundary: [],
      },
    });

    expect(providerCalls).toHaveLength(1);
    expect(result.providerRequestId).toBe("resp_repeated_spelling_typo");
    expect(result.answerKind).toBe("plain");
    expect(result.grounding).toBeUndefined();
    expect(providerCalls[0]?.systemPrompt).toContain("拼写候选");
  });

  it("returns a root-specific no-match answer for unsupported root queries", async () => {
    let providerCalled = false;

    const service = createChatService({
      provider: {
        async generateAnswer() {
          providerCalled = true;

          return {
            answer: "should not be used",
            providerRequestId: "resp_unused",
          };
        },
      },
      createRequestId: () => "req_root_no_match_123",
    });

    const result = await service.answer({
      activeExamTarget: "cet6",
      query: "re+con 的词根有什么词",
      history: [],
      retrievalResult: {
        queryMode: "root_family_summary",
        normalizedQuery: {
          raw: "re+con 的词根有什么词",
          normalizedText: "re+con 的词根有什么词",
          queryMode: "root_family_summary",
          englishTerms: ["re", "con"],
          meaningHint: "re+con",
          compareTerms: [],
          groupSeedTerm: null,
        },
        resolution: "no_match",
        noMatchReason: "low_confidence",
        comparisonView: null,
        rootFamilyView: null,
        candidates: [],
        mainAnswer: [],
        confusionBoundary: [],
      },
    });

    expect(providerCalled).toBe(false);
    expect(result.requestId).toBe("req_root_no_match_123");
    expect(result.providerRequestId).toBeNull();
    expect(result.grounding.queryMode).toBe("root_family_summary");
    expect(result.answer).toContain("还没有稳定收录成词族");
    expect(result.answer).toContain("词根/前缀组合");
  });
});
