import { pathToFileURL } from "node:url";

import {
  buildFastApiMigratedSliceSmokeCases,
  evaluateFastApiMigratedSliceSmoke,
  parseFastApiMigratedSliceSmokeArgs,
  summarizeFastApiMigratedSliceSmoke,
  type FastApiMigratedSliceSmokeCase,
  type FastApiMigratedSliceSmokeObservation,
  type FastApiMigratedSliceSmokeResult,
} from "./lib/fastapi-migrated-slice-smoke";

type RunnerResult = FastApiMigratedSliceSmokeResult & {
  query: string;
  status: number;
  route: string;
  elapsedMs: number;
};

function formatResultLine(result: RunnerResult) {
  return [
    `[${result.verdict.toUpperCase()}]`,
    result.name,
    `status=${result.status}`,
    `route=${result.route}`,
    `elapsed=${result.elapsedMs}ms`,
    `query=${result.query}`,
  ].join(" | ");
}

async function readJson(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  return JSON.parse(text);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
}

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function toObservation(
  response: Response,
  payload: Record<string, unknown>,
): FastApiMigratedSliceSmokeObservation {
  const error = asRecord(payload.error);
  const grounding = asRecord(payload.grounding);
  const comparisonView = asRecord(grounding.comparisonView);
  const rootFamilyView = asRecord(grounding.rootFamilyView);

  return {
    status: response.status,
    answerKind:
      payload.answerKind === "grounded" || payload.answerKind === "plain"
        ? payload.answerKind
        : null,
    errorCode: getString(error.code),
    answerStyle: getString(grounding.answerStyle),
    matchType: getString(grounding.matchType),
    resolution: getString(grounding.resolution),
    comparisonViewId: getString(comparisonView.id),
    rootFamilyViewId: getString(rootFamilyView.id),
    groundingLemmas: uniqueValues([
      ...collectLemmasFromRecords(grounding.mainAnswer),
      ...collectLemmasFromRecords(grounding.confusionBoundary),
      ...collectLemmasFromRecords(comparisonView.members),
      ...collectLemmasFromRecords(rootFamilyView.members),
    ]),
    providerRequestId: getString(payload.providerRequestId),
    hasGrounding: typeof payload.grounding === "object" && payload.grounding !== null,
    requestIdMatchesHeader:
      typeof payload.requestId === "string"
      && response.headers.get("x-request-id") === payload.requestId,
  };
}

async function runCase(
  baseUrl: string,
  caseDef: FastApiMigratedSliceSmokeCase,
): Promise<RunnerResult> {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      activeExamTarget: caseDef.activeExamTarget,
      query: caseDef.query,
      history: [],
    }),
  });
  const payload = asRecord(await readJson(response));
  const observation = toObservation(response, payload);
  const result = evaluateFastApiMigratedSliceSmoke(caseDef, observation);

  return {
    ...result,
    query: caseDef.query,
    status: response.status,
    route: [
      observation.answerKind ?? "-",
      observation.resolution ?? "-",
      observation.matchType ?? observation.errorCode ?? "-",
    ].join("/"),
    elapsedMs: Date.now() - startedAt,
  };
}

export async function runFastApiMigratedSliceSmoke(args = process.argv.slice(2)) {
  const { baseUrl, label } = parseFastApiMigratedSliceSmokeArgs(args);
  const cases = buildFastApiMigratedSliceSmokeCases();
  const results: RunnerResult[] = [];

  console.log(`=== FASTAPI MIGRATED SLICE SMOKE: ${label} (${baseUrl}) ===`);

  for (const caseDef of cases) {
    const result = await runCase(baseUrl, caseDef);
    results.push(result);
    console.log(formatResultLine(result));

    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
  }

  const summary = summarizeFastApiMigratedSliceSmoke(results);
  console.log("\n=== FASTAPI MIGRATED SLICE SMOKE SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  return {
    results,
    summary,
  };
}

async function main() {
  const { results } = await runFastApiMigratedSliceSmoke();

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
