import { loadVocabContent } from "../src/features/content/load-seed-content";
import { summarizeSeedContent } from "../src/features/content/seed-content-rules";

type CheckVocabContentOptions = {
  datasetName: string;
  baseDir?: string;
};

export function readDatasetName(argv: string[]) {
  const unknownFlag = argv
    .slice(2)
    .find((argument) => argument.startsWith("--") && argument !== "--dataset");

  if (unknownFlag) {
    throw new Error(`Unknown argument: ${unknownFlag}.`);
  }

  const datasetArgIndex = argv.indexOf("--dataset");

  if (datasetArgIndex === -1) {
    return "seed";
  }

  const datasetName = argv[datasetArgIndex + 1];

  if (!datasetName || datasetName.startsWith("--")) {
    throw new Error("Expected a dataset name after --dataset.");
  }

  return datasetName;
}

export function formatCliError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function checkVocabContent({
  datasetName,
  baseDir,
}: CheckVocabContentOptions) {
  const vocabContent = await loadVocabContent({ datasetName, baseDir });
  const summary = summarizeSeedContent(vocabContent);

  return `Vocab content valid: ${summary.entryCount} entries, ${summary.confusionGroupCount} confusion groups, scopes=${summary.coveredScopes.join(", ")}.`;
}

async function main() {
  const datasetName = readDatasetName(process.argv);
  const result = await checkVocabContent({ datasetName });

  console.log(result);
}

if (process.argv[1]?.endsWith("check-vocab-content.ts")) {
  main().catch((error) => {
    console.error(formatCliError(error));
    process.exitCode = 1;
  });
}
