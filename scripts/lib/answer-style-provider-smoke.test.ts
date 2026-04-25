import { describe, expect, it } from "vitest";

import {
  buildAnswerStyleProviderSmokeCases,
  evaluateAnswerStyleProviderSmoke,
  summarizeAnswerStyleProviderSmoke,
  type ProviderSmokePayload,
  type ProviderSmokeResult,
} from "./answer-style-provider-smoke";

function buildResolvedPayload(
  overrides: Partial<ProviderSmokePayload> = {},
): ProviderSmokePayload {
  return {
    status: 200,
    providerRequestId: "resp_123",
    grounding: {
      queryMode: "direct_compare",
      resolution: "resolved",
      answerStyle: "confusion_untangle",
      mainAnswer: [{ lemma: "stationery" }],
      confusionBoundary: [{ lemma: "stationary" }],
    },
    answer:
      "先问一句：你这里说的是静止不动，还是文具？如果是文具，用 stationery；如果是不动，用 stationary。",
    ...overrides,
  };
}

describe("buildAnswerStyleProviderSmokeCases", () => {
  it("defines the bounded answer-style smoke set", () => {
    const cases = buildAnswerStyleProviderSmokeCases();

    expect(cases.map((item) => item.name)).toEqual([
      "confusion: stationery choice",
      "confusion: access assess excess",
      "shape: recent lookalikes",
      "expression: comply conform defer",
      "expression: affect effect impact",
      "expression: adapt adjust accommodate",
      "expression: recommend suggest propose",
      "expression: require demand request",
      "confusion: comply conform defer",
      "confusion: respect family",
      "root: stitute",
      "root: tempt",
      "root: unsupported combination",
      "typo: reqeust still no-match",
    ]);
    expect(cases).toHaveLength(14);
    expect(cases.every((item) => item.manualChecks.length > 0)).toBe(true);
  });

  it("allows expression recall answers to read like complete writing cards", () => {
    const expressionCases = buildAnswerStyleProviderSmokeCases().filter((item) =>
      item.expectedAnswerStyle === "expression_recall"
    );

    expect(expressionCases).toHaveLength(5);
    expect(expressionCases.every((item) => item.maxAnswerChars === 400)).toBe(true);
  });
});

