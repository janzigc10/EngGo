import { loadSeedContent } from "../src/features/content/load-seed-content";
import { summarizeSeedContent } from "../src/features/content/seed-content-rules";

async function main() {
  const seedContent = await loadSeedContent();
  const summary = summarizeSeedContent(seedContent);

  console.log(
    `Seed content valid: ${summary.entryCount} entries, ${summary.confusionGroupCount} confusion groups, scopes=${summary.coveredScopes.join(", ")}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
