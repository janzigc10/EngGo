import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  cleanEcdictTranslation,
  parseEcdictCsv,
  type EcdictRow,
} from "../src/features/content/ecdict-csv";
import { loadSourceLemmaMemberships } from "../src/features/content/source-lemma-sources";

type ExamScope = "gaokao" | "cet4" | "cet6";

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

const scopeOrder: ExamScope[] = ["gaokao", "cet4", "cet6"];
const scopeRank = new Map(scopeOrder.map((scope, index) => [scope, index]));
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

function uniqueSortedScopes(scopes: Iterable<ExamScope>) {
  return [...new Set(scopes)].sort(
    (left, right) => (scopeRank.get(left) ?? 99) - (scopeRank.get(right) ?? 99),
  );
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

function buildDictionaryByLemma(rows: EcdictRow[]) {
  const dictionary = new Map<string, EcdictRow>();

  for (const row of rows) {
    const lemma = normalizeLemma(row.word);

    if (!lemma || dictionary.has(lemma)) {
      continue;
    }

    dictionary.set(lemma, row);
  }

  return dictionary;
}

async function buildSourceScopesByLemma() {
  const memberships = await loadSourceLemmaMemberships();
  const scopesByLemma = new Map<string, Set<ExamScope>>();

  for (const membership of memberships) {
    if (
      membership.scopeCode !== "gaokao"
      && membership.scopeCode !== "cet4"
      && membership.scopeCode !== "cet6"
    ) {
      continue;
    }

    const lemma = normalizeLemma(membership.lemma);

    if (!isLookupFriendlyLemma(lemma)) {
      continue;
    }

    const current = scopesByLemma.get(lemma) ?? new Set<ExamScope>();

    current.add(membership.scopeCode);
    scopesByLemma.set(lemma, current);
  }

  return scopesByLemma;
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
  const [dictionaryRaw, scopesByLemma] = await Promise.all([
    readFile(options.dictionaryPath, "utf8"),
    buildSourceScopesByLemma(),
  ]);
  const dictionaryByLemma = buildDictionaryByLemma(parseEcdictCsv(dictionaryRaw));
  const entries: GeneratedWordbookEntry[] = [];
  let missing = 0;
  let skippedNoMeaning = 0;

  for (const [lemma, scopeSet] of [...scopesByLemma.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const row = dictionaryByLemma.get(lemma);

    if (!row) {
      missing += 1;
      continue;
    }

    const entry = createEntry({
      lemma,
      row,
      scopes: uniqueSortedScopes(scopeSet),
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
    sourceCandidates: scopesByLemma.size,
    dictionaryRows: dictionaryByLemma.size,
    missing,
    skippedNoMeaning,
    byScope: Object.fromEntries(
      scopeOrder.map((scope) => [
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
