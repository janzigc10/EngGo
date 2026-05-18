import { pathToFileURL } from "node:url";

import {
  buildFastApiDbUnavailableSmokeCases,
  evaluateFastApiDbUnavailableSmoke,
  parseFastApiMigratedSliceSmokeArgs,
  summarizeFastApiMigratedSliceSmoke,
  type FastApiDbUnavailableSmokeCase,
  type FastApiDbUnavailableSmokeResult,
} from "./lib/fastapi-db-unavailable-smoke";
import { toObservation } from "./run-fastapi-migrated-slice-smoke";

type RunnerResult = FastApiDbUnavailableSmokeResult & {
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

async function runCase(
  baseUrl: string,
  caseDef: FastApiDbUnavailableSmokeCase,
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
  const result = evaluateFastApiDbUnavailableSmoke(caseDef, observation);

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

export async function runFastApiDbUnavailableSmoke(args = process.argv.slice(2)) {
  const { baseUrl, label } = parseFastApiMigratedSliceSmokeArgs(args);
  const cases = buildFastApiDbUnavailableSmokeCases();
  const results: RunnerResult[] = [];

  console.log(`=== FASTAPI DB-UNAVAILABLE SMOKE: ${label} (${baseUrl}) ===`);

  for (const caseDef of cases) {
    const result = await runCase(baseUrl, caseDef);
    results.push(result);
    console.log(formatResultLine(result));

    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
  }

  const summary = summarizeFastApiMigratedSliceSmoke(results);
  console.log("\n=== FASTAPI DB-UNAVAILABLE SMOKE SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  return {
    results,
    summary,
  };
}

async function main() {
  const { results } = await runFastApiDbUnavailableSmoke();

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
