import "dotenv/config";

import {
  loadSeedContent,
  loadVocabContent,
} from "../src/features/content/load-seed-content";
import { seedContent } from "../src/features/content/seed-content";
import { db } from "../src/lib/db";

function resolveDatasetName(argv: string[]) {
  const datasetArgIndex = argv.indexOf("--dataset");

  if (datasetArgIndex === -1) {
    return undefined;
  }

  const datasetName = argv[datasetArgIndex + 1];

  if (!datasetName || datasetName.startsWith("--")) {
    throw new Error("Missing dataset name after --dataset. Example: --dataset real-smoke");
  }

  return datasetName;
}

async function main() {
  const datasetName = resolveDatasetName(process.argv);
  const seedData = datasetName === undefined
    ? await loadSeedContent()
    : await loadVocabContent({ datasetName });

  await seedContent(db, seedData);
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exitCode = 1;
  });
