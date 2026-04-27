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

  it("detects root fragment summary intent", () => {
    expect(detectQueryMode("stitute 是什么")).toBe("root_family_summary");
  });

  it("detects root family study intent", () => {
    expect(detectQueryMode("tempt 这一族怎么记")).toBe("root_family_summary");
  });

  it("detects known root-family member study intent", () => {
    expect(detectQueryMode("attempt 这一族怎么记")).toBe("root_family_summary");
    expect(detectQueryMode("institute 这种同根词怎么记")).toBe("root_family_summary");
    expect(detectQueryMode("跟 institute 一样那几个词怎么记")).toBe("root_family_summary");
  });

  it("detects prefix combination root intent", () => {
    expect(detectQueryMode("re+con 的词根有什么词")).toBe("root_family_summary");
  });

  it("detects fragment pattern root intent", () => {
    expect(detectQueryMode("re...ct 这种词")).toBe("root_family_summary");
  });

  it("detects prefix fragment list intent", () => {
    expect(detectQueryMode("inter 开头的词有哪些")).toBe("root_family_summary");
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
    expect(result.comparisonView?.id).toBe("comply-conform-defer");
    expect(result.comparisonView?.purposes).toContain("expression_recall");
    expect(
      [...result.mainAnswer, ...result.confusionBoundary].map((candidate) => candidate.lemma),
    ).toEqual(expect.arrayContaining(["comply", "conform", "defer"]));
  });

  it("keeps meaning lookup stable after direct comparison lookups", async () => {
    await retrieveCandidates({
      activeExamTarget: "cet4",
      query: "stationary 和 stationery 哪个是文具",
    });
    await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "access assess excess 怎么区分",
    });

    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "遵从怎么说",
    });

    expect(result.queryMode).toBe("meaning_lookup");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer[0]?.lemma).toBe("comply");
    expect(result.comparisonView?.id).toBe("comply-conform-defer");
  });

  it("prefers the expression recall group for Chinese suggestion lookup", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "建议怎么说",
    });

    expect(result.queryMode).toBe("meaning_lookup");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer[0]?.lemma).toBe("recommend");
    expect(result.comparisonView?.id).toBe("recommend-suggest-propose");
    expect(result.comparisonView?.purposes).toContain("expression_recall");
    expect(
      [...result.mainAnswer, ...result.confusionBoundary].map((candidate) => candidate.lemma),
    ).toEqual(expect.arrayContaining(["recommend", "suggest", "propose"]));
  });

  it("prefers the expression recall group for Chinese requirement lookup", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "要求怎么说",
    });

    expect(result.queryMode).toBe("meaning_lookup");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer[0]?.lemma).toBe("require");
    expect(result.comparisonView?.id).toBe("require-demand-request");
    expect(result.comparisonView?.purposes).toContain("expression_recall");
    expect(
      [...result.mainAnswer, ...result.confusionBoundary].map((candidate) => candidate.lemma),
    ).toEqual(expect.arrayContaining(["require", "demand", "request"]));
  });

  it("keeps incomplete institute recall inside the tight institute/institution boundary", async () => {
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
      expect.arrayContaining(["institution", "institute"]),
    );
    expect(
      [result.mainAnswer[0]?.lemma, ...result.confusionBoundary.map((candidate) => candidate.lemma)],
    ).not.toContain("establish");
  });

  it("resolves single-edit typo lookups inside the current exam scope", async () => {
    const generateResult = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "generte 是什么意思",
    });
    const horizonResult = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "horizen 是什么意思",
    });

    expect(generateResult.queryMode).toBe("fuzzy_recall");
    expect(generateResult.resolution).toBe("resolved");
    expect(generateResult.mainAnswer[0]?.lemma).toBe("generate");

    expect(horizonResult.queryMode).toBe("fuzzy_recall");
    expect(horizonResult.resolution).toBe("resolved");
    expect(horizonResult.mainAnswer[0]?.lemma).toBe("horizon");
  });

  it("resolves tight second-layer typo lookups inside the current exam scope", async () => {
    const requestResult = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "有个像 reqeust 的词",
    });
    const recommendResult = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "有个像 recomand 的词",
    });

    expect(requestResult.queryMode).toBe("fuzzy_recall");
    expect(requestResult.resolution).toBe("resolved");
    expect(requestResult.mainAnswer[0]?.lemma).toBe("request");

    expect(recommendResult.queryMode).toBe("fuzzy_recall");
    expect(recommendResult.resolution).toBe("resolved");
    expect(recommendResult.mainAnswer[0]?.lemma).toBe("recommend");
  });

  it("keeps broader low-score typo recall conservative", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "有个像 reqxust 的词",
    });

    expect(result.queryMode).toBe("fuzzy_recall");
    expect(result.resolution).toBe("no_match");
    expect(result.mainAnswer).toHaveLength(0);
  });

  it("does not treat institute and establish as a shared confusion group", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "institute establish 怎么区分",
    });

    expect(result.queryMode).toBe("direct_compare");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual([
      "institute",
      "establish",
    ]);
    expect(result.confusionBoundary).toHaveLength(0);
    expect(result.comparisonView).toBeNull();
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

  it("resolves the comply/conform/defer expression group for explicit three-term comparison", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "comply conform defer 怎么区分",
    });

    expect(result.queryMode).toBe("direct_compare");
    expect(result.resolution).toBe("resolved");
    expect(result.comparisonView?.id).toBe("comply-conform-defer");
    expect(result.comparisonView?.labels).toEqual(
      expect.arrayContaining(["meaning_near", "collocation_boundary"]),
    );
    expect(result.comparisonView?.purposes).toContain("expression_recall");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual([
      "comply",
      "conform",
      "defer",
    ]);
    expect(result.confusionBoundary).toHaveLength(0);
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

  it("keeps derived-family group queries available as memory maps", async () => {
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

  it("surfaces memory-map metadata for existing derived groups", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet4",
      query: "respect 那组词怎么分",
    });

    expect(result.resolution).toBe("resolved");
    expect(result.comparisonView?.id).toBe("respect-respective-respectful-respectable");
    expect(result.comparisonView?.labels).toEqual(expect.arrayContaining(["root_family"]));
    expect(result.comparisonView?.labels).not.toContain("shape_like");
    expect(result.comparisonView?.purposes).toEqual(["memory_map"]);
    expect(result.comparisonView?.anchorPattern).toBe("respect");
  });

  it("surfaces shape-like cluster metadata for existing lookalike groups", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "access assess excess 怎么区分",
    });

    expect(result.resolution).toBe("resolved");
    expect(result.comparisonView?.id).toBe("access-assess-excess");
    expect(result.comparisonView?.labels).toEqual(
      expect.arrayContaining(["shape_like", "exam_high_value"]),
    );
  });

  it("resolves stitute words as one root-family confusion cluster", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "institute substitute constitute 怎么分",
    });

    expect(result.queryMode).toBe("direct_compare");
    expect(result.resolution).toBe("resolved");
    expect(result.comparisonView?.id).toBe("root-stitute");
    expect(result.comparisonView?.labels).toContain("root_family");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual([
      "institute",
      "substitute",
      "constitute",
    ]);
    expect(result.confusionBoundary.map((candidate) => candidate.lemma)).toContain("institution");
  });

  it("returns no-match for out-of-kb word meaning lookup", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "zzzzword 这个词什么意思",
    });

    expect(result.resolution).toBe("no_match");
    expect(result.noMatchReason).toBe("out_of_kb");
    expect(result.mainAnswer).toHaveLength(0);
  });

  it("returns no-match for out-of-kb fuzzy recall", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "有个像 zzzzword 的词",
    });

    expect(result.resolution).toBe("no_match");
    expect(result.noMatchReason).toBe("out_of_kb");
    expect(result.mainAnswer).toHaveLength(0);
  });

  it("returns no-match for out-of-kb comparison", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "zzzzword 和 qqqqword 的区别",
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

  it("prefers spelling-neighbor groups over semantic groups for shape searches", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "gaokao",
      query: "容易把 adapt 看错成什么",
    });

    expect(result.queryMode).toBe("shape_neighbor_search");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual(["adapt", "adopt"]);
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).not.toContain("accommodate");
    expect(result.comparisonView?.id).toBe("adapt-adopt");
  });

  it("keeps confusion groups out of ordinary lookup boundaries", async () => {
    const cases = [
      {
        query: "recommend 是什么意思",
        activeExamTarget: "cet6",
        main: "recommend",
        excludedBoundary: ["suggest", "propose"],
      },
      {
        query: "request 是什么意思",
        activeExamTarget: "cet6",
        main: "request",
        excludedBoundary: ["require", "demand"],
      },
      {
        query: "adapt 是什么意思",
        activeExamTarget: "cet6",
        main: "adapt",
        excludedBoundary: ["adopt", "adjust", "accommodate"],
      },
      {
        query: "affect 是什么意思",
        activeExamTarget: "cet6",
        main: "affect",
        excludedBoundary: ["effect", "impact"],
      },
      {
        query: "impact 是什么意思",
        activeExamTarget: "cet6",
        main: "impact",
        excludedBoundary: ["affect", "effect"],
      },
      {
        query: "defer 是什么意思",
        activeExamTarget: "cet6",
        main: "defer",
        excludedBoundary: ["comply", "conform"],
      },
      {
        query: "curb 是什么意思",
        activeExamTarget: "cet6",
        main: "curb",
        excludedBoundary: ["restrain", "constrain"],
      },
      {
        query: "institute 是什么意思",
        activeExamTarget: "cet6",
        main: "institute",
        excludedBoundary: ["institution"],
      },
      {
        query: "recent 是什么意思",
        activeExamTarget: "cet6",
        main: "recent",
        excludedBoundary: ["resent"],
      },
      {
        query: "stationary 是什么意思",
        activeExamTarget: "cet4",
        main: "stationary",
        excludedBoundary: ["stationery"],
      },
      {
        query: "respect 是什么意思",
        activeExamTarget: "cet6",
        main: "respect",
        excludedBoundary: ["respective", "respectful", "respectable"],
      },
      {
        query: "advice 是什么意思",
        activeExamTarget: "cet4",
        main: "advice",
        excludedBoundary: ["advise"],
      },
      {
        query: "economic 是什么意思",
        activeExamTarget: "cet6",
        main: "economic",
        excludedBoundary: ["economical"],
      },
      {
        query: "device 是什么意思",
        activeExamTarget: "cet6",
        main: "device",
        excludedBoundary: ["devise"],
      },
      {
        query: "breath 是什么意思",
        activeExamTarget: "cet4",
        main: "breath",
        excludedBoundary: ["breathe"],
      },
    ];

    for (const testCase of cases) {
      const result = await retrieveCandidates({
        activeExamTarget: testCase.activeExamTarget,
        query: testCase.query,
      });

      expect(result.resolution).toBe("resolved");
      expect(result.mainAnswer[0]?.lemma).toBe(testCase.main);
      const boundaryLemmas = result.confusionBoundary.map((candidate) => candidate.lemma);

      for (const excludedLemma of testCase.excludedBoundary) {
        expect(boundaryLemmas).not.toContain(excludedLemma);
      }
    }
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

  it("resolves access assess excess as a P0 shape-neighbor comparison group", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "access assess excess 怎么区分",
    });

    expect(result.queryMode).toBe("direct_compare");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual([
      "access",
      "assess",
      "excess",
    ]);
    expect(result.comparisonView?.id).toBe("access-assess-excess");
    expect(result.comparisonView?.members.map((member) => member.lemma)).toEqual(
      expect.arrayContaining(["access", "assess", "excess"]),
    );
    expect(result.comparisonView?.whyConfusing).toBeTruthy();
  });

  it("does not surface contrived letter mnemonics for stationary stationery", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet4",
      query: "stationary 和 stationery 哪个是文具",
    });

    const notes = result.comparisonView?.members
      .map((member) => member.emphasisNote ?? "")
      .join("\n") ?? "";

    expect(result.comparisonView?.id).toBe("stationary-stationery");
    expect(notes).not.toContain("envelope");
    expect(notes).not.toContain("stay");
    expect(notes).toContain("remain stationary");
    expect(notes).toContain("stationery store");
  });

  it("returns a lookalike cluster for breath", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet4",
      query: "跟 breath 很像的词有哪些",
    });

    expect(result.queryMode).toBe("shape_neighbor_search");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual(
      expect.arrayContaining(["breath", "breathe"]),
    );
    expect(result.comparisonView?.id).toBe("breath-breathe");
    expect(result.comparisonView?.semanticBoundaryNotes.length).toBeGreaterThan(0);
  });

  it("falls back to dynamic in-scope lookalikes when no curated group exists", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "跟 statue 很像的词有哪些",
    });

    expect(result.queryMode).toBe("shape_neighbor_search");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual(
      expect.arrayContaining(["statue", "status", "statute"]),
    );
    expect(result.mainAnswer.every((candidate) => candidate.inScope)).toBe(true);
    expect(result.mainAnswer.every((candidate) => candidate.meaningsZh.length > 0)).toBe(true);
    expect(result.comparisonView).toBeNull();
  });

  it("keeps dynamic lookalikes inside the active exam scope", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "gaokao",
      query: "跟 statue 很像的词有哪些",
    });

    expect(result.queryMode).toBe("shape_neighbor_search");
    expect(result.resolution).toBe("resolved");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual(
      expect.arrayContaining(["statue", "state"]),
    );
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).not.toContain("status");
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).not.toContain("statute");
    expect(result.mainAnswer.every((candidate) => candidate.inScope)).toBe(true);
  });

  it("resolves stitute as a minimal root family summary", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "stitute 是什么",
    });

    expect(result.queryMode).toBe("root_family_summary");
    expect(result.resolution).toBe("resolved");
    expect(result.rootFamilyView?.id).toBe("root-stitute");
    expect(result.rootFamilyView?.members.map((member) => member.lemma)).toContain("institute");
  });

  it("resolves known family members back to their root-family summary", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "attempt 这一族怎么记",
    });

    expect(result.queryMode).toBe("root_family_summary");
    expect(result.resolution).toBe("resolved");
    expect(result.rootFamilyView?.id).toBe("root-tempt");
    expect(result.rootFamilyView?.members.map((member) => member.lemma)).toEqual(
      expect.arrayContaining(["attempt", "tempt", "temptation", "contempt"]),
    );
  });

  it("routes known root-family memory prompts to the summary view", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "跟 institute 一样那几个词怎么记",
    });

    expect(result.queryMode).toBe("root_family_summary");
    expect(result.resolution).toBe("resolved");
    expect(result.rootFamilyView?.id).toBe("root-stitute");
    expect(result.rootFamilyView?.members.map((member) => member.lemma)).toEqual(
      expect.arrayContaining(["institute", "institution", "constitute", "substitute"]),
    );
    expect(result.rootFamilyView?.members.map((member) => member.lemma)).not.toContain("restitute");
    expect(result.rootFamilyView?.members.map((member) => member.lemma)).not.toContain("prostitute");
  });

  it("keeps unsupported root combinations as no-match", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "re+con 的词根有什么词",
    });

    expect(result.queryMode).toBe("root_family_summary");
    expect(result.resolution).toBe("no_match");
    expect(result.rootFamilyView).toBeNull();
  });

  it("resolves narrow prefix fragment recall from in-scope entries", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "inter 开头的词有哪些",
    });

    expect(result.queryMode).toBe("root_family_summary");
    expect(result.resolution).toBe("resolved");
    expect(result.rootFamilyView?.id).toBe("fragment-prefix-inter");
    expect(result.rootFamilyView?.members.map((member) => member.lemma)).toEqual([
      "international",
      "interpret",
      "interrupt",
    ]);
    expect(result.mainAnswer.map((candidate) => candidate.lemma)).toEqual([
      "international",
      "interpret",
      "interrupt",
    ]);
  });

  it("resolves narrow start-end fragment patterns from in-scope entries", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "re...nt 这种词",
    });

    expect(result.queryMode).toBe("root_family_summary");
    expect(result.resolution).toBe("resolved");
    expect(result.rootFamilyView?.id).toBe("fragment-pattern-re-nt");
    expect(result.rootFamilyView?.members.map((member) => member.lemma)).toEqual([
      "recent",
      "resent",
    ]);
  });

  it("resolves broad prefix fragment recall with all in-scope members", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "con 开头的词有哪些",
    });

    expect(result.queryMode).toBe("root_family_summary");
    expect(result.resolution).toBe("resolved");
    expect(result.rootFamilyView?.id).toBe("fragment-prefix-con");
    expect(result.rootFamilyView?.members.map((member) => member.lemma)).toEqual([
      "concentrate",
      "concept",
      "concern",
      "conclude",
      "condition",
      "conduct",
      "conference",
      "confidence",
      "confident",
      "confirm",
      "conflict",
      "conform",
      "connection",
      "conscience",
      "conscious",
      "consequence",
      "consider",
      "considerable",
      "considerate",
      "constant",
      "constitute",
      "constrain",
      "construct",
      "consume",
      "contact",
      "contain",
      "contempt",
      "content",
      "context",
      "continent",
      "contrast",
      "contribute",
      "control",
      "convenient",
    ]);
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
    expect(result.comparisonView?.id).toBe("affect-effect");
    expect(result.confusionBoundary.map((candidate) => candidate.lemma)).not.toContain("impact");
  });
});
