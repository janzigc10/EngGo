import { pathToFileURL } from "node:url";

import type {
  AnswerStyle,
  QueryMode,
  RetrievalResolution,
} from "@/features/retrieval/types";
import {
  buildBlackBoxProductSmokeCases,
  evaluateBlackBoxProductSmoke,
  summarizeBlackBoxProductSmoke,
  type BlackBoxProductSmokeCase,
  type BlackBoxProductSmokeObservation,
  type BlackBoxProductSmokeResult,
} from "./lib/black-box-product-smoke";

type RunnerArgs = {
  baseUrl: string;
  label: string;
};

type RunnerResult = BlackBoxProductSmokeResult & {
  query: string;
  status: number;
  route: string;
  grounding: string;
  elapsedMs: number;
};

function parseArgs(args: string[]): RunnerArgs {
  let baseUrl = "http://127.0.0.1:8000";
  let label = "fastapi-product-http";

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

function unique(values: string[]) {
  return [...new Set(values)];
}

function collectLemmas(value: unknown) {
  return asArray(value)
    .map(asRecord)
    .map((item) => getString(item.lemma))
    .filter((lemma): lemma is string => Boolean(lemma));
}

function collectGroundingLemmas(grounding: Record<string, unknown>) {
  const comparisonView = asRecord(grounding.comparisonView);
  const rootFamilyView = asRecord(grounding.rootFamilyView);

  return unique([
    ...collectLemmas(grounding.mainAnswer),
    ...collectLemmas(grounding.confusionBoundary),
    ...collectLemmas(grounding.lightCandidates),
    ...collectLemmas(comparisonView.members),
    ...collectLemmas(rootFamilyView.members),
  ]);
}

function formatGrounding(lemmas: string[]) {
  return lemmas.length === 0 ? "-" : lemmas.slice(0, 6).join("/");
}

function formatResultLine(result: RunnerResult) {
  return [
    `[${result.verdict.toUpperCase()}]`,
    result.category,
    result.name,
    `status=${result.status}`,
    `route=${result.route}`,
    `grounding=${result.grounding}`,
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

function buildObservation(payload: Record<string, unknown>): BlackBoxProductSmokeObservation {
  const grounding = asRecord(payload.grounding);
  const comparisonView = asRecord(grounding.comparisonView);
  const rootFamilyView = asRecord(grounding.rootFamilyView);

  return {
    queryMode: (getString(grounding.queryMode) ?? "unknown") as QueryMode,
    resolution: (getString(grounding.resolution) ?? "unknown") as RetrievalResolution,
    answerStyle: (getString(grounding.answerStyle) ?? "unknown") as AnswerStyle,
    groundingLemmas: collectGroundingLemmas(grounding),
    comparisonViewId: getString(comparisonView.id),
    rootFamilyViewId: getString(rootFamilyView.id),
    providerCalled: Boolean(getString(payload.providerRequestId)),
  };
}

async function runCase(
  baseUrl: string,
  caseDef: BlackBoxProductSmokeCase,
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
  const observation = buildObservation(payload);
  const result = response.status === 200
    ? evaluateBlackBoxProductSmoke(caseDef, observation)
    : {
        name: caseDef.name,
        category: caseDef.category,
        verdict: "fail" as const,
        failures: [`status expected 200, received ${response.status}`],
      };

  return {
    ...result,
    query: caseDef.query,
    status: response.status,
    route: [
      observation.queryMode,
      observation.resolution,
      observation.answerStyle,
    ].join("/"),
    grounding: formatGrounding(observation.groundingLemmas),
    elapsedMs: Date.now() - startedAt,
  };
}

export async function runBlackBoxProductHttpSmoke(args = process.argv.slice(2)) {
  const { baseUrl, label } = parseArgs(args);
  const cases = buildBlackBoxProductSmokeCases();
  const results: RunnerResult[] = [];

  console.log(`=== BLACK BOX PRODUCT HTTP SMOKE: ${label} (${baseUrl}) ===`);

  for (const caseDef of cases) {
    const result = await runCase(baseUrl, caseDef);
    results.push(result);
    console.log(formatResultLine(result));

    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
  }

  const summary = summarizeBlackBoxProductSmoke(results);
  console.log("\n=== BLACK BOX PRODUCT HTTP SMOKE SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  return {
    results,
    summary,
  };
}

async function main() {
  const { results } = await runBlackBoxProductHttpSmoke();

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
