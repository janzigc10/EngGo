import { describe, expect, it } from "vitest";

import {
  buildBlackBoxProductSmokeCases,
  evaluateBlackBoxProductSmoke,
  summarizeBlackBoxProductSmoke,
} from "./black-box-product-smoke";

describe("black-box product smoke cases", () => {
  it("defines a compact product-facing smoke matrix", () => {
    const cases = buildBlackBoxProductSmokeCases();

    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(cases.length).toBeLessThanOrEqual(40);
    expect(new Set(cases.map((item) => item.category))).toEqual(
      new Set([
        "standard_lookup",
        "fuzzy_typo",
        "shape_neighbor",
        "confusion",
        "expression_recall",
        "root_family",
        "no_match",
      ]),
    );
    expect(cases.filter((item) => item.source === "batch3")).toHaveLength(8);
    expect(cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "standard: institute",
          expectedGroundingIncludes: ["institute"],
          forbiddenGroundingIncludes: expect.arrayContaining(["institution"]),
          expectedComparisonViewId: null,
          expectedRootFamilyViewId: null,
          expectedProviderCall: "absent",
        }),
        expect.objectContaining({
          name: "standard: institution",
          expectedGroundingIncludes: ["institution"],
          forbiddenGroundingIncludes: expect.arrayContaining(["institute"]),
          expectedComparisonViewId: null,
          expectedRootFamilyViewId: null,
        }),
        expect.objectContaining({
          name: "standard: effect",
          expectedGroundingIncludes: ["effect"],
          forbiddenGroundingIncludes: expect.arrayContaining(["affect", "impact"]),
          expectedComparisonViewId: null,
          expectedRootFamilyViewId: null,
        }),
        expect.objectContaining({
          name: "standard: respect",
          expectedGroundingIncludes: ["respect"],
          forbiddenGroundingIncludes: expect.arrayContaining(["respectful"]),
          expectedComparisonViewId: null,
          expectedRootFamilyViewId: null,
        }),
        expect.objectContaining({
          name: "root: inter prefix fragment",
          expectedAnswerStyle: "broad_vocab_summary",
          expectedProviderCall: "absent",
          expectedGroundingIncludes: expect.arrayContaining([
            "international",
            "interpret",
            "interrupt",
          ]),
          expectedComparisonViewId: null,
        }),
        expect.objectContaining({
          name: "root: broad con prefix",
          expectedResolution: "resolved",
          expectedAnswerStyle: "broad_vocab_summary",
          expectedGroundingIncludes: expect.arrayContaining([
            "concept",
            "conform",
            "conference",
          ]),
        }),
        expect.objectContaining({
          name: "root: comm prefix organizer",
          expectedResolution: "resolved",
          expectedAnswerStyle: "broad_vocab_summary",
          expectedProviderCall: "absent",
          expectedGroundingIncludes: expect.arrayContaining([
            "command",
            "comment",
            "commend",
          ]),
        }),
        expect.objectContaining({
          name: "root: struct contains fragment",
          expectedAnswerStyle: "broad_vocab_summary",
          expectedGroundingIncludes: expect.arrayContaining(["construct", "structure"]),
        }),
        expect.objectContaining({
          name: "root: con prefix re contains",
          expectedAnswerStyle: "broad_vocab_summary",
          expectedGroundingIncludes: ["conference"],
        }),
        expect.objectContaining({
          name: "root: re+con broad combination",
          expectedAnswerStyle: "broad_vocab_summary",
          expectedGroundingIncludes: expect.arrayContaining(["reconcile", "conform"]),
        }),
        expect.objectContaining({
          name: "no-match: unknown shape seed",
          expectedResolution: "no_match",
          expectedProviderCall: "absent",
        }),
        expect.objectContaining({
          name: "root: re ct fragment pattern",
          expectedRootFamilyViewId: "fragment-pattern-re-ct",
          expectedGroundingIncludes: ["respect"],
        }),
      ]),
    );
    expect(cases
      .filter((item) => item.category === "standard_lookup")
      .every((item) =>
        (item as { expectedProviderCall?: string }).expectedProviderCall
          === "absent"
      )).toBe(true);
    expect(cases
      .filter((item) =>
        item.category === "shape_neighbor"
        || item.category === "confusion"
        || item.expectedAnswerStyle === "broad_vocab_summary"
      )
      .every((item) => item.expectedProviderCall === "absent")).toBe(true);
  });

  it("summarizes verdicts by category", () => {
    const summary = summarizeBlackBoxProductSmoke([
      {
        name: "standard: gain",
        category: "standard_lookup",
        verdict: "pass",
        failures: [],
      },
      {
        name: "typo: generate",
        category: "fuzzy_typo",
        verdict: "fail",
        failures: ["grounding missing generate"],
      },
    ]);

    expect(summary).toEqual({
      total: 2,
      pass: 1,
      fail: 1,
      byCategory: {
        standard_lookup: { total: 1, pass: 1, fail: 0 },
        fuzzy_typo: { total: 1, pass: 0, fail: 1 },
      },
    });
  });

  it("checks expected routing and grounding", () => {
    const result = evaluateBlackBoxProductSmoke(
      {
        name: "standard: gain",
        category: "standard_lookup",
        source: "batch3",
        query: "gain 是什么意思",
        activeExamTarget: "cet6",
        expectedQueryMode: "fuzzy_recall",
        expectedResolution: "resolved",
        expectedAnswerStyle: "standard_lookup",
        expectedGroundingIncludes: ["gain"],
      },
      {
        queryMode: "fuzzy_recall",
        resolution: "resolved",
        answerStyle: "standard_lookup",
        groundingLemmas: [],
        comparisonViewId: null,
        rootFamilyViewId: null,
        providerCalled: true,
      },
    );

    expect(result).toEqual({
      name: "standard: gain",
      category: "standard_lookup",
      verdict: "fail",
      failures: ["grounding missing gain"],
    });
  });

  it("allows deterministic resolved cases to skip provider when declared", () => {
    const result = evaluateBlackBoxProductSmoke(
      {
        name: "standard: gain",
        category: "standard_lookup",
        source: "batch3",
        query: "gain 是什么意思",
        activeExamTarget: "cet6",
        expectedQueryMode: "fuzzy_recall",
        expectedResolution: "resolved",
        expectedAnswerStyle: "standard_lookup",
        expectedGroundingIncludes: ["gain"],
        expectedProviderCall: "absent",
      } as Parameters<typeof evaluateBlackBoxProductSmoke>[0] & {
        expectedProviderCall: "absent";
      },
      {
        queryMode: "fuzzy_recall",
        resolution: "resolved",
        answerStyle: "standard_lookup",
        groundingLemmas: ["gain"],
        comparisonViewId: null,
        rootFamilyViewId: null,
        providerCalled: false,
      },
    );

    expect(result).toEqual({
      name: "standard: gain",
      category: "standard_lookup",
      verdict: "pass",
      failures: [],
    });
  });

  it("fails when an absent-provider case reaches chat provider", () => {
    const result = evaluateBlackBoxProductSmoke(
      {
        name: "standard: gain",
        category: "standard_lookup",
        source: "batch3",
        query: "gain 是什么意思",
        activeExamTarget: "cet6",
        expectedQueryMode: "fuzzy_recall",
        expectedResolution: "resolved",
        expectedAnswerStyle: "standard_lookup",
        expectedGroundingIncludes: ["gain"],
        expectedProviderCall: "absent",
      } as Parameters<typeof evaluateBlackBoxProductSmoke>[0] & {
        expectedProviderCall: "absent";
      },
      {
        queryMode: "fuzzy_recall",
        resolution: "resolved",
        answerStyle: "standard_lookup",
        groundingLemmas: ["gain"],
        comparisonViewId: null,
        rootFamilyViewId: null,
        providerCalled: true,
      },
    );

    expect(result).toEqual({
      name: "standard: gain",
      category: "standard_lookup",
      verdict: "fail",
      failures: ["case should not reach chat provider"],
    });
  });
});
