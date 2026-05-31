import rawEntries from "../../../data/exam-vocab/real-smoke/entries.json";

import type { ExamTargetCode } from "@/features/exam-target/model";
import type { Wordbook, WordbookEntry, WordbookId } from "@/features/wordbook/wordbook-types";

export const defaultWordbookId: WordbookId = "cet6-foundation-v1";

type RawEntry = {
  id?: unknown;
  lemma?: unknown;
  aliases?: unknown;
  pos?: unknown;
  meaningsZh?: unknown;
  examScopes?: unknown;
  examples?: unknown;
  collocations?: unknown;
};

const examTargetCodes = new Set<ExamTargetCode>([
  "gaokao",
  "cet4",
  "cet6",
  "postgrad",
]);

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTextList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => normalizeText(item))
        .filter((item) => item.length > 0),
    ),
  );
}

function normalizeExamScopes(value: unknown): ExamTargetCode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is ExamTargetCode =>
      typeof item === "string" && examTargetCodes.has(item as ExamTargetCode),
  );
}

function normalizeEntry(value: RawEntry): WordbookEntry | null {
  const lemma = normalizeText(value.lemma);
  const meaningsZh = normalizeTextList(value.meaningsZh);
  const examScopes = normalizeExamScopes(value.examScopes);

  if (!lemma || meaningsZh.length === 0 || !examScopes.includes("cet6")) {
    return null;
  }

  return {
    id: normalizeText(value.id) || lemma,
    lemma,
    aliases: normalizeTextList(value.aliases),
    pos: normalizeTextList(value.pos),
    meaningsZh,
    examScopes,
    examples: normalizeTextList(value.examples),
    collocations: normalizeTextList(value.collocations),
  };
}

const defaultWordbook: Wordbook = {
  id: defaultWordbookId,
  label: "CET-6 基础词书 V1",
  sourceLabel: "基于 EngGo real-smoke source-backed entries",
  entries: (rawEntries as RawEntry[])
    .map((entry) => normalizeEntry(entry))
    .filter((entry): entry is WordbookEntry => entry !== null)
    .sort((left, right) => left.lemma.localeCompare(right.lemma)),
};

const wordbookRegistry: Wordbook[] = [defaultWordbook];

export function isKnownWordbookId(value: unknown): value is WordbookId {
  return typeof value === "string" && wordbookRegistry.some((wordbook) => wordbook.id === value);
}

export function normalizeWordbookId(value: unknown): WordbookId {
  return isKnownWordbookId(value) ? value : defaultWordbookId;
}

export function listWordbooks(): Wordbook[] {
  return wordbookRegistry;
}

export function getWordbookById(wordbookId: WordbookId = defaultWordbookId): Wordbook {
  return wordbookRegistry.find((wordbook) => wordbook.id === wordbookId) ?? defaultWordbook;
}

export function getDefaultWordbook(): Wordbook {
  return getWordbookById(defaultWordbookId);
}

export function listWordbookEntries(wordbookId: WordbookId = defaultWordbookId): WordbookEntry[] {
  return getWordbookById(wordbookId).entries;
}

export function findWordbookEntry(
  lemma: string,
  wordbookId: WordbookId = defaultWordbookId,
): WordbookEntry | undefined {
  const normalizedLemma = lemma.trim().toLowerCase();
  const wordbook = getWordbookById(wordbookId);

  return wordbook.entries.find(
    (entry) =>
      entry.lemma.toLowerCase() === normalizedLemma ||
      entry.aliases.some((alias) => alias.toLowerCase() === normalizedLemma),
  );
}
