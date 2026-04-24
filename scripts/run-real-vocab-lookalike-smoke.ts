import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { ExamScopeCode } from "../src/features/content/import-types";
import { retrieveCandidates } from "../src/features/retrieval/retrieve-candidates";
import type { RetrievalResult } from "../src/features/retrieval/types";
import { db } from "../src/lib/db";

const lookalikeSmokeCaseSchema = z.object({
  name: z.string().min(1),
  query: z.string().min(1),
  activeExamTarget: z.enum(["gaokao", "cet4", "cet6", "postgrad"]),
  expectedQueryMode: z.literal("shape_neighbor_search"),
  expectedResolution: z.literal("resolved"),
  expectedIncludes: z.array(z.string().min(1)).min(1),
  expectedExcludes: z.array(z.string().min(1)).optional(),
  minCandidates: z.number().int().nonnegative(),
  maxCandidates: z.number().int().positive(),
});

const lookalikeSmokeCaseListSchema = z.array(lookalikeSmokeCaseSchema).min(1);

export type LookalikeSmokeCase = z.infer<typeof lookalikeSmokeCaseSchema>;

export type LookalikeSmokeResult = {
  name: string;
  verdict: "pass" | "fail";
  failures: string[];
  lemmas: string[];
  elapsedMs: number;
};

export type LookalikeSmokeSummary = {
  total: number;
  pass: number;
  fail: number;
  averageElapsedMs: number;
};

type ReadDatasetNameOptions = {
  argv: string[];
  defaultDatasetName?: string;
};

export function readDatasetName({
  argv,
  defaultDatasetName = "real-smoke",
}: ReadDatasetNameOptions) {
  const unknownFlag = argv
    .slice(2)
    .find((argument) => argument.startsWith("--") && argument !== "--dataset");

  if (unknownFlag) {
    throw new Error(`Unknown argument: ${unknownFlag}.`);
  }

  const datasetArgIndex = argv.indexOf("--dataset");

  if (datasetArgIndex === -1) {
    return defaultDatasetName;
  }

  const datasetName = argv[datasetArgIndex + 1];

  if (!datasetName || datasetName.startsWith("--")) {
    throw new Error("Expected a dataset name after --dataset.");
  }

  return datasetName;
}

export function evaluateLookalikeSmokeCase(
  caseDef: LookalikeSmokeCase,
  retrievalResult: RetrievalResult,
  elapsedMs: number,
): LookalikeSmokeResult {
  const failures: string[] = [];
  const lemmas = retrievalResult.mainAnswer.map((candidate) => candidate.lemma);

  if (retrievalResult.queryMode !== caseDef.expectedQueryMode) {
    failures.push(
      `queryMode expected ${caseDef.expectedQueryMode}, received ${retrievalResult.queryMode}`,
    );
  }

  if (retrievalResult.resolution !== caseDef.expectedResolution) {
    failures.push(
      `resolution expected ${caseDef.expectedResolution}, received ${retrievalResult.resolution}`,
    );
  }

  for (const lemma of caseDef.expectedIncludes) {
    if (!lemmas.includes(lemma)) {
      failures.push(`missing expected lemma ${lemma}`);
    }
  }

  for (const lemma of caseDef.expectedExcludes ?? []) {
    if (lemmas.includes(lemma)) {
      failures.push(`forbidden lemma surfaced ${lemma}`);
    }
  }

  for (const candidate of retrievalResult.mainAnswer) {
    if (!candidate.inScope) {
      failures.push(`candidate ${candidate.lemma} is out of active scope`);
    }

    if (candidate.meaningsZh.length === 0) {
      failures.push(`candidate ${candidate.lemma} has no Chinese meaning`);
    }
  }

  if (lemmas.length < caseDef.minCandidates) {
    failures.push(
      `candidate count ${lemmas.length} is below minCandidates ${caseDef.minCandidates}`,
    );
  }

  if (lemmas.length > caseDef.maxCandidates) {
    failures.push(
      `candidate count ${lemmas.length} exceeds maxCandidates ${caseDef.maxCandidates}`,
    );
  }

  return {
    name: caseDef.name,
    verdict: failures.length === 0 ? "pass" : "fail",
    failures,
    lemmas,
    elapsedMs,
  };
}

export function summarizeLookalikeSmokeResults(
  results: LookalikeSmokeResult[],
): LookalikeSmokeSummary {
  return {
    total: results.length,
    pass: results.filter((result) => result.verdict === "pass").length,
    fail: results.filter((result) => result.verdict === "fail").length,
    averageElapsedMs: results.length === 0
      ? 0
      : Math.round(
          results.reduce((total, result) => total + result.elapsedMs, 0)
          / results.length,
        ),
  };
}

async function loadLookalikeSmokeCases(datasetName: string) {
  const casesPath = path.join(
    process.cwd(),
    "data",
    "exam-vocab",
    datasetName,
    "lookalike-smoke-cases.json",
  );
  const raw = await readFile(casesPath, "utf8");

  return lookalikeSmokeCaseListSchema.parse(JSON.parse(raw));
}

async function runCase(caseDef: LookalikeSmokeCase) {
  const startedAt = Date.now();
  const retrievalResult = await retrieveCandidates({
    activeExamTarget: caseDef.activeExamTarget as ExamScopeCode,
    query: caseDef.query,
  });

  return evaluateLookalikeSmokeCase(
    caseDef,
    retrievalResult,
    Date.now() - startedAt,
  );
}

function formatResultLine(result: LookalikeSmokeResult) {
  const lemmas = result.lemmas.join("/") || "none";

  return `[${result.verdict.toUpperCase()}] ${result.name} | lemmas=${lemmas} | elapsed=${result.elapsedMs}ms`;
}

async function main() {
  const datasetName = readDatasetName({ argv: process.argv });
  const cases = await loadLookalikeSmokeCases(datasetName);
  const results: LookalikeSmokeResult[] = [];

  for (const caseDef of cases) {
    const result = await runCase(caseDef);
    results.push(result);
    console.log(formatResultLine(result));

    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
  }

  const summary = summarizeLookalikeSmokeResults(results);

  console.log(JSON.stringify(summary, null, 2));

  if (summary.fail > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("run-real-vocab-lookalike-smoke.ts")) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
