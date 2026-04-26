import { pathToFileURL } from "node:url";

import { buildStandardLookupProviderSmokeCases } from "./lib/answer-style-provider-smoke";
import { runAnswerStyleProviderSmoke } from "./run-answer-style-provider-smoke";

async function main() {
  const { results, summary } = await runAnswerStyleProviderSmoke({
    cases: buildStandardLookupProviderSmokeCases(),
  });

  console.log("\n=== STANDARD LOOKUP PROVIDER SMOKE SUMMARY ===");
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
