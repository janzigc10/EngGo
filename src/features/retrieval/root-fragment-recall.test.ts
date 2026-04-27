import { describe, expect, it } from "vitest";

import { parseRootFragmentRecall } from "@/features/retrieval/root-fragment-recall";

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