describe("evaluateAnswerStyleProviderSmoke", () => {
  it("passes a resolved confusion case while keeping checklist and manual flags separate", () => {
    const caseDef = buildAnswerStyleProviderSmokeCases()[0];
    const verdict = evaluateAnswerStyleProviderSmoke(caseDef, buildResolvedPayload());

    expect(verdict.autoVerdict).toBe("pass");
    expect(verdict.hardFailures).toHaveLength(0);
    expect(verdict.manualChecks).toEqual(
      expect.arrayContaining(["检查回答是否列出当前考试范围内召回到的相似词"]),
    );
    expect(verdict.manualFlags).toEqual([]);
  });

  it("fails when a resolved case does not return providerRequestId", () => {
    const caseDef = buildAnswerStyleProviderSmokeCases()[0];
    const verdict = evaluateAnswerStyleProviderSmoke(
      caseDef,
      buildResolvedPayload({
        providerRequestId: null,
      }),
    );

    expect(verdict.autoVerdict).toBe("fail");
    expect(verdict.hardFailures).toContain(
      "resolved case should return providerRequestId",
    );
  });

  it("fails when a no_match case still returns providerRequestId", () => {
    const noMatchCase = buildAnswerStyleProviderSmokeCases()[12];
    const verdict = evaluateAnswerStyleProviderSmoke(noMatchCase, {
      status: 200,
      providerRequestId: "resp_should_not_exist",
      grounding: {
        queryMode: "root_family_summary",
        resolution: "no_match",
        answerStyle: "root_family_summary",
      },
      answer: "我猜你想问 re 和 con 的同根词。",
    });

    expect(verdict.autoVerdict).toBe("fail");
    expect(verdict.hardFailures).toContain(
      "no_match case should not return providerRequestId",
    );
  });

  it("fails when a no_match case returns an empty answer", () => {
    const noMatchCase = buildAnswerStyleProviderSmokeCases()[12];
    const verdict = evaluateAnswerStyleProviderSmoke(noMatchCase, {
      status: 200,
      providerRequestId: null,
      grounding: {
        queryMode: "root_family_summary",
        resolution: "no_match",
        answerStyle: "root_family_summary",
      },
      answer: "   ",
    });

    expect(verdict.autoVerdict).toBe("fail");
    expect(verdict.hardFailures).toContain(
      "no_match case should return non-empty answer",
    );
  });

  it.each([
    {
      label: "queryMode drift",
      payload: buildResolvedPayload({
        grounding: {
          queryMode: "meaning_lookup",
          resolution: "resolved",
          answerStyle: "confusion_untangle",
          mainAnswer: [{ lemma: "stationery" }],
          confusionBoundary: [{ lemma: "stationary" }],
        },
      }),
      expectedFailure: "queryMode expected direct_compare, received meaning_lookup",
      caseIndex: 0,
    },
    {
      label: "resolution drift",
      payload: buildResolvedPayload({
        grounding: {
          queryMode: "direct_compare",
          resolution: "no_match",
          answerStyle: "confusion_untangle",
          mainAnswer: [{ lemma: "stationery" }],
          confusionBoundary: [{ lemma: "stationary" }],
        },
      }),
      expectedFailure: "resolution expected resolved, received no_match",
      caseIndex: 0,
    },
    {
      label: "answerStyle drift",
      payload: buildResolvedPayload({
        grounding: {
          queryMode: "direct_compare",
          resolution: "resolved",
          answerStyle: "standard_lookup",
          mainAnswer: [{ lemma: "stationery" }],
          confusionBoundary: [{ lemma: "stationary" }],
        },
      }),
      expectedFailure: "answerStyle expected confusion_untangle, received standard_lookup",
      caseIndex: 0,
    },
    {
      label: "missing grounding lemma",
      payload: buildResolvedPayload({
        grounding: {
          queryMode: "direct_compare",
          resolution: "resolved",
          answerStyle: "confusion_untangle",
          mainAnswer: [{ lemma: "stationery" }],
          confusionBoundary: [],
        },
      }),
      expectedFailure: "grounding missing stationary",
      caseIndex: 0,
    },
    {
      label: "wrong root family id",
      payload: {
        status: 200,
        providerRequestId: "resp_root_123",
        grounding: {
          queryMode: "root_family_summary",
          resolution: "resolved",
          answerStyle: "root_family_summary",
          rootFamilyView: {
            id: "root-wrong",
            members: [
              { lemma: "institute" },
              { lemma: "institution" },
              { lemma: "constitute" },
            ],
          },
        },
        answer: "先抓 stitute 这个碎片，再看常见前缀方向。",
      } satisfies ProviderSmokePayload,
      expectedFailure: "rootFamilyView expected root-stitute, received root-wrong",
      caseIndex: 10,
    },
  ])("fails on $label", ({ payload, expectedFailure, caseIndex }) => {
    const caseDef = buildAnswerStyleProviderSmokeCases()[caseIndex];
    const verdict = evaluateAnswerStyleProviderSmoke(caseDef, payload);

    expect(verdict.autoVerdict).toBe("fail");
    expect(verdict.hardFailures).toContain(expectedFailure);
  });

  it("collects rootFamilyView members into grounding lemma checks", () => {
    const caseDef = buildAnswerStyleProviderSmokeCases()[10];
    const verdict = evaluateAnswerStyleProviderSmoke(caseDef, {
      status: 200,
      providerRequestId: "resp_root_123",
      grounding: {
        queryMode: "root_family_summary",
        resolution: "resolved",
        answerStyle: "root_family_summary",
        mainAnswer: [],
        confusionBoundary: [],
        rootFamilyView: {
          id: "root-stitute",
          members: [
            { lemma: "institute" },
            { lemma: "institution" },
            { lemma: "constitute" },
          ],
        },
      },
      answer: "先把 stitute 当成“立起来”的碎片，再区分常见前缀方向。",
    });

    expect(verdict.autoVerdict).toBe("pass");
    expect(verdict.hardFailures).toEqual([]);
  });

  it("fails when no rootFamilyView is expected but the object still exists", () => {
    const noMatchCase = buildAnswerStyleProviderSmokeCases()[12];
    const verdict = evaluateAnswerStyleProviderSmoke(noMatchCase, {
      status: 200,
      providerRequestId: null,
      grounding: {
        queryMode: "root_family_summary",
        resolution: "no_match",
        answerStyle: "root_family_summary",
        rootFamilyView: {
          id: undefined,
          members: [{ lemma: "reconstruct" }],
        },
      },
      answer: "这个组合我先不硬猜，但你可以直接给我完整词形。",
    });

    expect(verdict.autoVerdict).toBe("fail");
    expect(verdict.hardFailures).toContain(
      "rootFamilyView should be absent when expectedRootFamilyViewId is null",
    );
  });

  it("treats status-200 payload error as hard fail", () => {
    const caseDef = buildAnswerStyleProviderSmokeCases()[0];
    const verdict = evaluateAnswerStyleProviderSmoke(caseDef, {
      ...buildResolvedPayload(),
      error: {
        code: "provider_parse_error",
        message: "unexpected payload",
      },
    });

    expect(verdict.autoVerdict).toBe("fail");
    expect(verdict.hardFailures).toContain(
      "status 200 response should not include error payload",
    );
  });

  it("marks a resolved case as manual when the answer is too long", () => {
    const caseDef = buildAnswerStyleProviderSmokeCases()[0];
    const verdict = evaluateAnswerStyleProviderSmoke(
      caseDef,
      buildResolvedPayload({
        answer: "文具是 stationery。".repeat(40),
      }),
    );

    expect(verdict.autoVerdict).toBe("manual");
    expect(verdict.hardFailures).toHaveLength(0);
    expect(
      verdict.manualFlags.some((item) => item.includes("answer may be too long")),
    ).toBe(true);
  });
});

describe("summarizeAnswerStyleProviderSmoke", () => {
  it("aggregates pass manual and fail results", () => {
    const summary = summarizeAnswerStyleProviderSmoke([
      {
        name: "a",
        autoVerdict: "pass",
        hardFailures: [],
        manualChecks: ["check tone"],
        manualFlags: [],
      },
      {
        name: "b",
        autoVerdict: "manual",
        hardFailures: [],
        manualChecks: ["check length"],
        manualFlags: ["too long"],
      },
      {
        name: "c",
        autoVerdict: "fail",
        hardFailures: ["status 429"],
        manualChecks: ["check provider"],
        manualFlags: [],
      },
    ] satisfies ProviderSmokeResult[]);

    expect(summary).toEqual({
      total: 3,
      pass: 1,
      manual: 1,
      fail: 1,
    });
  });
});
