import "dotenv/config";

import { pathToFileURL } from "node:url";

import { createChatService } from "../src/features/answering/chat-service";
import { db } from "../src/lib/db";
import { retrieveCandidates } from "../src/features/retrieval/retrieve-candidates";
import type { RetrievalResult } from "../src/features/retrieval/types";
import {
  buildBlackBoxProductSmokeCases,
  evaluateBlackBoxProductSmoke,
  summarizeBlackBoxProductSmoke,
  type BlackBoxProductSmokeCase,
  type BlackBoxProductSmokeObservation,
  type BlackBoxProductSmokeResult,
} from "./lib/black-box-product-smoke";

type RunnerResult = BlackBoxProductSmokeResult & {
  query: string;
  route: string;
  grounding: string;
  elapsedMs: number;
};

function unique(values: string[]) {
  return [...new Set(values)];
}

function collectGroundingLemmas(result: RetrievalResult) {
  return unique([
    ...result.mainAnswer.map((candidate) => candidate.lemma),
    ...result.confusionBoundary.map((candidate) => candidate.lemma),
    ...(result.comparisonView?.members.map((member) => member.lemma) ?? []),
    ...(result.rootFamilyView?.members.map((member) => member.lemma) ?? []),
  ]);
}

function formatGrounding(lemmas: string[]) {
  if (lemmas.length === 0) {
    return "-";
  }

  return lemmas.slice(0, 6).join("/");
}

function formatResultLine(result: RunnerResult) {
  return [
    `[${result.verdict.toUpperCase()}]`,
    result.category,
    result.name,
    `route=${result.route}`,
    `grounding=${result.grounding}`,
    `elapsed=${result.elapsedMs}ms`,
    `query=${result.query}`,
  ].join(" | ");
}

async function runCase(item: BlackBoxProductSmokeCase): Promise<RunnerResult> {
  const startedAt = Date.now();
  const retrievalResult = await retrieveCandidates({
    activeExamTarget: item.activeExamTarget,
    query: item.query,
  });
  const groundingLemmas = collectGroundingLemmas(retrievalResult);
  let providerCalled = false;

  const service = createChatService({
    provider: {
      async generateAnswer(input) {
        providerCalled = true;

        return {
          answer: `stub answer for ${input.grounding.query}`,
          providerRequestId: "black_box_product_smoke_stub",
        };
      },
    },
    createRequestId: () => `black_box_${item.name.replace(/\W+/g, "_")}`,
  });

  const serviceResult = await service.answer({
    activeExamTarget: item.activeExamTarget,
    query: item.query,
    history: [],
    retrievalResult,
  });
  const observation: BlackBoxProductSmokeObservation = {
    queryMode: retrievalResult.queryMode,
    resolution: retrievalResult.resolution,
    answerStyle: serviceResult.grounding.answerStyle,
    groundingLemmas,
    comparisonViewId: serviceResult.grounding.comparisonView?.id ?? null,
    rootFamilyViewId: serviceResult.grounding.rootFamilyView?.id ?? null,
    providerCalled,
  };
  const result = evaluateBlackBoxProductSmoke(item, observation);

  return {
    ...result,
    query: item.query,
    route: [
      retrievalResult.queryMode,
      retrievalResult.resolution,
      serviceResult.grounding.answerStyle,
    ].join("/"),
    grounding: formatGrounding(groundingLemmas),
    elapsedMs: Date.now() - startedAt,
  };
}

export async function runBlackBoxProductSmoke() {
  const cases = buildBlackBoxProductSmokeCases();
  const results: RunnerResult[] = [];

  for (const item of cases) {
    const result = await runCase(item);
    results.push(result);
    console.log(formatResultLine(result));

    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
  }

  const summary = summarizeBlackBoxProductSmoke(results);
  console.log("\n=== BLACK BOX PRODUCT SMOKE SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  return {
    results,
    summary,
  };
}

async function main() {
  const { results } = await runBlackBoxProductSmoke();

  if (results.some((item) => item.verdict === "fail")) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
