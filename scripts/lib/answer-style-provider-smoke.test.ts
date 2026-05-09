import { describe, expect, it } from "vitest";

import {
  buildAnswerStyleProviderSmokeCases,
  buildStandardLookupProviderSmokeCases,
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
      "root: stitute",
      "root: tempt",
      "root: inter prefix fragment",
      "root: con prefix fragment",
      "root: tion suffix fragment",
      "root: unsupported combination",
      "typo: reqeust correction",
    ]);
    expect(cases).toHaveLength(16);
    expect(cases.map((item) => item.name)).not.toContain("confusion: respect family");
    expect(cases.every((item) => item.manualChecks.length > 0)).toBe(true);
  });

  it("allows expression recall answers to read like complete writing cards", () => {
    const expressionCases = buildAnswerStyleProviderSmokeCases().filter((item) =>
      item.expectedAnswerStyle === "expression_recall"
    );

    expect(expressionCases).toHaveLength(5);
    expect(expressionCases.every((item) => item.maxAnswerChars === 400)).toBe(true);
  });

  it("asks manual reviewers to check full confusion cards without over-compressing", () => {
    const confusionCases = buildAnswerStyleProviderSmokeCases().filter((item) =>
      item.expectedAnswerStyle === "confusion_untangle"
    );

    expect(confusionCases).toHaveLength(4);
    expect(confusionCases.every((item) => item.maxAnswerChars === 450)).toBe(true);
    expect(confusionCases.every((item) =>
      item.manualChecks.includes("检查回答是否列出当前考试范围内召回到的相似词")
    )).toBe(true);
    expect(confusionCases.every((item) =>
      item.manualChecks.includes("检查回答是否给每个列出的词都配中文核心义")
    )).toBe(true);
    expect(confusionCases.every((item) =>
      item.manualChecks.includes("检查回答是否讲清语义、词性、搭配或对象边界，而不是只说字母差异")
    )).toBe(true);
    expect(confusionCases.some((item) =>
      item.manualChecks.includes("检查回答是否把词列表和中文核心义合并到开头，而不是拆成两段")
    )).toBe(false);
  });

  it("asks manual reviewers to check root-family recall summaries", () => {
    const rootCases = buildAnswerStyleProviderSmokeCases().filter((item) =>
      item.expectedAnswerStyle === "root_family_summary"
      && item.expectedResolution === "resolved"
    );

    expect(rootCases).toHaveLength(5);
    expect(
      rootCases
        .filter((item) => ![
          "root: con prefix fragment",
          "root: tion suffix fragment",
        ].includes(item.name))
        .every((item) => item.maxAnswerChars === 420),
    ).toBe(true);
    expect(
      rootCases.find((item) => item.name === "root: con prefix fragment")
        ?.maxAnswerChars,
    ).toBe(1500);
    expect(
      rootCases.find((item) => item.name === "root: tion suffix fragment")
        ?.maxAnswerChars,
    ).toBe(1200);
    expect(rootCases.every((item) =>
      item.manualChecks.includes("检查回答是否把当前范围内召回到的同根/碎片家族成员都列出来")
    )).toBe(true);
    expect(rootCases.every((item) =>
      item.manualChecks.includes("检查回答是否给每个成员都配中文核心义")
    )).toBe(true);
    expect(rootCases.every((item) =>
      item.manualChecks.includes("检查回答是否讲清前缀、后缀或现代义分流，而不是只排背诵优先级")
    )).toBe(true);
    expect(rootCases.some((item) =>
      item.manualChecks.includes("检查回答是否带出前缀方向和优先级")
    )).toBe(false);
    expect(rootCases.find((item) => item.name === "root: con prefix fragment")?.manualChecks).toContain(
      "检查回答是否用表格列出全部成员，而不是只写部分词或用“等”省略",
    );
    expect(rootCases.find((item) => item.name === "root: tion suffix fragment")?.manualChecks).toContain(
      "检查回答是否用表格列出全部成员，而不是只写部分词或用“等”省略",
    );
    expect(
      rootCases.find((item) => item.name === "root: con prefix fragment")
        ?.expectedAnswerIncludes,
    ).toEqual(["| word | 词性 | 核心义 |", "confident", "convenient", "adj."]);
    expect(
      rootCases.find((item) => item.name === "root: con prefix fragment")
        ?.forbiddenAnswerIncludes,
    ).toEqual(["confidant", "例如"]);
    expect(
      rootCases.find((item) => item.name === "root: tion suffix fragment")
        ?.expectedAnswerIncludes,
    ).toEqual(["| word | 词性 | 核心义 |", "condition", "connection", "n."]);
    expect(
      rootCases.find((item) => item.name === "root: tion suffix fragment")
        ?.forbiddenAnswerIncludes,
    ).toEqual(["例如"]);
  });

  it("defines a focused standard-lookup provider smoke set", () => {
    const cases = buildStandardLookupProviderSmokeCases();

    expect(cases.map((item) => item.name)).toEqual([
      "standard: academic lookup",
      "standard: source lemma accent lookup",
      "standard: institute lookup",
      "standard: institution lookup",
      "standard: constitute lookup",
      "standard: substitute lookup",
      "standard: attempt lookup",
      "standard: temptation lookup",
      "standard: effect lookup",
      "standard: access lookup",
      "standard: assess lookup",
      "standard: respect lookup",
      "standard: conform lookup",
      "standard: adjust lookup",
      "standard: stationery lookup",
      "standard: available usage",
      "standard: gain lookup",
      "standard: generate lookup",
      "standard: garage lookup",
      "standard: evidence lookup",
      "standard: significant lookup",
    ]);
    expect(cases).toHaveLength(21);
    expect(cases.every((item) =>
      item.expectedAnswerStyle === "standard_lookup"
      && item.expectedResolution === "resolved"
      && item.expectedComparisonViewId === null
      && item.expectedRootFamilyViewId === null
    )).toBe(true);
    expect(cases.every((item) =>
      item.manualChecks.includes("检查回答是否没有可见标题、例句、范围尾巴或主动扩词")
    )).toBe(true);
    expect(
      cases.find((item) => item.name === "standard: institute lookup")
        ?.forbiddenGroundingIncludes,
    ).toContain("institution");
    expect(
      cases.find((item) => item.name === "standard: respect lookup")
        ?.forbiddenGroundingIncludes,
    ).toEqual(expect.arrayContaining(["respective", "respectful", "respectable"]));
    expect(
      cases.find((item) => item.name === "standard: effect lookup")
        ?.forbiddenGroundingIncludes,
    ).toEqual(expect.arrayContaining(["affect", "impact"]));
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
    const noMatchCase = buildAnswerStyleProviderSmokeCases().find(
      (item) => item.name === "root: unsupported combination",
    );

    expect(noMatchCase).toBeTruthy();

    const verdict = evaluateAnswerStyleProviderSmoke(noMatchCase!, {
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
    const noMatchCase = buildAnswerStyleProviderSmokeCases().find(
      (item) => item.name === "root: unsupported combination",
    );

    expect(noMatchCase).toBeTruthy();

    const verdict = evaluateAnswerStyleProviderSmoke(noMatchCase!, {
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

  it("fails standard lookup smoke when forbidden answer text appears", () => {
    const [caseDef] = buildStandardLookupProviderSmokeCases();
    const verdict = evaluateAnswerStyleProviderSmoke(caseDef, {
      status: 200,
      providerRequestId: "resp_123",
      grounding: {
        queryMode: "fuzzy_recall",
        resolution: "resolved",
        answerStyle: "standard_lookup",
        mainAnswer: [{ lemma: "academic" }],
        comparisonView: null,
        rootFamilyView: null,
      },
      answer: "主答案：academic 是学术的。它也接近 scholarly。",
    });

    expect(verdict.autoVerdict).toBe("fail");
    expect(verdict.hardFailures).toEqual(
      expect.arrayContaining([
        "answer should not include 主答案",
        "answer should not include scholarly",
      ]),
    );
  });

  it("fails provider smoke when required answer text is missing", () => {
    const caseDef = buildAnswerStyleProviderSmokeCases().find(
      (item) => item.name === "root: con prefix fragment",
    );

    expect(caseDef).toBeTruthy();

    const verdict = evaluateAnswerStyleProviderSmoke(caseDef!, {
      status: 200,
      providerRequestId: "resp_123",
      grounding: {
        queryMode: "root_family_summary",
        resolution: "resolved",
        answerStyle: "root_family_summary",
        mainAnswer: [{ lemma: "concept" }],
        rootFamilyView: {
          id: "fragment-prefix-con",
          members: [
            { lemma: "concept" },
            { lemma: "conform" },
            { lemma: "construct" },
            { lemma: "convenient" },
          ],
        },
      },
      answer: "| word | 核心义 |\n| concept | 概念 |",
    });

    expect(verdict.autoVerdict).toBe("fail");
    expect(verdict.hardFailures).toContain("answer missing confident");
    expect(verdict.hardFailures).toContain("answer missing convenient");
  });

  it("fails standard lookup smoke when forbidden grounding appears", () => {
    const caseDef = buildStandardLookupProviderSmokeCases().find(
      (item) => item.name === "standard: institute lookup",
    );

    expect(caseDef).toBeTruthy();

    const verdict = evaluateAnswerStyleProviderSmoke(caseDef!, {
      status: 200,
      providerRequestId: "resp_123",
      grounding: {
        queryMode: "fuzzy_recall",
        resolution: "resolved",
        answerStyle: "standard_lookup",
        mainAnswer: [{ lemma: "institute" }],
        confusionBoundary: [{ lemma: "institution" }],
        comparisonView: null,
        rootFamilyView: null,
      },
      answer: "institute 是设立、制定或机构。",
    });

    expect(verdict.autoVerdict).toBe("fail");
    expect(verdict.hardFailures).toContain(
      "grounding should not include institution",
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
      caseIndex: 9,
    },
  ])("fails on $label", ({ payload, expectedFailure, caseIndex }) => {
    const caseDef = buildAnswerStyleProviderSmokeCases()[caseIndex];
    const verdict = evaluateAnswerStyleProviderSmoke(caseDef, payload);

    expect(verdict.autoVerdict).toBe("fail");
    expect(verdict.hardFailures).toContain(expectedFailure);
  });

  it("collects rootFamilyView members into grounding lemma checks", () => {
    const caseDef = buildAnswerStyleProviderSmokeCases()[9];
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
    const noMatchCase = buildAnswerStyleProviderSmokeCases().find(
      (item) => item.name === "root: unsupported combination",
    );

    expect(noMatchCase).toBeTruthy();

    const verdict = evaluateAnswerStyleProviderSmoke(noMatchCase!, {
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
