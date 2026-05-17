import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addCollectedWord,
  listCollectedWords,
  removeCollectedWord,
} from "@/features/collections/collection-store";

function createMemoryStorage() {
  const values = new Map<string, string>();

  return {
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    get length() {
      return values.size;
    },
  };
}

describe("collection store", () => {
  const storage = createMemoryStorage();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("window", {
      localStorage: storage,
    });
  });

  it("stores collected words under the active exam target", () => {
    addCollectedWord("cet6", { lemma: "comply", note: "遵从" });
    addCollectedWord("gaokao", { lemma: "respect", note: "尊重" });

    expect(listCollectedWords("cet6")).toHaveLength(1);
    expect(listCollectedWords("cet6")[0]).toMatchObject({
      lemma: "comply",
      note: "遵从",
    });
    expect(listCollectedWords("gaokao")).toHaveLength(1);
    expect(listCollectedWords("gaokao")[0]).toMatchObject({
      lemma: "respect",
      note: "尊重",
    });
  });

  it("ignores malformed stored buckets when adding a collected word", () => {
    storage.setItem(
      "enggo.collectedWords",
      JSON.stringify({
        cet6: { lemma: "broken", note: "not an array" },
        gaokao: [
          {
            examTarget: "gaokao",
            lemma: "respect",
            note: "尊重",
            collectedAt: "2026-04-21T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(() =>
      addCollectedWord("cet6", { lemma: "comply", note: "遵从" }),
    ).not.toThrow();

    expect(listCollectedWords("cet6")).toHaveLength(1);
    expect(listCollectedWords("cet6")[0]).toMatchObject({
      lemma: "comply",
      note: "遵从",
    });
    expect(listCollectedWords("gaokao")).toHaveLength(1);
    expect(listCollectedWords("gaokao")[0]).toMatchObject({
      lemma: "respect",
      note: "尊重",
    });
  });

  it("stores structured learning metadata for collected words", () => {
    addCollectedWord("cet6", {
      lemma: "make up",
      note: "外部基础词典释义：phr. 组成；编造",
      partOfSpeech: "phr.",
      meaningZh: "组成；编造",
      sourceKind: "external_dictionary_basic",
      reviewStatus: "unreviewed",
    });

    expect(listCollectedWords("cet6")[0]).toMatchObject({
      lemma: "make up",
      note: "外部基础词典释义：phr. 组成；编造",
      partOfSpeech: "phr.",
      meaningZh: "组成；编造",
      sourceKind: "external_dictionary_basic",
      reviewStatus: "unreviewed",
    });
  });

  it("updates an existing lemma in the same exam target instead of duplicating it", () => {
    addCollectedWord("cet6", {
      lemma: "accent",
      note: "来源词表命中，待补结构化释义",
    });
    addCollectedWord("cet6", {
      lemma: " accent ",
      note: "来源词表命中：重音；口音",
      partOfSpeech: "n.",
      meaningZh: "重音；口音",
      sourceKind: "source_lemma",
    });

    const words = listCollectedWords("cet6");

    expect(words).toHaveLength(1);
    expect(words[0]).toMatchObject({
      lemma: "accent",
      note: "来源词表命中：重音；口音",
      partOfSpeech: "n.",
      meaningZh: "重音；口音",
      sourceKind: "source_lemma",
    });
  });

  it("removes a collected lemma only from the requested exam target", () => {
    addCollectedWord("cet6", { lemma: "access", note: "进入权" });
    addCollectedWord("cet4", { lemma: "access", note: "进入权" });

    removeCollectedWord("cet6", " access ");

    expect(listCollectedWords("cet6")).toHaveLength(0);
    expect(listCollectedWords("cet4")).toHaveLength(1);
  });
});
