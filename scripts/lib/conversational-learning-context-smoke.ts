import type { ExamScopeCode } from "@/features/content/import-types";

export type ConversationContextSmokeTurn = {
  query: string;
  activeExamTarget: ExamScopeCode;
  expectedStatus: number;
  expectedAnswerKind?: "grounded" | "plain";
  expectedGrounding?: "present" | "absent";
  expectedResolvedKind?: "resolved_query" | "resolved_action" | "clarification";
  expectedResolvedQuery?: string;
  expectedAction?: string;
  expectedResolvedActiveExamTarget?: ExamScopeCode;
  expectedContextActiveExamTarget?: ExamScopeCode;
  expectedTargetLemmas?: string[];
  expectedExactTargetLemmas?: string[];
  expectedContextLemmas?: string[];
  expectedExactContextLemmas?: string[];
  expectedProviderRequest?: "absent" | "allowed";
};

export type ConversationContextSmokeCase = {
  name: string;
  turns: ConversationContextSmokeTurn[];
};

export type ConversationContextSmokeObservation = {
  status: number;
  answerKind: "grounded" | "plain" | null;
  hasGrounding: boolean;
  providerRequestId: string | null;
  resolvedKind: "resolved_query" | "resolved_action" | "clarification" | null;
  resolvedQuery: string | null;
  action: string | null;
  resolvedActiveExamTarget: ExamScopeCode | null;
  contextActiveExamTarget: ExamScopeCode | null;
  targetLemmas: string[];
  contextLemmas: string[];
};

export type ConversationContextSmokeTurnResult = {
  turn: number;
  query: string;
  verdict: "pass" | "fail";
  failures: string[];
};

export type ConversationContextSmokeResult = {
  name: string;
  verdict: "pass" | "fail";
  failures: string[];
  turnResults: ConversationContextSmokeTurnResult[];
};

export type ConversationContextSmokeSummary = {
  total: number;
  pass: number;
  fail: number;
};

export type ConversationContextSmokeArgs = {
  baseUrl: string;
  label: string;
};

export function parseConversationContextSmokeArgs(
  args: string[],
): ConversationContextSmokeArgs {
  let baseUrl = "http://127.0.0.1:8000";
  let label = "fastapi-direct";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextArg = args[index + 1];

    if (arg === "--base-url" && nextArg) {
      baseUrl = nextArg;
      index += 1;
      continue;
    }

    if (arg === "--label" && nextArg) {
      label = nextArg;
      index += 1;
    }
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    label,
  };
}

