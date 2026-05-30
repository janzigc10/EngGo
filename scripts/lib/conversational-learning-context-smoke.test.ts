import { describe, expect, it } from "vitest";

import {
  buildConversationalLearningContextSmokeCases,
  evaluateConversationContextSmoke,
  parseConversationContextSmokeArgs,
  summarizeConversationContextSmoke,
  type ConversationContextSmokeCase,
  type ConversationContextSmokeObservation,
} from "./conversational-learning-context-smoke";

const accessCompareCase: ConversationContextSmokeCase = {
  name: "access compare then ordinal meaning",
  turns: [
    {
      query: "access assess excess 怎么区分",
      activeExamTarget: "cet6",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedContextLemmas: ["access", "assess", "excess"],
      expectedProviderRequest: "absent",
    },
    {
      query: "第二个是什么意思",
      activeExamTarget: "cet6",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedResolvedKind: "resolved_query",
      expectedResolvedQuery: "assess 是什么意思",
      expectedTargetLemmas: ["assess"],
      expectedProviderRequest: "absent",
    },
  ],
};

function observation(
  overrides: Partial<ConversationContextSmokeObservation> = {},
): ConversationContextSmokeObservation {
  return {
    status: 200,
    answerKind: "grounded",
    hasGrounding: true,
    providerRequestId: null,
    resolvedKind: null,
    resolvedQuery: null,
    action: null,
    resolvedActiveExamTarget: null,
    contextActiveExamTarget: null,
    targetLemmas: [],
    contextLemmas: ["access", "assess", "excess"],
    ...overrides,
  };
}

