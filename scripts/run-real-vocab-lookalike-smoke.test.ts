import { describe, expect, it } from "vitest";

import type { RetrievalResult } from "../src/features/retrieval/types";
import {
  evaluateLookalikeSmokeCase,
  summarizeLookalikeSmokeResults,
  type LookalikeSmokeCase,
} from "./run-real-vocab-lookalike-smoke";

const caseDef = {
  name: "cet6 statue dynamic lookalikes",
  query: "跟 statue 很像的词有哪些",
  activeExamTarget: "cet6",
  expectedQueryMode: "shape_neighbor_search",
  expectedResolution: "resolved",
  expectedIncludes: ["statue", "status", "statute"],
  expectedExcludes: ["stationery"],
  minCandidates: 3,
  maxCandidates: 4,
} satisfies LookalikeSmokeCase;

function createRetrievalResult(
  overrides: Partial<RetrievalResult> = {},
): RetrievalResult {
  return {
    queryMode: "shape_neighbor_search",
    normalizedQuery: {
      raw: caseDef.query,
      normalizedText: caseDef.query,
      queryMode: "shape_neighbor_search",
      englishTerms: ["statue"],
      meaningHint: null,
      compareTerms: [],
      groupSeedTerm: null,
    },
    resolution: "resolved",
    noMatchReason: null,
    candidates: [],
    mainAnswer: [
      {
        entryId: "statue",
        lemma: "statue",
        meaningsZh: ["雕像"],
        matchedAlias: null,
        scopeCodes: ["gaokao", "cet4", "cet6"],
        inScope: true,
        reason: "当前考试范围命中",
        score: 100,
      },
      {
        entryId: "status",
        lemma: "status",
        meaningsZh: ["地位"],
        matchedAlias: null,
        scopeCodes: ["cet4", "cet6"],
        inScope: true,
        reason: "当前考试范围命中",
        score: 90,
      },
      {
        entryId: "statute",
        lemma: "statute",
        meaningsZh: ["法令"],
        matchedAlias: null,
        scopeCodes: ["cet6"],
        inScope: true,
        reason: "当前考试范围命中",
        score: 80,
      },
    ],
    confusionBoundary: [],
    comparisonView: null,
    rootFamilyView: null,
    ...overrides,
  };
}

describe("evaluateLookalikeSmokeCase", () => {
  it("passes a resolved in-scope lookalike result", () => {
    const result = evaluateLookalikeSmokeCase(caseDef, createRetrievalResult(), 12);

    expect(result.verdict).toBe("pass");
    expect(result.failures).toEqual([]);
    expect(result.lemmas).toEqual(["statue", "status", "statute"]);
  });

  it("fails on grounding drift and unsafe candidates", () => {
    const result = evaluateLookalikeSmokeCase(
      caseDef,
      createRetrievalResult({
        queryMode: "direct_compare",
        mainAnswer: [
          {
            entryId: "statue",
            lemma: "statue",
            meaningsZh: [],
            matchedAlias: null,
            scopeCodes: ["gaokao", "cet4", "cet6"],
            inScope: true,
            reason: "当前考试范围命中",
            score: 100,
          },
          {
            entryId: "stationery",
            lemma: "stationery",
            meaningsZh: ["文具"],
            matchedAlias: null,
            scopeCodes: ["cet6"],
            inScope: false,
            reason: "范围外候选",
            score: 20,
          },
        ],
      }),
      33,
    );

    expect(result.verdict).toBe("fail");
    expect(result.failures).toEqual(
      expect.arrayContaining([
        "queryMode expected shape_neighbor_search, received direct_compare",
        "missing expected lemma status",
        "forbidden lemma surfaced stationery",
        "candidate statue has no Chinese meaning",
        "candidate stationery is out of active scope",
        "candidate count 2 is below minCandidates 3",
      ]),
    );
  });
});

describe("summarizeLookalikeSmokeResults", () => {
  it("aggregates pass and fail counts", () => {
    expect(
      summarizeLookalikeSmokeResults([
        {
          name: "a",
          verdict: "pass",
          failures: [],
          lemmas: ["a", "b"],
          elapsedMs: 10,
        },
        {
          name: "b",
          verdict: "fail",
          failures: ["missing c"],
          lemmas: ["b"],
          elapsedMs: 20,
        },
      ]),
    ).toEqual({
      total: 2,
      pass: 1,
      fail: 1,
      averageElapsedMs: 15,
    });
  });
});
