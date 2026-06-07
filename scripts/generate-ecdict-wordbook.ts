import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  cleanEcdictTranslation,
  parseEcdictCsv,
  type EcdictRow,
} from "../src/features/content/ecdict-csv";
import {
  examScopeOrder,
  scopeCodesFromEcdictTags,
} from "../src/features/exam-target/scope-closure";

type ExamScope = (typeof examScopeOrder)[number];

type GeneratedWordbookEntry = {
  id: string;
  lemma: string;
  aliases: string[];
  pos: string[];
  meaningsZh: string[];
  examScopes: ExamScope[];
  examples: string[];
  collocations: string[];
};

type GenerateOptions = {
  dictionaryPath: string;
  outputPath: string;
  maxMeanings: number;
};

const defaultOptions: GenerateOptions = {
  dictionaryPath: path.join("output", "external-dictionaries", "ecdict.csv"),
  outputPath: path.join("data", "exam-vocab", "ecdict-wordbook", "entries.json"),
  maxMeanings: 3,
};

const translationPosPattern =
  /(?:^|[；;，,、\s])((?:n|v|vt|vi|a|adj|adv|prep|conj|pron|det|interj)\.)\s*/gi;

function parsePositiveIntegerOption(value: string | undefined, flagName: string) {
  const parsed = Number(value);

  if (!value || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer after ${flagName}.`);
  }

  return parsed;
}

export function parseGenerateEcdictWordbookArgs(argv: string[]): GenerateOptions {
  const options = { ...defaultOptions };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextArg = argv[index + 1];

    if (arg === "--") {
      continue;
    }

    if (arg === "--dictionary") {
      if (!nextArg) {
        throw new Error("Expected dictionary path after --dictionary.");
      }

      options.dictionaryPath = nextArg;
      index += 1;
      continue;
    }

    if (arg === "--output") {
      if (!nextArg) {
        throw new Error("Expected output path after --output.");
      }

      options.outputPath = nextArg;
      index += 1;
      continue;
    }

    if (arg === "--max-meanings") {
      options.maxMeanings = parsePositiveIntegerOption(nextArg, "--max-meanings");
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function normalizeLemma(value: string) {
  return value.trim().toLowerCase();
}

function isLookupFriendlyLemma(lemma: string) {
  return /^[a-z]{3,}$/.test(lemma);
}

function normalizeTextList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractPos(row: EcdictRow, meanings: string[]) {
  const explicitPos = normalizeTextList(row.pos.split(/[,\s/]+/));

  if (explicitPos.length > 0) {
    return explicitPos;
  }

  const extracted: string[] = [];

  for (const meaning of meanings) {
    for (const match of meaning.matchAll(translationPosPattern)) {
      extracted.push(match[1].toLowerCase());
    }
  }

  return normalizeTextList(extracted);
}

function createEntry({
  lemma,
  row,
  scopes,
  maxMeanings,
}: {
  lemma: string;
  row: EcdictRow;
  scopes: ExamScope[];
  maxMeanings: number;
}): GeneratedWordbookEntry | null {
  const cleanResult = cleanEcdictTranslation(row.translation);
  const meaningsZh = normalizeTextList(cleanResult.meanings).slice(0, maxMeanings);

  if (meaningsZh.length === 0) {
    return null;
  }

  return {
    id: lemma,
    lemma,
    aliases: [],
    pos: extractPos(row, meaningsZh),
    meaningsZh,
    examScopes: scopes,
    examples: [],
    collocations: [],
  };
}

export async function generateEcdictWordbook(options: GenerateOptions) {
  const dictionaryRaw = await readFile(options.dictionaryPath, "utf8");
  const rows = parseEcdictCsv(dictionaryRaw);
  const entries: GeneratedWordbookEntry[] = [];
  let skippedNoMeaning = 0;
  let skippedNoScope = 0;
  let skippedUnfriendlyLemma = 0;
  const seenLemmas = new Set<string>();

  for (const row of rows) {
    const lemma = normalizeLemma(row.word);
    if (!lemma || seenLemmas.has(lemma)) {
      continue;
    }

    seenLemmas.add(lemma);

    if (!isLookupFriendlyLemma(lemma)) {
      skippedUnfriendlyLemma += 1;
      continue;
    }

    const scopes = scopeCodesFromEcdictTags(row.tag);
    if (scopes.length === 0) {
      skippedNoScope += 1;
      continue;
    }

    const entry = createEntry({
      lemma,
      row,
      scopes,
      maxMeanings: options.maxMeanings,
    });

    if (!entry) {
      skippedNoMeaning += 1;
      continue;
    }

    entries.push(entry);
  }

  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");

  return {
    outputPath: options.outputPath,
    entries: entries.length,
    dictionaryRows: rows.length,
    skippedNoScope,
    skippedUnfriendlyLemma,
    skippedNoMeaning,
    byScope: Object.fromEntries(
      examScopeOrder.map((scope) => [
        scope,
        entries.filter((entry) => entry.examScopes.includes(scope)).length,
      ]),
    ) as Record<ExamScope, number>,
  };
}

async function main() {
  const summary = await generateEcdictWordbook(
    parseGenerateEcdictWordbookArgs(process.argv),
  );

  console.log("=== ECDICT WORDBOOK SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
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
