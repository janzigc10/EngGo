import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadSourceLemmaMemberships } from "../src/features/content/source-lemma-sources";
import {
  buildSourceOnlyLookupSamplePlan,
  parseSourceOnlyLookupSampleArgs,
} from "./lib/source-only-lookup-sample";
import { runAnswerStyleProviderSmoke } from "./run-answer-style-provider-smoke";

type StructuredEntry = {
  lemma?: unknown;
};

async function loadStructuredLemmas(datasetName: string) {
  const entriesPath = path.join(
    process.cwd(),
    "data",
    "exam-vocab",
    datasetName,
    "entries.json",
  );
  const raw = await readFile(entriesPath, "utf8");
  const entries = JSON.parse(raw) as StructuredEntry[];

  return entries
    .map((entry) => (typeof entry.lemma === "string" ? entry.lemma : ""))
    .filter(Boolean);
}

async function main() {
  const options = parseSourceOnlyLookupSampleArgs(process.argv);
  const [memberships, structuredLemmas] = await Promise.all([
    loadSourceLemmaMemberships(),
    loadStructuredLemmas(options.datasetName),
  ]);
  const samplePlan = buildSourceOnlyLookupSamplePlan({
    memberships,
    structuredLemmas,
    scopes: options.scopes,
    limit: options.limit,
    offset: options.offset,
  });

  console.log("=== SOURCE-ONLY LOOKUP SAMPLE PLAN ===");
  console.log(
    JSON.stringify(
      {
        dataset: options.datasetName,
        scopes: options.scopes,
        limit: options.limit,
        offset: options.offset,
        totalCandidates: samplePlan.totalCandidates,
        returnedCandidates: samplePlan.returnedCandidates,
        queries: samplePlan.cases.map((item) => item.query),
      },
      null,
      2,
    ),
  );

  const { results, summary } = await runAnswerStyleProviderSmoke({
    cases: samplePlan.cases,
  });

  console.log("\n=== SOURCE-ONLY LOOKUP SAMPLE SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  if (results.some((item) => item.autoVerdict === "fail")) {
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
