import "dotenv/config";

import { describe, expect, it } from "vitest";

import { detectQueryMode } from "@/features/retrieval/detect-query-mode";
import { retrieveCandidates } from "@/features/retrieval/retrieve-candidates";

describe("detectQueryMode", () => {
  it("detects zh meaning lookup", () => {
    expect(detectQueryMode("遵从怎么说")).toBe("meaning_lookup");
  });

  it("detects fuzzy spelling lookup", () => {
    expect(detectQueryMode("有个像 institute 的词")).toBe("fuzzy_recall");
  });

  it("detects direct comparison", () => {
    expect(detectQueryMode("restrain 和 constrain 的区别")).toBe("direct_compare");
  });

  it("detects multi-term comparison", () => {
    expect(detectQueryMode("recommend suggest propose 怎么区分")).toBe("direct_compare");
  });

  it("detects group comparison", () => {
    expect(detectQueryMode("respect 那组词怎么分")).toBe("direct_compare");
  });

  it("treats 哪个-question with multiple words as comparison", () => {
    expect(detectQueryMode("affect 和 effect 哪个是动词")).toBe("direct_compare");
  });

  it("keeps plain English lookup out of compare mode", () => {
    expect(detectQueryMode("comply with")).toBe("direct_lookup");
  });

  it("detects lookalike-cluster intent", () => {
    expect(detectQueryMode("跟 recent 很像的词有哪些")).toBe("shape_neighbor_search");
  });

  it("detects misread-neighbor intent", () => {
    expect(detectQueryMode("容易把 recent 看错成什么")).toBe("shape_neighbor_search");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("retrieveCandidates", () => {
  it("finds an in-scope main answer from a Chinese meaning lookup", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "遵从怎么说",
    });

    expect(result.queryMode).toBe("meaning_lookup");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer[0]?.lemma).toBe("comply");
    expect(result.mainAnswer[0]?.inScope).toBe(true);
  });

  it("returns a stable main answer and same-group boundary for incomplete English recall", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "有个像 instituton 的词",
    });

    expect(result.queryMode).toBe("fuzzy_recall");
    expect(result.resolution).toBe("resolved");
    expect(result.candidates.map((candidate) => candidate.lemma)).toEqual(
      expect.arrayContaining(["institution", "institute"]),
    );
    expect(["institution", "institute"]).toContain(result.mainAnswer[0]?.lemma);
    expect(
      [result.mainAnswer[0]?.lemma, ...result.confusionBoundary.map((candidate) => candidate.lemma)],
    ).toEqual(
      expect.arrayContaining(["institution", "institute", "establish"]),
    );
  });

  it("enters confusion-group view for direct comparison queries", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "postgrad",
      query: "restrain 和 constrain 的区别",
    });

    expect(result.queryMode).toBe("direct_compare");
    expect(result.resolution).toBe("resolved");
    expect(result.comparisonView?.id).toBe("restrain-constrain-curb");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual([
      "restrain",
      "constrain",
    ]);
    expect(result.confusionBoundary.map((candidate) => candidate.lemma)).toEqual(["curb"]);
  });

  it("resolves multi-term direct comparison within the same confusion group", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "recommend suggest propose 怎么区分",
    });

    expect(result.queryMode).toBe("direct_compare");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual([
      "recommend",
      "suggest",
      "propose",
    ]);
    expect(result.confusionBoundary).toHaveLength(0);
    expect(result.comparisonView?.members.map((member) => member.lemma)).toEqual(
      expect.arrayContaining(["recommend", "suggest", "propose"]),
    );
  });

  it("expands a group compare query into the whole confusion group", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet4",
      query: "respect 那组词怎么分",
    });

    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual([
      "respect",
      "respective",
      "respectful",
      "respectable",
    ]);
    expect(result.confusionBoundary).toHaveLength(0);
  });

  it("returns no-match for out-of-kb word meaning lookup", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "recent 这个词什么意思",
    });

    expect(result.resolution).toBe("no_match");
    expect(result.noMatchReason).toBe("out_of_kb");
    expect(result.mainAnswer).toHaveLength(0);
  });

  it("returns no-match for out-of-kb fuzzy recall", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "有个像 recent 的词",
    });

    expect(result.resolution).toBe("no_match");
    expect(result.noMatchReason).toBe("out_of_kb");
    expect(result.mainAnswer).toHaveLength(0);
  });

  it("returns no-match for out-of-kb comparison", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "recent 和 consent 的区别",
    });

    expect(result.queryMode).toBe("direct_compare");
    expect(result.resolution).toBe("no_match");
    expect(result.noMatchReason).toBe("out_of_kb");
  });

  it("returns a lookalike cluster for recent", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "跟 recent 很像的词有哪些",
    });

    expect(result.queryMode).toBe("shape_neighbor_search");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual(
      expect.arrayContaining(["recent", "resent"]),
    );
    expect(result.mainAnswer).toHaveLength(2);
    expect(result.comparisonView?.members.map((member) => member.lemma)).toEqual(
      expect.arrayContaining(["recent", "resent"]),
    );
    expect(result.comparisonView?.whyConfusing).toBeTruthy();
  });

  it("returns likely misread neighbors for recent", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "容易把 recent 看错成什么",
    });

    expect(result.queryMode).toBe("shape_neighbor_search");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toContain("recent");
    expect(
      [...result.mainAnswer, ...result.confusionBoundary].map((candidate) => candidate.lemma),
    ).toContain("resent");
    expect(result.comparisonView?.whyConfusing).toBeTruthy();
    expect(result.comparisonView?.semanticBoundaryNotes.length).toBeGreaterThan(0);
  });

  it("resolves recent 和 resent 的区别 as a confusion comparison", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "recent 和 resent 的区别",
    });

    expect(result.queryMode).toBe("direct_compare");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual(["recent", "resent"]);
    expect(result.comparisonView?.members.map((member) => member.lemma)).toEqual(
      expect.arrayContaining(["recent", "resent"]),
    );
    expect(result.comparisonView?.semanticBoundaryNotes.length).toBeGreaterThan(0);
  });

  it("resolves adapt 和 adopt 的区别 as a confusion comparison", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet4",
      query: "adapt 和 adopt 的区别",
    });

    expect(result.queryMode).toBe("direct_compare");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual(["adapt", "adopt"]);
    expect(result.comparisonView?.members.map((member) => member.lemma)).toEqual(
      expect.arrayContaining(["adapt", "adopt"]),
    );
    expect(result.comparisonView?.whyConfusing).toBeTruthy();
  });

  it("resolves quiet 和 quite 的区别 as a confusion comparison", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet4",
      query: "quiet 和 quite 的区别",
    });

    expect(result.queryMode).toBe("direct_compare");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual(["quiet", "quite"]);
    expect(result.comparisonView?.members.map((member) => member.lemma)).toEqual(
      expect.arrayContaining(["quiet", "quite"]),
    );
    expect(result.comparisonView?.semanticBoundaryNotes.length).toBeGreaterThan(0);
  });

  it("keeps exact compare terms without forcing a confusion boundary", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "institute 和 restrain 的区别",
    });

    expect(result.queryMode).toBe("direct_compare");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual([
      "institute",
      "restrain",
    ]);
    expect(result.confusionBoundary).toHaveLength(0);
    expect(result.comparisonView).toBeNull();
  });

  it("handles 哪个-question as direct comparison when multiple exact words are present", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet4",
      query: "affect 和 effect 哪个是动词",
    });

    expect(result.queryMode).toBe("direct_compare");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual([
      "affect",
      "effect",
    ]);
    expect(result.confusionBoundary.map((candidate) => candidate.lemma)).toEqual(["impact"]);
  });
});
