import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatAnswerStyleProviderSmokeLine,
  resolveRequestTimeoutMs,
  runAnswerStyleProviderSmoke,
  type ChatSmokeTransport,
} from "./run-answer-style-provider-smoke";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("formatAnswerStyleProviderSmokeLine", () => {
  it("prints a concise one-line case summary", () => {
    const line = formatAnswerStyleProviderSmokeLine({
      name: "confusion: stationery choice",
      queryMode: "direct_compare",
      resolution: "resolved",
      answerStyle: "confusion_untangle",
      providerRequestId: "resp_123",
      elapsedMs: 187,
      answerChars: 23,
      maxAnswerChars: 220,
      groundingSummary: "stationary/stationery",
      answerPreview: "先问一句：你这里说的是文具还是静止不动？",
      autoVerdict: "pass",
      hardFailures: [],
      manualChecks: [],
      manualFlags: [],
      errorMessage: null,
    });

    expect(line).toContain("[PASS]");
    expect(line).toContain("confusion: stationery choice");
    expect(line).toContain("direct_compare/resolved/confusion_untangle");
    expect(line).toContain("provider=resp_123");
    expect(line).toContain("elapsed=187ms");
    expect(line).toContain("chars=23/220");
    expect(line).toContain("grounding=stationary/stationery");
    expect(line).toContain("answer=先问一句：你这里说的是文具还是静止不动？");
  });
});