export function buildConversationalLearningContextSmokeCases():
  ConversationContextSmokeCase[] {
  return [
    {
      name: "access compare then ordinal meaning",
      turns: [
        {
          query: "access assess excess 怎么区分",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "grounded",
          expectedGrounding: "present",
          expectedContextLemmas: ["access", "assess", "excess"],
          expectedProviderRequest: "allowed",
        },
        {
          query: "第二个是什么意思",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "grounded",
          expectedGrounding: "present",
          expectedResolvedKind: "resolved_query",
          expectedResolvedQuery: "assess 是什么意思",
          expectedTargetLemmas: ["assess"],
          expectedProviderRequest: "absent",
        },
      ],
    },
    {
      name: "access compare then scope switch",
      turns: [
        {
          query: "access assess excess 怎么区分",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "grounded",
          expectedGrounding: "present",
          expectedContextLemmas: ["access", "assess", "excess"],
          expectedProviderRequest: "allowed",
        },
        {
          query: "换成考研范围",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "grounded",
          expectedGrounding: "present",
          expectedResolvedKind: "resolved_query",
          expectedResolvedQuery: "access assess excess 怎么区分",
          expectedResolvedActiveExamTarget: "postgrad",
          expectedContextActiveExamTarget: "postgrad",
          expectedTargetLemmas: ["access", "assess", "excess"],
          expectedProviderRequest: "allowed",
        },
      ],
    },
    {
      name: "access compare then group memory",
      turns: [
        {
          query: "access assess excess 怎么区分",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "grounded",
          expectedGrounding: "present",
          expectedContextLemmas: ["access", "assess", "excess"],
          expectedProviderRequest: "allowed",
        },
        {
          query: "这组怎么背",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "plain",
          expectedGrounding: "absent",
          expectedResolvedKind: "resolved_action",
          expectedAction: "study_guidance",
          expectedTargetLemmas: ["access", "assess", "excess"],
          expectedProviderRequest: "allowed",
        },
      ],
    },
    {
      name: "access compare then context choice",
      turns: [
        {
          query: "access assess excess 怎么区分",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "grounded",
          expectedGrounding: "present",
          expectedContextLemmas: ["access", "assess", "excess"],
          expectedProviderRequest: "allowed",
        },
        {
          query: "哪个更适合考试表达",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "plain",
          expectedGrounding: "absent",
          expectedResolvedKind: "resolved_action",
          expectedAction: "context_choice",
          expectedExactTargetLemmas: ["access", "assess", "excess"],
          expectedProviderRequest: "allowed",
        },
      ],
    },
    {
      name: "access compare then natural group usage",
      turns: [
        {
          query: "access assess excess 怎么区分",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "grounded",
          expectedGrounding: "present",
          expectedContextLemmas: ["access", "assess", "excess"],
          expectedProviderRequest: "allowed",
        },
        {
          query: "这几个具体怎么用",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "plain",
          expectedGrounding: "absent",
          expectedResolvedKind: "resolved_action",
          expectedAction: "context_continuation",
          expectedExactTargetLemmas: ["access", "assess", "excess"],
          expectedProviderRequest: "allowed",
        },
      ],
    },
    {
      name: "evaluate lookalikes then ordinal usage",
      turns: [
        {
          query: "给我几个跟 evaluate 易混的单词",
          activeExamTarget: "postgrad",
          expectedStatus: 200,
          expectedAnswerKind: "grounded",
          expectedGrounding: "present",
          expectedContextLemmas: ["evaluate", "evacuate"],
          expectedProviderRequest: "absent",
        },
        {
          query: "第二个怎么用",
          activeExamTarget: "postgrad",
          expectedStatus: 200,
          expectedAnswerKind: "grounded",
          expectedGrounding: "present",
          expectedResolvedKind: "resolved_query",
          expectedResolvedQuery: "evacuate 怎么用",
          expectedTargetLemmas: ["evacuate"],
          expectedProviderRequest: "allowed",
        },
      ],
    },
    {
      name: "evaluate lookalikes then show more",
      turns: [
        {
          query: "给我几个跟 evaluate 易混的单词",
          activeExamTarget: "postgrad",
          expectedStatus: 200,
          expectedAnswerKind: "grounded",
          expectedGrounding: "present",
          expectedContextLemmas: ["evaluate", "evacuate"],
          expectedProviderRequest: "absent",
        },
        {
          query: "还有吗",
          activeExamTarget: "postgrad",
          expectedStatus: 200,
          expectedAnswerKind: "plain",
          expectedGrounding: "absent",
          expectedResolvedKind: "resolved_action",
          expectedAction: "show_more",
          expectedTargetLemmas: ["salute", "value"],
          expectedProviderRequest: "absent",
        },
      ],
    },
    {
      name: "response word family then collect group",
      turns: [
        {
          query: "response 的派生词",
          activeExamTarget: "postgrad",
          expectedStatus: 200,
          expectedAnswerKind: "grounded",
          expectedGrounding: "present",
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
          expectedProviderRequest: "absent",
        },
        {
          query: "把这组都收藏",
          activeExamTarget: "postgrad",
          expectedStatus: 200,
          expectedAnswerKind: "plain",
          expectedGrounding: "absent",
          expectedResolvedKind: "resolved_action",
          expectedAction: "collect_group",
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
          expectedProviderRequest: "absent",
        },
      ],
    },
    // Deferred by design: "遵循的英文是什么" -> "还有更适合作文的吗"
    // needs semantic style follow-up support that V1 does not safely resolve yet.
    {
      name: "capability fallback answers without grounding",
      turns: [
        {
          query: "你能干嘛",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "plain",
          expectedGrounding: "absent",
          expectedProviderRequest: "absent",
        },
      ],
    },
    {
      name: "learning mood fallback answers without grounding",
      turns: [
        {
          query: "我今天不想背词",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "plain",
          expectedGrounding: "absent",
          expectedProviderRequest: "absent",
        },
      ],
    },
    {
      name: "learning adjacent no match recovers without grounding",
      turns: [
        {
          query: "how to learn English fast",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "plain",
          expectedGrounding: "absent",
          expectedProviderRequest: "allowed",
        },
      ],
    },
    {
      name: "no context context choice asks for clarification",
      turns: [
        {
          query: "哪个更正式",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "plain",
          expectedGrounding: "absent",
          expectedResolvedKind: "clarification",
          expectedProviderRequest: "absent",
        },
      ],
    },
    {
      name: "no context ordinal asks for clarification",
      turns: [
        {
          query: "第二个是什么意思",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "plain",
          expectedGrounding: "absent",
          expectedResolvedKind: "clarification",
          expectedProviderRequest: "absent",
        },
      ],
    },
  ];
}

function formatValue(value: unknown) {
  return value === null || value === undefined ? String(value) : String(value);
}

function addIfMismatch<T>(
  failures: string[],
  label: string,
  actual: T,
  expected: T,
) {
  if (actual !== expected) {
    failures.push(
      `${label} expected ${formatValue(expected)}, received ${formatValue(actual)}`,
    );
  }
}

function missingLemmas(expected: string[], actual: string[]) {
  return expected.filter((lemma) => !actual.includes(lemma));
}

