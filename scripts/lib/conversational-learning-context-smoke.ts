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
  expectedTargetLemmas?: string[];
  expectedContextLemmas?: string[];
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
          expectedProviderRequest: "absent",
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
      name: "access compare then group memory",
      turns: [
        {
          query: "access assess excess 怎么区分",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "grounded",
          expectedGrounding: "present",
          expectedContextLemmas: ["access", "assess", "excess"],
          expectedProviderRequest: "absent",
        },
        {
          query: "这组怎么背",
          activeExamTarget: "cet6",
          expectedStatus: 200,
          expectedAnswerKind: "grounded",
          expectedGrounding: "present",
          expectedResolvedKind: "resolved_query",
          expectedResolvedQuery: "access assess excess 怎么背",
          expectedTargetLemmas: ["access", "assess", "excess"],
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
      name: "response word family then collect group",
      turns: [
        {
          query: "response 的派生词",
          activeExamTarget: "postgrad",
          expectedStatus: 200,
          expectedAnswerKind: "grounded",
          expectedGrounding: "present",
          expectedContextLemmas: ["respond", "response", "responsive", "responsible"],
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
          expectedProviderRequest: "absent",
        },
      ],
    },
    // Deferred by design: "遵循的英文是什么" -> "还有更适合作文的吗"
    // needs semantic style follow-up support that V1 does not safely resolve yet.
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

  for (const lemma of missingLemmas(
    turnDef.expectedContextLemmas ?? [],
    observation.contextLemmas,
  )) {
    failures.push(`${prefix} context missing ${lemma}`);
  }

  for (const lemma of missingLemmas(
    turnDef.expectedTargetLemmas ?? [],
    observation.targetLemmas,
  )) {
    failures.push(`${prefix} target missing ${lemma}`);
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
