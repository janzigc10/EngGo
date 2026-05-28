import { pathToFileURL } from "node:url";

import {
  buildConversationalLearningContextSmokeCases,
  evaluateConversationContextSmoke,
  parseConversationContextSmokeArgs,
  summarizeConversationContextSmoke,
  type ConversationContextSmokeCase,
  type ConversationContextSmokeObservation,
  type ConversationContextSmokeResult,
} from "./lib/conversational-learning-context-smoke";

type ActiveExamTarget = ConversationContextSmokeCase["turns"][number]["activeExamTarget"];

type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type RunnerTurnResult = {
  turn: number;
  query: string;
  status: number;
  route: string;
  elapsedMs: number;
};

type RunnerCaseResult = ConversationContextSmokeResult & {
  turnMeta: RunnerTurnResult[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getExamTarget(
  value: unknown,
): ActiveExamTarget | null {
  return typeof value === "string"
    && ["gaokao", "cet4", "cet6", "postgrad"].includes(value)
    ? value as ActiveExamTarget
    : null;
}

function getResolvedKind(
  value: unknown,
): ConversationContextSmokeObservation["resolvedKind"] {
  return value === "resolved_query"
    || value === "resolved_action"
    || value === "clarification"
    ? value
    : null;
}

function collectLemmasFromRecords(value: unknown) {
  return asArray(value)
    .map(asRecord)
    .map((item) => getString(item.lemma))
    .filter((lemma): lemma is string => Boolean(lemma));
}

function uniqueValues(values: string[]) {
  return [...new Set(values)];
}

async function readJson(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  return JSON.parse(text);
}

export function toConversationContextSmokeObservation(
  response: Response,
  payload: Record<string, unknown>,
): ConversationContextSmokeObservation {
  const conversationContext = asRecord(payload.conversationContext);
  const resolvedFollowUp = asRecord(payload.resolvedFollowUp);

  return {
    status: response.status,
    answerKind:
      payload.answerKind === "grounded" || payload.answerKind === "plain"
        ? payload.answerKind
        : null,
    hasGrounding: typeof payload.grounding === "object" && payload.grounding !== null,
    providerRequestId: getString(payload.providerRequestId),
    resolvedKind: getResolvedKind(resolvedFollowUp.kind),
    resolvedQuery: getString(resolvedFollowUp.query),
    action: getString(resolvedFollowUp.action),
    resolvedActiveExamTarget: getExamTarget(resolvedFollowUp.activeExamTarget),
    contextActiveExamTarget: getExamTarget(conversationContext.activeExamTarget),
    targetLemmas: uniqueValues(collectLemmasFromRecords(resolvedFollowUp.targetRefs)),
    contextLemmas: uniqueValues(collectLemmasFromRecords(conversationContext.candidates)),
  };
}

function routeLabel(observation: ConversationContextSmokeObservation) {
  return [
    observation.answerKind ?? "-",
    observation.resolvedKind ?? "-",
    observation.action ?? observation.resolvedQuery ?? "-",
  ].join("/");
}

function formatTurnLine(
  caseResult: ConversationContextSmokeResult,
  turnMeta: RunnerTurnResult,
) {
  const turnResult = caseResult.turnResults[turnMeta.turn - 1];
  const verdict = turnResult?.verdict ?? "fail";

  return [
    `[${verdict.toUpperCase()}]`,
    caseResult.name,
    `turn=${turnMeta.turn}`,
    `status=${turnMeta.status}`,
    `route=${turnMeta.route}`,
    `elapsed=${turnMeta.elapsedMs}ms`,
    `query=${turnMeta.query}`,
  ].join(" | ");
}

async function postTurn(
  baseUrl: string,
  turn: ConversationContextSmokeCase["turns"][number],
  activeExamTarget: ActiveExamTarget,
  history: ChatHistoryMessage[],
  conversationContext: unknown,
) {
  const body: Record<string, unknown> = {
    activeExamTarget,
    query: turn.query,
    history,
  };

  if (conversationContext) {
    body.conversationContext = conversationContext;
  }

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = asRecord(await readJson(response));

  return {
    response,
    payload,
  };
}

async function runCase(
  baseUrl: string,
  caseDef: ConversationContextSmokeCase,
): Promise<RunnerCaseResult> {
  const observations: ConversationContextSmokeObservation[] = [];
  const turnMeta: RunnerTurnResult[] = [];
  const history: ChatHistoryMessage[] = [];
  let conversationContext: unknown = null;
  let activeExamTarget = caseDef.turns[0]?.activeExamTarget ?? "cet6";

  for (let index = 0; index < caseDef.turns.length; index += 1) {
    const turn = caseDef.turns[index];
    const startedAt = Date.now();
    const { response, payload } = await postTurn(
      baseUrl,
      turn,
      activeExamTarget,
      history,
      conversationContext,
    );
    const observation = toConversationContextSmokeObservation(response, payload);
    const answer = getString(payload.answer) ?? "";

    observations.push(observation);
    turnMeta.push({
      turn: index + 1,
      query: turn.query,
      status: response.status,
      route: routeLabel(observation),
      elapsedMs: Date.now() - startedAt,
    });

    if (payload.conversationContext) {
      conversationContext = payload.conversationContext;
    }
    activeExamTarget = observation.resolvedActiveExamTarget
      ?? observation.contextActiveExamTarget
      ?? activeExamTarget;

    history.push({ role: "user", content: turn.query });
    history.push({
      role: "assistant",
      content: answer || "No answer returned.",
    });
  }

  return {
    ...evaluateConversationContextSmoke(caseDef, observations),
    turnMeta,
  };
}

export async function runConversationalLearningContextSmoke(
  args = process.argv.slice(2),
) {
  const { baseUrl, label } = parseConversationContextSmokeArgs(args);
  const cases = buildConversationalLearningContextSmokeCases();
  const results: RunnerCaseResult[] = [];

  console.log(`=== CONVERSATIONAL CONTEXT SMOKE: ${label} (${baseUrl}) ===`);

  for (const caseDef of cases) {
    const result = await runCase(baseUrl, caseDef);
    results.push(result);

    for (const turnMeta of result.turnMeta) {
      console.log(formatTurnLine(result, turnMeta));
      const turnResult = result.turnResults[turnMeta.turn - 1];

      for (const failure of turnResult?.failures ?? []) {
        console.log(`  - ${failure}`);
      }
    }
  }

  const summary = summarizeConversationContextSmoke(results);
  console.log("\n=== CONVERSATIONAL CONTEXT SMOKE SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  return {
    results,
    summary,
  };
}

async function main() {
  const { results } = await runConversationalLearningContextSmoke();

  if (results.some((item) => item.verdict === "fail")) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
