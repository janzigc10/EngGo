import { describe, expect, it } from "vitest";

import {
  buildLightGroundingCandidates,
  defaultProbeCases,
  extractEnglishTokens,
  type ProbeVocabularyEntry,
} from "./grounding-strategy-probe";

const vocabulary: ProbeVocabularyEntry[] = [
  {
    lemma: "command",
    scopes: ["cet4", "cet6"],
    sourceKinds: ["source_lemma"],
    meaningsZh: ["命令"],
  },
  {
    lemma: "comment",
    scopes: ["gaokao", "cet4", "cet6"],
    sourceKinds: ["source_lemma"],
    meaningsZh: ["评论"],
  },
  {
    lemma: "commend",
    scopes: ["cet6"],
    sourceKinds: ["source_lemma"],
    meaningsZh: ["称赞"],
  },
  {
    lemma: "recommend",
    scopes: ["cet4", "cet6"],
    sourceKinds: ["structured", "source_lemma"],
    partOfSpeech: "verb",
    meaningsZh: ["推荐", "建议"],
  },
  {
    lemma: "receive",
    scopes: ["cet4", "cet6"],
    sourceKinds: ["source_lemma"],
    meaningsZh: ["收到"],
  },
  {
    lemma: "recover",
    scopes: ["cet4", "cet6"],
    sourceKinds: ["source_lemma"],
    meaningsZh: ["恢复"],
  },
  {
    lemma: "connect",
    scopes: ["gaokao", "cet4", "cet6"],
    sourceKinds: ["source_lemma"],
    meaningsZh: ["连接"],
  },
  {
    lemma: "conduct",
    scopes: ["gaokao", "cet4", "cet6"],
    sourceKinds: ["source_lemma"],
    meaningsZh: ["实施", "行为"],
  },
  {
    lemma: "require",
    scopes: ["cet4", "cet6"],
    sourceKinds: ["structured"],
    meaningsZh: ["要求", "需要"],
  },
  {
    lemma: "request",
    scopes: ["cet4", "cet6"],
    sourceKinds: ["structured"],
    meaningsZh: ["请求", "要求"],
  },
  {
    lemma: "demand",
    scopes: ["cet4", "cet6"],
    sourceKinds: ["structured"],
    meaningsZh: ["要求", "需求"],
  },
  {
    lemma: "conclude",
    scopes: ["gaokao", "cet4", "cet6"],
    sourceKinds: ["source_lemma"],
    meaningsZh: ["总结"],
  },
];

describe("grounding strategy probe", () => {
  it("extracts broad English tokens from mixed Chinese student questions", () => {
    expect(extractEnglishTokens("re/con 开头那些词怎么整理")).toEqual(["re", "con"]);
    expect(extractEnglishTokens("commend、comment、command 怎么区分")).toEqual([
      "commend",
      "comment",
      "command",
    ]);
  });

  it("keeps explicit lookalike terms in the light candidate pool", () => {
    const candidates = buildLightGroundingCandidates({
      vocabulary,
      probeCase: defaultProbeCases[0],
      limit: 8,
    });
    const lemmas = candidates.map((candidate) => candidate.lemma);

    expect(lemmas).toContain("commend");
    expect(lemmas).toContain("comment");
    expect(lemmas).toContain("command");
  });

  it("uses broad prefix hints without requiring handcrafted groups", () => {
    const candidates = buildLightGroundingCandidates({
      vocabulary,
      probeCase: {
        category: "前缀开放整理",
        name: "re con broad",
        query: "re/con 开头的词怎么整理",
        activeExamTarget: "cet6",
        intent: "学生按前缀泛问。",
      },
      limit: 8,
    });
    const lemmas = candidates.map((candidate) => candidate.lemma);

    expect(lemmas).toEqual(
      expect.arrayContaining(["recommend", "receive", "recover", "connect", "conduct"]),
    );
  });

  it("uses Chinese semantic hints for broad learner questions", () => {
    const candidates = buildLightGroundingCandidates({
      vocabulary,
      probeCase: {
        category: "中文召回泛问",
        name: "require request demand",
        query: "表示要求别人做事的词有哪些容易混",
        activeExamTarget: "cet6",
        intent: "学生按中文场景泛问。",
      },
      limit: 8,
    });
    const lemmas = candidates.map((candidate) => candidate.lemma);

    expect(lemmas).toEqual(expect.arrayContaining(["require", "request", "demand"]));
  });
});
