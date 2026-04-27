import { describe, expect, it } from "vitest";

import {
  parseRootFragmentRecall,
  selectRootFragmentEntries,
  type RootFragmentEntry,
} from "@/features/retrieval/root-fragment-recall";

function entry(lemma: string, partOfSpeech: string[], meaningsZh: string[]): RootFragmentEntry {
  return {
    entryId: `entry-${lemma}`,
    lemma,
    partOfSpeech: partOfSpeech.join(" / "),
    meaningsZh,
    inScope: true,
  };
}

const matcherEntries = [
  entry("conference", ["n."], ["会议"]),
  entry("condition", ["n."], ["条件"]),
  entry("construct", ["v."], ["建造"]),
  entry("structure", ["n."], ["结构"]),
  entry("respect", ["v.", "n."], ["尊重"]),
];

function parseQuery(query: string) {
  const parsed = parseRootFragmentRecall(query);

  expect(parsed).not.toBeNull();

  return parsed!;
}

describe("parseRootFragmentRecall", () => {
  it("parses a prefix constraint", () => {
    expect(parseRootFragmentRecall("con 开头的词有哪些")).toMatchObject({
      id: "fragment-prefix-con",
      fragment: "con-",
      constraints: [{ type: "prefix", value: "con" }],
    });
  });

  it("parses a suffix constraint", () => {
    expect(parseRootFragmentRecall("tion 结尾的词")).toMatchObject({
      id: "fragment-suffix-tion",
      fragment: "-tion",
      constraints: [{ type: "suffix", value: "tion" }],
    });
  });

  it("parses a contains constraint", () => {
    expect(parseRootFragmentRecall("有 struct 的词")).toMatchObject({
      id: "fragment-contains-struct",
      fragment: "struct",
      constraints: [{ type: "contains", value: "struct" }],
    });
  });

  it("parses a start-end constraint", () => {
    expect(parseRootFragmentRecall("re...ct 这种词")).toMatchObject({
      id: "fragment-pattern-re-ct",
      fragment: "re...ct",
      constraints: [{ type: "start_end", prefix: "re", suffix: "ct" }],
    });
  });

  it("parses prefix and contains constraints together", () => {
    expect(parseRootFragmentRecall("con 开头 re 相关的词")).toMatchObject({
      id: "fragment-prefix-con-contains-re",
      constraints: [
        { type: "prefix", value: "con" },
        { type: "contains", value: "re" },
      ],
    });
  });

  it("keeps root-theory combinations out of structural parsing", () => {
    expect(parseRootFragmentRecall("re+con 的词根有什么词")).toBeNull();
  });
});

describe("selectRootFragmentEntries", () => {
  it("matches prefix and contains constraints with AND semantics", () => {
    const matches = selectRootFragmentEntries(
      matcherEntries,
      parseQuery("con 开头 re 相关的词"),
    );

    expect(matches.map((item) => item.lemma)).toEqual(["conference"]);
  });

  it("matches entries containing a structural fragment", () => {
    const matches = selectRootFragmentEntries(
      matcherEntries,
      parseQuery("有 struct 的词"),
    );

    expect(matches.map((item) => item.lemma)).toEqual(["construct", "structure"]);
  });

  it("matches a start-end structural pattern", () => {
    const matches = selectRootFragmentEntries(
      matcherEntries,
      parseQuery("re...ct 这种词"),
    );

    expect(matches.map((item) => item.lemma)).toEqual(["respect"]);
  });

  it("returns an empty list when no entries match", () => {
    const matches = selectRootFragmentEntries(
      matcherEntries,
      parseQuery("pre 开头的词有哪些"),
    );

    expect(matches).toEqual([]);
  });

  it("allows a single structural match", () => {
    const matches = selectRootFragmentEntries(
      matcherEntries,
      parseQuery("con 开头 re 相关的词"),
    );

    expect(matches).toHaveLength(1);
  });
});
