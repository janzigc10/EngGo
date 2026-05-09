import path from "node:path";

import { loadVocabContent } from "../src/features/content/load-seed-content";
import { summarizeSeedContent } from "../src/features/content/seed-content-rules";
import { loadSourceLemmaMemberships } from "../src/features/content/source-lemma-sources";

type CheckVocabContentOptions = {
  datasetName: string;
  baseDir?: string;
  minEntries?: number;
  requireSourceLemmas?: boolean;
};

const supportedFlags = new Set([
  "--dataset",
  "--min-entries",
  "--require-source-lemmas",
]);

function readRequiredValue(
  args: string[],
  index: number,
  flagName: string,
  missingMessage = `Expected a value after ${flagName}.`,
) {
  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(missingMessage);
  }

  return value;
}

function readPositiveInteger(value: string, flagName: string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected ${flagName} to be a positive integer.`);
  }

  return parsed;
}

export function readCheckVocabContentOptions(argv: string[]) {
  const args = argv.slice(2);
  const options: CheckVocabContentOptions = {
    datasetName: "seed",
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}.`);
    }

    if (!supportedFlags.has(argument)) {
      throw new Error(`Unknown argument: ${argument}.`);
    }

    if (argument === "--dataset") {
      options.datasetName = readRequiredValue(
        args,
        index,
        argument,
        "Expected a dataset name after --dataset.",
      );
      index += 1;
      continue;
    }

    if (argument === "--min-entries") {
      options.minEntries = readPositiveInteger(
        readRequiredValue(args, index, argument),
        argument,
      );
      index += 1;
      continue;
    }

    options.requireSourceLemmas = true;
  }

  return options;
}

export function readDatasetName(argv: string[]) {
  return readCheckVocabContentOptions(argv).datasetName;
}

async function ensureSourceLemmaCoverage({
  baseDir,
  entries,
}: {
  baseDir: string;
  entries: Awaited<ReturnType<typeof loadVocabContent>>["entries"];
}) {
  const memberships = await loadSourceLemmaMemberships({ baseDir });
  const sourceLemmaScopes = new Map<string, Set<string>>();

  for (const membership of memberships) {
    const scopes = sourceLemmaScopes.get(membership.lemma) ?? new Set<string>();
    scopes.add(membership.scopeCode);
    sourceLemmaScopes.set(membership.lemma, scopes);
  }

  const missing = entries.flatMap((entry) => {
    const sourceScopes = sourceLemmaScopes.get(entry.lemma.toLowerCase());

    return entry.examScopes
      .filter((examScope) => !sourceScopes?.has(examScope))
      .map((examScope) => `${entry.lemma}[${examScope}]`);
  });

  if (missing.length > 0) {
    throw new Error(`source lemma coverage missing: ${missing.join(", ")}`);
  }
}

export function formatCliError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function checkVocabContent({
  datasetName,
  baseDir,
  minEntries,
  requireSourceLemmas = false,
}: CheckVocabContentOptions) {
  const resolvedBaseDir = baseDir ?? path.join(process.cwd(), "data", "exam-vocab");
  const vocabContent = await loadVocabContent({
    datasetName,
    baseDir: resolvedBaseDir,
  });
  const summary = summarizeSeedContent(vocabContent);

  if (minEntries !== undefined && summary.entryCount < minEntries) {
    throw new Error(
      `${datasetName} has ${summary.entryCount} entries; expected at least ${minEntries}.`,
    );
  }

  if (requireSourceLemmas) {
    await ensureSourceLemmaCoverage({
      baseDir: resolvedBaseDir,
      entries: vocabContent.entries,
    });
  }

  return `Vocab content valid: ${summary.entryCount} entries, ${summary.confusionGroupCount} confusion groups, scopes=${summary.coveredScopes.join(", ")}.`;
}

async function main() {
  const options = readCheckVocabContentOptions(process.argv);
  const result = await checkVocabContent(options);

  console.log(result);
}

if (process.argv[1]?.endsWith("check-vocab-content.ts")) {
  main().catch((error) => {
    console.error(formatCliError(error));
    process.exitCode = 1;
  });
}