function formatLemmaList(lemmas: string[]) {
  return lemmas.length > 0 ? lemmas.join(", ") : "(none)";
}

function addIfLemmaListMismatch(
  failures: string[],
  label: string,
  actual: string[],
  expected: string[],
) {
  if (
    actual.length !== expected.length ||
    actual.some((lemma, index) => lemma !== expected[index])
  ) {
    failures.push(
      `${label} expected exactly ${formatLemmaList(expected)}, received ${formatLemmaList(actual)}`,
    );
  }
}

function evaluateTurn(
  turnDef: ConversationContextSmokeTurn,
  observation: ConversationContextSmokeObservation | undefined,
  turn: number,
): ConversationContextSmokeTurnResult {
  const failures: string[] = [];
  const prefix = `turn ${turn}`;

  if (!observation) {
    return {
      turn,
      query: turnDef.query,
      verdict: "fail",
      failures: [`${prefix} missing observation`],
    };
  }

  addIfMismatch(
    failures,
    `${prefix} status`,
    observation.status,
    turnDef.expectedStatus,
  );

  if (turnDef.expectedAnswerKind) {
    addIfMismatch(
      failures,
      `${prefix} answerKind`,
      observation.answerKind,
      turnDef.expectedAnswerKind,
    );
  }

  if (turnDef.expectedGrounding === "present" && !observation.hasGrounding) {
    failures.push(`${prefix} grounding expected present`);
  }

  if (turnDef.expectedGrounding === "absent" && observation.hasGrounding) {
    failures.push(`${prefix} grounding expected absent`);
  }

  if (turnDef.expectedResolvedKind) {
    addIfMismatch(
      failures,
      `${prefix} resolvedKind`,
      observation.resolvedKind,
      turnDef.expectedResolvedKind,
    );
  }

  if (turnDef.expectedResolvedQuery) {
    addIfMismatch(
      failures,
      `${prefix} resolvedQuery`,
      observation.resolvedQuery,
      turnDef.expectedResolvedQuery,
    );
  }

  if (turnDef.expectedAction) {
    addIfMismatch(
      failures,
      `${prefix} action`,
      observation.action,
      turnDef.expectedAction,
    );
  }

  if (turnDef.expectedResolvedActiveExamTarget) {
    addIfMismatch(
      failures,
      `${prefix} resolvedActiveExamTarget`,
      observation.resolvedActiveExamTarget,
      turnDef.expectedResolvedActiveExamTarget,
    );
  }

  if (turnDef.expectedContextActiveExamTarget) {
    addIfMismatch(
      failures,
      `${prefix} contextActiveExamTarget`,
      observation.contextActiveExamTarget,
      turnDef.expectedContextActiveExamTarget,
    );
  }

  for (const lemma of missingLemmas(
    turnDef.expectedContextLemmas ?? [],
    observation.contextLemmas,
  )) {
    failures.push(`${prefix} context missing ${lemma}`);
  }

  if (turnDef.expectedExactContextLemmas) {
    addIfLemmaListMismatch(
      failures,
      `${prefix} context`,
      observation.contextLemmas,
      turnDef.expectedExactContextLemmas,
    );
  }

  for (const lemma of missingLemmas(
    turnDef.expectedTargetLemmas ?? [],
    observation.targetLemmas,
  )) {
    failures.push(`${prefix} target missing ${lemma}`);
  }

  if (turnDef.expectedExactTargetLemmas) {
    addIfLemmaListMismatch(
      failures,
      `${prefix} target`,
      observation.targetLemmas,
      turnDef.expectedExactTargetLemmas,
    );
  }

  if (
    turnDef.expectedProviderRequest === "absent"
    && observation.providerRequestId
  ) {
    failures.push(`${prefix} providerRequestId expected absent`);
  }

  return {
    turn,
    query: turnDef.query,
    verdict: failures.length === 0 ? "pass" : "fail",
    failures,
  };
}

export function evaluateConversationContextSmoke(
  caseDef: ConversationContextSmokeCase,
  observations: ConversationContextSmokeObservation[],
): ConversationContextSmokeResult {
  const turnResults = caseDef.turns.map((turnDef, index) =>
    evaluateTurn(turnDef, observations[index], index + 1),
  );
  const failures = turnResults.flatMap((result) => result.failures);

  if (observations.length > caseDef.turns.length) {
    failures.push(
      `received ${observations.length - caseDef.turns.length} unexpected observation(s)`,
    );
  }

  return {
    name: caseDef.name,
    verdict: failures.length === 0 ? "pass" : "fail",
    failures,
    turnResults,
  };
}

export function summarizeConversationContextSmoke(
  results: ConversationContextSmokeResult[],
): ConversationContextSmokeSummary {
  return {
    total: results.length,
    pass: results.filter((item) => item.verdict === "pass").length,
    fail: results.filter((item) => item.verdict === "fail").length,
  };
}
