import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addCollectedWord,
  listCollectedWords,
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
});
