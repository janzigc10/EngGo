import { describe, expect, it } from "vitest";

import type { SourceLemmaMembership } from "../../src/features/content/source-lemma-sources";
import type {
  RunnerCaseResult,
  RunnerSummary,
} from "../run-answer-style-provider-smoke";
import {
  buildSourceOnlyLookupSampleReport,
  buildSourceOnlyLookupSamplePlan,
  classifySourceOnlyLookupResult,
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
    lemma: "x-ray",
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

function sourceMembership(
  lemma: string,
  scopeCode: SourceLemmaMembership["scopeCode"],
): SourceLemmaMembership {
  return {
    lemma,
    scopeCode,
    sourceName: "fixture",
    sourceScope: scopeCode === "cet6" ? "cet6-extra" : scopeCode,
  };
}

function resultFixture(
  overrides: Partial<RunnerCaseResult>,
): RunnerCaseResult {
  return {
    name: "source-only: fixture [cet4]",
    autoVerdict: "pass",
    hardFailures: [],
    manualChecks: [],
    manualFlags: [],
    status: 200,
    queryMode: "direct_lookup",
    resolution: "resolved",
    answerStyle: "standard_lookup",
    providerRequestId: "resp_fixture",
    errorCode: null,
    elapsedMs: 100,
    answerChars: 20,
    maxAnswerChars: 220,
    groundingSummary: "fixture",
    answerPreview: "fixture 常见作 n.，核心义是“样例”。",
    errorMessage: null,
    ...overrides,
  };
}

const summaryFixture: RunnerSummary = {
  total: 3,
  pass: 1,
  manual: 1,
  fail: 1,
  resolved: 2,
  no_match: 1,
  providerCalled: 2,
  providerSkipped: 1,
  providerUnknown: 0,
  avgElapsedMs: 100,
  maxElapsedMs: 200,
  answerLengthByStyle: {
    standard_lookup: {
      count: 3,
      min: 12,
      max: 42,
      average: 24,
      p50: 20,
      p90: 42,
      warnings: 0,
    },
  },
  nextStep: "fixture next step",
};

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
      expect.arrayContaining(["a", "a.m", "x-ray"]),
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

  it("can build a deterministic stratified sample across source scopes", () => {
    const stratifiedMemberships = [
      "ability",
      "absence",
      "absolute",
      "absorb",
    ].map((lemma) => sourceMembership(lemma, "gaokao"))
      .concat(
        ["campaign", "captain", "career", "central"].map((lemma) =>
          sourceMembership(lemma, "cet4")
        ),
        ["density", "diagram", "diploma", "duration"].map((lemma) =>
          sourceMembership(lemma, "cet6")
        ),
      );
    const firstPlan = buildSourceOnlyLookupSamplePlan({
      memberships: stratifiedMemberships,
      structuredLemmas: [],
      scopes: ["gaokao", "cet4", "cet6"],
      limit: 6,
      offset: 0,
      sampleMode: "stratified",
      seed: "scale-v1",
    });
    const secondPlan = buildSourceOnlyLookupSamplePlan({
      memberships: stratifiedMemberships,
      structuredLemmas: [],
      scopes: ["gaokao", "cet4", "cet6"],
      limit: 6,
      offset: 0,
      sampleMode: "stratified",
      seed: "scale-v1",
    });

    expect(firstPlan.cases.map((item) => item.query)).toEqual(
      secondPlan.cases.map((item) => item.query),
    );
    expect(firstPlan.cases.filter((item) => item.activeExamTarget === "gaokao"))
      .toHaveLength(2);
    expect(firstPlan.cases.filter((item) => item.activeExamTarget === "cet4"))
      .toHaveLength(2);
    expect(firstPlan.cases.filter((item) => item.activeExamTarget === "cet6"))
      .toHaveLength(2);
  });
});

describe("source-only sample report", () => {
  it("classifies result actions from provider smoke failures", () => {
    expect(classifySourceOnlyLookupResult(resultFixture({}))).toBe("direct_usable");
    expect(
      classifySourceOnlyLookupResult(
        resultFixture({
          autoVerdict: "fail",
          hardFailures: ["answer should not include 当前检索"],
        }),
      ),
    ).toBe("prompt_or_cleaning_issue");
    expect(
      classifySourceOnlyLookupResult(
        resultFixture({
          autoVerdict: "fail",
          hardFailures: ["resolution expected resolved, received no_match"],
        }),
      ),
    ).toBe("retrieval_or_source_issue");
    expect(
      classifySourceOnlyLookupResult(
        resultFixture({
          autoVerdict: "manual",
          manualFlags: ["answer may be too long: 260/220"],
        }),
      ),
    ).toBe("structured_entry_candidate");
  });

  it("builds JSON and Markdown reports for long source-only samples", () => {
    const passResult = resultFixture({ name: "source-only: ability [gaokao]" });
    const failResult = resultFixture({
      name: "source-only: broken [cet4]",
      autoVerdict: "fail",
      hardFailures: ["answer should not include 当前检索"],
      answerPreview: "broken 当前检索未提供中文核心义。",
    });
    const manualResult = resultFixture({
      name: "source-only: complex [cet6]",
      autoVerdict: "manual",
      manualFlags: ["answer may be too long: 260/220"],
    });
    const report = buildSourceOnlyLookupSampleReport({
      generatedAt: "2026-05-09T00:00:00.000Z",
      options: {
        datasetName: "real-smoke",
        limit: 300,
        offset: 0,
        scopes: ["gaokao", "cet4", "cet6"],
        sampleMode: "stratified",
        seed: "scale-v1",
        outputDir: "output/source-only-lookup-sample",
        reportName: "source-only-scale-v1",
      },
      plan: {
        totalCandidates: 7404,
        returnedCandidates: 3,
        cases: [],
      },
      results: [passResult, failResult, manualResult],
      summary: summaryFixture,
    });

    expect(report.json.actionCounts).toEqual({
      direct_usable: 1,
      prompt_or_cleaning_issue: 1,
      retrieval_or_source_issue: 0,
      structured_entry_candidate: 1,
    });
    expect(report.json.structuredEntryCandidates.map((item) => item.name))
      .toEqual(["source-only: complex [cet6]"]);
    expect(report.markdown).toContain("# Source-Only Lookup Sample Report");
    expect(report.markdown).toContain("prompt_or_cleaning_issue");
    expect(report.markdown).toContain("source-only: broken [cet4]");
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
      sampleMode: "stratified",
      seed: "source-only-scale-v1",
      outputDir: "output/source-only-lookup-sample",
      reportName: null,
    });
  });

  it("parses stratified sampling and output report options", () => {
    expect(
      parseSourceOnlyLookupSampleArgs([
        "node",
        "script",
        "--sample",
        "window",
        "--seed",
        "custom-seed",
        "--output-dir",
        "tmp/reports",
        "--report-name",
        "sample-300",
      ]),
    ).toMatchObject({
      sampleMode: "window",
      seed: "custom-seed",
      outputDir: "tmp/reports",
      reportName: "sample-300",
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
