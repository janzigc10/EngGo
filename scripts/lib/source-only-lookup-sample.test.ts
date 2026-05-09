import { describe, expect, it } from "vitest";

import type { SourceLemmaMembership } from "../../src/features/content/source-lemma-sources";
import {
  buildSourceOnlyLookupSamplePlan,
  parseSourceOnlyLookupSampleArgs,
} from "./source-only-lookup-sample";

const memberships: SourceLemmaMembership[] = [
  {
    lemma: "a",
    scopeCode: "cet4",
    sourceName: "cet-2016-lemmas.tsv",
    sourceScope: "cet4",
  },
  {
    lemma: "a.m",
    scopeCode: "gaokao",
    sourceName: "gaokao-2020-lemmas.txt",
    sourceScope: "gaokao",
  },
  {
    lemma: "accent",
    scopeCode: "cet4",
    sourceName: "cet-2016-lemmas.tsv",
    sourceScope: "cet4",
  },
  {
    lemma: "accent",
    scopeCode: "cet6",
    sourceName: "cet-2016-lemmas.tsv",
    sourceScope: "cet4",
  },
  {
    lemma: "abandon",
    scopeCode: "gaokao",
    sourceName: "gaokao-2020-lemmas.txt",
    sourceScope: "gaokao",
  },
  {
    lemma: "academic",
    scopeCode: "cet4",
    sourceName: "cet-2016-lemmas.tsv",
    sourceScope: "cet4",
  },
  {
    lemma: "battery",
    scopeCode: "cet6",
    sourceName: "cet-2016-lemmas.tsv",
    sourceScope: "cet6-extra",
  },
];

describe("buildSourceOnlyLookupSamplePlan", () => {
  it("builds standard lookup provider cases for lookup-friendly unstructured source lemmas only", () => {
    const plan = buildSourceOnlyLookupSamplePlan({
      memberships,
      structuredLemmas: ["academic"],
      scopes: ["gaokao", "cet4", "cet6"],
      limit: 10,
      offset: 0,
    });

    expect(plan.totalCandidates).toBe(3);
    expect(plan.cases.map((item) => item.query)).toEqual([
      "abandon",
      "accent",
      "battery",
    ]);
    expect(plan.cases.map((item) => item.activeExamTarget)).toEqual([
      "gaokao",
      "cet4",
      "cet6",
    ]);

    const accentCase = plan.cases.find((item) => item.query === "accent");

    expect(accentCase).toMatchObject({
      name: "source-only: accent [cet4]",
      expectedQueryMode: "direct_lookup",
      expectedResolution: "resolved",
      expectedAnswerStyle: "standard_lookup",
      expectedGroundingIncludes: ["accent"],
      expectedAnswerIncludes: ["核心义"],
      expectedComparisonViewId: null,
      expectedRootFamilyViewId: null,
    });
    expect(accentCase?.forbiddenAnswerIncludes).toEqual(
      expect.arrayContaining(["名词", "无需要区分", "source lemma"]),
    );
  });

  it("skips source lemmas that the exact lookup parser cannot resolve reliably", () => {
    const plan = buildSourceOnlyLookupSamplePlan({
      memberships,
      structuredLemmas: [],
      scopes: ["gaokao", "cet4", "cet6"],
      limit: 10,
      offset: 0,
    });

    expect(plan.cases.map((item) => item.query)).not.toEqual(
      expect.arrayContaining(["a", "a.m"]),
    );
  });

  it("paginates deterministically after filtering and de-duplicating lemmas", () => {
    const plan = buildSourceOnlyLookupSamplePlan({
      memberships,
      structuredLemmas: ["academic"],
      scopes: ["gaokao", "cet4", "cet6"],
      limit: 1,
      offset: 1,
    });

    expect(plan.cases.map((item) => item.query)).toEqual(["accent"]);
    expect(plan.returnedCandidates).toBe(1);
    expect(plan.totalCandidates).toBe(3);
  });
});

describe("parseSourceOnlyLookupSampleArgs", () => {
  it("parses sample runner options", () => {
    expect(
      parseSourceOnlyLookupSampleArgs([
        "node",
        "script",
        "--",
        "--dataset",
        "real-smoke",
        "--limit",
        "30",
        "--offset",
        "10",
        "--scopes",
        "cet4,cet6",
      ]),
    ).toEqual({
      datasetName: "real-smoke",
      limit: 30,
      offset: 10,
      scopes: ["cet4", "cet6"],
    });
  });

  it("rejects unknown arguments and invalid scopes", () => {
    expect(() =>
      parseSourceOnlyLookupSampleArgs(["node", "script", "--limit"]),
    ).toThrow("Expected a positive integer after --limit.");
    expect(() =>
      parseSourceOnlyLookupSampleArgs(["node", "script", "--scopes", "postgrad"]),
    ).toThrow("Unsupported source-only sample scope: postgrad.");
    expect(() =>
      parseSourceOnlyLookupSampleArgs(["node", "script", "--unknown"]),
    ).toThrow("Unknown argument: --unknown.");
  });
});