describe("runAnswerStyleProviderSmoke", () => {
  it("uses a DeepSeek-safe default timeout and allows an env override", () => {
    vi.stubEnv("ENGGO_PROVIDER_SMOKE_TIMEOUT_MS", undefined);

    expect(resolveRequestTimeoutMs()).toBe(45_000);

    vi.stubEnv("ENGGO_PROVIDER_SMOKE_TIMEOUT_MS", "90000");

    expect(resolveRequestTimeoutMs()).toBe(90_000);
  });

  it("ignores invalid timeout env values", () => {
    vi.stubEnv("ENGGO_PROVIDER_SMOKE_TIMEOUT_MS", "not-a-number");

    expect(resolveRequestTimeoutMs()).toBe(45_000);

    vi.stubEnv("ENGGO_PROVIDER_SMOKE_TIMEOUT_MS", "0");

    expect(resolveRequestTimeoutMs()).toBe(45_000);
  });

  it("retries 429 conservatively and keeps requests strictly serial", async () => {
    const events: string[] = [];
    let inFlight = 0;
    let currentTime = 0;
    const sleep = vi.fn(async (ms: number) => {
      currentTime += ms;
    });

    const transport: ChatSmokeTransport = vi.fn(async ({ item, attempt }) => {
      events.push(`start:${item.name}:${attempt}`);
      inFlight += 1;
      expect(inFlight).toBe(1);

      if (item.name === "confusion: stationery choice" && attempt < 2) {
        inFlight -= 1;
        events.push(`end:${item.name}:${attempt}:429`);

        return {
          status: 429,
          payload: {
            error: {
              code: "rate_limit",
              message: "slow down",
            },
            requestId: `req_${attempt}`,
            providerRequestId: null,
          },
        };
      }

      inFlight -= 1;
      events.push(`end:${item.name}:${attempt}:200`);

      if (item.name === "confusion: stationery choice") {
        return {
          status: 200,
          payload: {
            answer: "先问一句：你这里说的是文具还是静止不动？文具用 stationery。",
            requestId: "req_success_1",
            providerRequestId: "resp_stationery",
            grounding: {
              queryMode: "direct_compare",
              resolution: "resolved",
              answerStyle: "confusion_untangle",
              mainAnswer: [{ lemma: "stationery" }],
              confusionBoundary: [{ lemma: "stationary" }],
            },
          },
        };
      }

      return {
        status: 200,
        payload: {
          answer: "这个组合我先不硬猜。你给我完整词形，我再帮你拆。",
          requestId: "req_success_2",
          providerRequestId: null,
          grounding: {
            queryMode: "root_family_summary",
            resolution: "no_match",
            answerStyle: "root_family_summary",
          },
        },
      };
    });

    const result = await runAnswerStyleProviderSmoke({
      cases: [
        {
          name: "confusion: stationery choice",
          query: "stationary 和 stationery 哪个是文具",
          activeExamTarget: "cet4",
          expectedQueryMode: "direct_compare",
          expectedResolution: "resolved",
          expectedAnswerStyle: "confusion_untangle",
          expectedGroundingIncludes: ["stationary", "stationery"],
          maxAnswerChars: 220,
          manualChecks: ["check entrance"],
        },
        {
          name: "root: unsupported combination",
          query: "re+con 的词根有什么词",
          activeExamTarget: "cet6",
          expectedQueryMode: "root_family_summary",
          expectedResolution: "no_match",
          expectedAnswerStyle: "root_family_summary",
          expectedRootFamilyViewId: null,
          maxAnswerChars: 220,
          manualChecks: ["check caution"],
        },
      ],
      requestChat: transport,
      sleep,
      now: () => {
        currentTime += 50;
        return currentTime;
      },
    });

    expect(transport).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 1500);
    expect(sleep).toHaveBeenNthCalledWith(2, 3000);
    expect(result.results).toHaveLength(2);
    expect(result.summary).toMatchObject({
      total: 2,
      pass: 2,
      manual: 0,
      fail: 0,
      resolved: 1,
      no_match: 1,
      providerCalled: 1,
      providerSkipped: 1,
      avgElapsedMs: 2300,
      maxElapsedMs: 4550,
      nextStep: expect.any(String),
    });
    expect(result.summary.answerLengthByStyle).toMatchObject({
      confusion_untangle: {
        count: 1,
        warnings: 0,
      },
      root_family_summary: {
        count: 1,
        warnings: 0,
      },
    });
    expect(result.results[0]?.providerRequestId).toBe("resp_stationery");
    expect(result.results[1]?.providerRequestId).toBeNull();
    expect(events).toEqual([
      "start:confusion: stationery choice:0",
      "end:confusion: stationery choice:0:429",
      "start:confusion: stationery choice:1",
      "end:confusion: stationery choice:1:429",
      "start:confusion: stationery choice:2",
      "end:confusion: stationery choice:2:200",
      "start:root: unsupported combination:0",
      "end:root: unsupported combination:0:200",
    ]);
  });

  it("times out a stuck request and records a fail result instead of hanging", async () => {
    const transport: ChatSmokeTransport = vi.fn(
      async () => new Promise(() => {}),
    );

    const result = await runAnswerStyleProviderSmoke({
      cases: [
        {
          name: "confusion: stationery choice",
          query: "stationary 和 stationery 哪个是文具",
          activeExamTarget: "cet4",
          expectedQueryMode: "direct_compare",
          expectedResolution: "resolved",
          expectedAnswerStyle: "confusion_untangle",
          expectedGroundingIncludes: ["stationary", "stationery"],
          maxAnswerChars: 220,
          manualChecks: ["check entrance"],
        },
      ],
      requestChat: transport,
      timeoutMs: 10,
    });

    expect(transport).toHaveBeenCalledTimes(1);
    expect(result.summary).toMatchObject({
      total: 1,
      pass: 0,
      manual: 0,
      fail: 1,
      providerCalled: 0,
      providerSkipped: 0,
      providerUnknown: 1,
      answerLengthByStyle: {
        missing: {
          count: 1,
          min: 0,
          max: 0,
          average: 0,
          p50: 0,
          p90: 0,
          warnings: 0,
        },
      },
    });
    expect(result.results[0]?.autoVerdict).toBe("fail");
    expect(result.results[0]?.errorMessage).toContain("timed out");
    expect(result.results[0]?.hardFailures).toEqual(
      expect.arrayContaining([
        "status expected 200, received 0",
        "queryMode expected direct_compare, received missing",
      ]),
    );
  });

  it("counts provider failures without providerRequestId as called instead of skipped", async () => {
    const transport: ChatSmokeTransport = vi.fn(async () => ({
      status: 500,
      payload: {
        error: {
          code: "chat_generation_failed",
          message: "provider crashed",
        },
        requestId: "req_failed",
        providerRequestId: null,
        grounding: {
          queryMode: "direct_compare",
          resolution: "resolved",
          answerStyle: "confusion_untangle",
          mainAnswer: [{ lemma: "stationery" }],
          confusionBoundary: [{ lemma: "stationary" }],
        },
      },
    }));

    const result = await runAnswerStyleProviderSmoke({
      cases: [
        {
          name: "confusion: stationery choice",
          query: "stationary 和 stationery 哪个是文具",
          activeExamTarget: "cet4",
          expectedQueryMode: "direct_compare",
          expectedResolution: "resolved",
          expectedAnswerStyle: "confusion_untangle",
          expectedGroundingIncludes: ["stationary", "stationery"],
          maxAnswerChars: 220,
          manualChecks: ["check entrance"],
        },
      ],
      requestChat: transport,
    });

    expect(result.summary).toMatchObject({
      total: 1,
      fail: 1,
      providerCalled: 1,
      providerSkipped: 0,
      providerUnknown: 0,
    });
  });

  it("summarizes answer length distribution by answer style", async () => {
    const transport: ChatSmokeTransport = vi.fn(async ({ item }) => ({
      status: 200,
      payload: {
        answer: item.name === "expression: short" ? "short" : "this answer is long",
        requestId: `req_${item.name}`,
        providerRequestId: `resp_${item.name}`,
        grounding: {
          queryMode: "meaning_lookup",
          resolution: "resolved",
          answerStyle: "expression_recall",
          comparisonView: {
            id: "recommend-suggest-propose",
            labels: ["meaning_near"],
            purposes: ["expression_recall"],
            members: [
              { lemma: "recommend" },
              { lemma: "suggest" },
              { lemma: "propose" },
            ],
          },
        },
      },
    }));

    const result = await runAnswerStyleProviderSmoke({
      cases: [
        {
          name: "expression: short",
          query: "建议怎么说",
          activeExamTarget: "cet6",
          expectedQueryMode: "meaning_lookup",
          expectedResolution: "resolved",
          expectedAnswerStyle: "expression_recall",
          expectedComparisonViewId: "recommend-suggest-propose",
          expectedGroundingIncludes: ["recommend", "suggest", "propose"],
          maxAnswerChars: 12,
          manualChecks: ["check expression structure"],
        },
        {
          name: "expression: long",
          query: "建议怎么说",
          activeExamTarget: "cet6",
          expectedQueryMode: "meaning_lookup",
          expectedResolution: "resolved",
          expectedAnswerStyle: "expression_recall",
          expectedComparisonViewId: "recommend-suggest-propose",
          expectedGroundingIncludes: ["recommend", "suggest", "propose"],
          maxAnswerChars: 12,
          manualChecks: ["check expression structure"],
        },
      ],
      requestChat: transport,
    });

    expect(result.results.map((item) => item.answerChars)).toEqual([5, 19]);
    expect(result.summary).toMatchObject({
      total: 2,
      pass: 1,
      manual: 1,
      fail: 0,
      answerLengthByStyle: {
        expression_recall: {
          count: 2,
          min: 5,
          max: 19,
          average: 12,
          p50: 5,
          p90: 19,
          warnings: 1,
        },
      },
    });
  });
});