describe("conversational learning-context smoke", () => {
  it("defines the V3 stateful smoke matrix with bounded fallbacks", () => {
    expect(buildConversationalLearningContextSmokeCases()).toEqual([
      expect.objectContaining({
        name: "access compare then ordinal meaning",
        turns: [
          expect.objectContaining({
            query: "access assess excess 怎么区分",
            expectedContextLemmas: ["access", "assess", "excess"],
          }),
          expect.objectContaining({
            query: "第二个是什么意思",
            expectedResolvedKind: "resolved_query",
            expectedResolvedQuery: "assess 是什么意思",
            expectedTargetLemmas: ["assess"],
          }),
        ],
      }),
      expect.objectContaining({
        name: "access compare then scope switch",
        turns: [
          expect.objectContaining({
            query: "access assess excess 怎么区分",
          }),
          expect.objectContaining({
            query: "换成考研范围",
            expectedResolvedKind: "resolved_query",
            expectedResolvedQuery: "access assess excess 怎么区分",
            expectedResolvedActiveExamTarget: "postgrad",
            expectedContextActiveExamTarget: "postgrad",
            expectedTargetLemmas: ["access", "assess", "excess"],
          }),
        ],
      }),
      expect.objectContaining({
        name: "access compare then group memory",
        turns: [
          expect.objectContaining({
            query: "access assess excess 怎么区分",
          }),
          expect.objectContaining({
            query: "这组怎么背",
            expectedResolvedKind: "resolved_action",
            expectedAction: "study_guidance",
            expectedTargetLemmas: ["access", "assess", "excess"],
          }),
        ],
      }),
      expect.objectContaining({
        name: "access compare then context choice",
        turns: [
          expect.objectContaining({
            query: "access assess excess 怎么区分",
          }),
          expect.objectContaining({
            query: "哪个更适合考试表达",
            expectedAnswerKind: "plain",
            expectedGrounding: "absent",
            expectedResolvedKind: "resolved_action",
            expectedAction: "context_choice",
            expectedExactTargetLemmas: ["access", "assess", "excess"],
            expectedProviderRequest: "allowed",
          }),
        ],
      }),
      expect.objectContaining({
        name: "evaluate lookalikes then ordinal usage",
        turns: [
          expect.objectContaining({
            query: "给我几个跟 evaluate 易混的单词",
            expectedContextLemmas: ["evaluate", "evacuate"],
          }),
          expect.objectContaining({
            query: "第二个怎么用",
            expectedResolvedKind: "resolved_query",
            expectedResolvedQuery: "evacuate 怎么用",
            expectedTargetLemmas: ["evacuate"],
          }),
        ],
      }),
      expect.objectContaining({
        name: "evaluate lookalikes then show more",
        turns: [
          expect.objectContaining({
            query: "给我几个跟 evaluate 易混的单词",
            expectedContextLemmas: ["evaluate", "evacuate"],
          }),
          expect.objectContaining({
            query: "还有吗",
            expectedResolvedKind: "resolved_action",
            expectedAction: "show_more",
            expectedTargetLemmas: ["salute", "value"],
          }),
        ],
      }),
      expect.objectContaining({
        name: "response word family then collect group",
        turns: [
          expect.objectContaining({
            query: "response 的派生词",
            expectedContextLemmas: ["respond", "response", "responsive", "responsible"],
            expectedExactContextLemmas: [
              "response",
              "responsive",
              "respond",
              "responsible",
              "respondent",
              "responsiveness",
              "responsibility",
              "respondents",
            ],
          }),
          expect.objectContaining({
            query: "把这组都收藏",
            expectedAnswerKind: "plain",
            expectedResolvedKind: "resolved_action",
            expectedAction: "collect_group",
            expectedProviderRequest: "absent",
            expectedTargetLemmas: ["respond", "response", "responsive", "responsible"],
            expectedExactTargetLemmas: [
              "response",
              "responsive",
              "respond",
              "responsible",
              "respondent",
              "responsiveness",
              "responsibility",
              "respondents",
            ],
          }),
        ],
      }),
      expect.objectContaining({
        name: "capability fallback answers without grounding",
        turns: [
          expect.objectContaining({
            query: "你能干嘛",
            expectedAnswerKind: "plain",
            expectedGrounding: "absent",
            expectedProviderRequest: "absent",
          }),
        ],
      }),
      expect.objectContaining({
        name: "learning mood fallback answers without grounding",
        turns: [
          expect.objectContaining({
            query: "我今天不想背词",
            expectedAnswerKind: "plain",
            expectedGrounding: "absent",
            expectedProviderRequest: "absent",
          }),
        ],
      }),
      expect.objectContaining({
        name: "no context context choice asks for clarification",
        turns: [
          expect.objectContaining({
            query: "哪个更正式",
            expectedAnswerKind: "plain",
            expectedGrounding: "absent",
            expectedResolvedKind: "clarification",
            expectedProviderRequest: "absent",
          }),
        ],
      }),
      expect.objectContaining({
        name: "no context ordinal asks for clarification",
        turns: [
          expect.objectContaining({
            query: "第二个是什么意思",
            expectedAnswerKind: "plain",
            expectedGrounding: "absent",
            expectedResolvedKind: "clarification",
            expectedProviderRequest: "absent",
          }),
        ],
      }),
    ]);
  });

  it("catches missing context after the first turn", () => {
    const result = evaluateConversationContextSmoke(accessCompareCase, [
      observation({ contextLemmas: [] }),
      observation({
        resolvedKind: "resolved_query",
        resolvedQuery: "assess 是什么意思",
        targetLemmas: ["assess"],
        contextLemmas: ["assess"],
      }),
    ]);

    expect(result.verdict).toBe("fail");
    expect(result.failures).toEqual([
      "turn 1 context missing access",
      "turn 1 context missing assess",
      "turn 1 context missing excess",
    ]);
  });

  it("catches a wrong resolved query on the second turn", () => {
    const result = evaluateConversationContextSmoke(accessCompareCase, [
      observation(),
      observation({
        resolvedKind: "resolved_query",
        resolvedQuery: "excess 是什么意思",
        targetLemmas: ["assess"],
        contextLemmas: ["assess"],
      }),
    ]);

    expect(result.verdict).toBe("fail");
    expect(result.failures).toEqual([
      "turn 2 resolvedQuery expected assess 是什么意思, received excess 是什么意思",
    ]);
  });

  it("catches a scope switch that does not change the active target", () => {
    const result = evaluateConversationContextSmoke(
      {
        name: "scope switch",
        turns: [
          {
            query: "换成考研范围",
            activeExamTarget: "cet6",
            expectedStatus: 200,
            expectedResolvedKind: "resolved_query",
            expectedResolvedActiveExamTarget: "postgrad",
            expectedContextActiveExamTarget: "postgrad",
          },
        ],
      },
      [
        observation({
          resolvedKind: "resolved_query",
          resolvedActiveExamTarget: "cet6",
          contextActiveExamTarget: "cet6",
        }),
      ],
    );

    expect(result.verdict).toBe("fail");
    expect(result.failures).toEqual([
      "turn 1 resolvedActiveExamTarget expected postgrad, received cet6",
      "turn 1 contextActiveExamTarget expected postgrad, received cet6",
    ]);
  });

  it("catches an accidental provider call for collection actions", () => {
    const result = evaluateConversationContextSmoke(
      {
        name: "collect group",
        turns: [
          {
            query: "response 的派生词",
            activeExamTarget: "postgrad",
            expectedStatus: 200,
            expectedAnswerKind: "grounded",
            expectedContextLemmas: ["response"],
          },
          {
            query: "把这组都收藏",
            activeExamTarget: "postgrad",
            expectedStatus: 200,
            expectedAnswerKind: "plain",
            expectedResolvedKind: "resolved_action",
            expectedAction: "collect_group",
            expectedTargetLemmas: ["response"],
            expectedProviderRequest: "absent",
          },
        ],
      },
      [
        observation({ contextLemmas: ["response"] }),
        observation({
          answerKind: "plain",
          hasGrounding: false,
          providerRequestId: "provider_req_collect",
          resolvedKind: "resolved_action",
          action: "collect_group",
          targetLemmas: ["response"],
          contextLemmas: [],
        }),
      ],
    );

    expect(result.verdict).toBe("fail");
    expect(result.failures).toEqual([
      "turn 2 providerRequestId expected absent",
    ]);
  });

  it("catches extra target lemmas when a turn requires the exact target set", () => {
    const result = evaluateConversationContextSmoke(
      {
        name: "strict collect group",
        turns: [
          {
            query: "response 的派生词",
            activeExamTarget: "postgrad",
            expectedStatus: 200,
            expectedAnswerKind: "grounded",
            expectedExactContextLemmas: ["response", "responsive"],
          },
          {
            query: "把这组都收藏",
            activeExamTarget: "postgrad",
            expectedStatus: 200,
            expectedAnswerKind: "plain",
            expectedResolvedKind: "resolved_action",
            expectedAction: "collect_group",
            expectedExactTargetLemmas: ["response", "responsive"],
            expectedProviderRequest: "absent",
          },
        ],
      },
      [
        observation({ contextLemmas: ["response", "responsive", "correspond"] }),
        observation({
          answerKind: "plain",
          hasGrounding: false,
          resolvedKind: "resolved_action",
          action: "collect_group",
          targetLemmas: ["response", "responsive", "correspond"],
          contextLemmas: [],
        }),
      ],
    );

    expect(result.verdict).toBe("fail");
    expect(result.failures).toEqual([
      "turn 1 context expected exactly response, responsive, received response, responsive, correspond",
      "turn 2 target expected exactly response, responsive, received response, responsive, correspond",
    ]);
  });

  it("passes a valid multi-turn resolved query observation", () => {
    const result = evaluateConversationContextSmoke(accessCompareCase, [
      observation(),
      observation({
        resolvedKind: "resolved_query",
        resolvedQuery: "assess 是什么意思",
        targetLemmas: ["assess"],
        contextLemmas: ["assess"],
      }),
    ]);

    expect(result).toEqual({
      name: "access compare then ordinal meaning",
      verdict: "pass",
      failures: [],
      turnResults: [
        {
          turn: 1,
          query: "access assess excess 怎么区分",
          verdict: "pass",
          failures: [],
        },
        {
          turn: 2,
          query: "第二个是什么意思",
          verdict: "pass",
          failures: [],
        },
      ],
    });
  });

  it("summarizes stateful smoke results", () => {
    expect(
      summarizeConversationContextSmoke([
        {
          name: "left",
          verdict: "pass",
          failures: [],
          turnResults: [],
        },
        {
          name: "right",
          verdict: "fail",
          failures: ["turn 1 status expected 200, received 500"],
          turnResults: [],
        },
      ]),
    ).toEqual({
      total: 2,
      pass: 1,
      fail: 1,
    });
  });

  it("parses runner args with FastAPI direct defaults", () => {
    expect(parseConversationContextSmokeArgs([])).toEqual({
      baseUrl: "http://127.0.0.1:8000",
      label: "fastapi-direct",
    });

    expect(
      parseConversationContextSmokeArgs([
        "--base-url",
        "http://127.0.0.1:3000/",
        "--label",
        "next-proxy",
      ]),
    ).toEqual({
      baseUrl: "http://127.0.0.1:3000",
      label: "next-proxy",
    });
  });
});
