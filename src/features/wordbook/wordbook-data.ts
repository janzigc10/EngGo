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

export function getDefaultWordbook(): Wordbook {
  return defaultWordbook;
}

export function listWordbookEntries(): WordbookEntry[] {
  return defaultWordbook.entries;
}

export function findWordbookEntry(lemma: string): WordbookEntry | undefined {
  const normalizedLemma = lemma.trim().toLowerCase();

  return defaultWordbook.entries.find(
    (entry) =>
      entry.lemma.toLowerCase() === normalizedLemma ||
      entry.aliases.some((alias) => alias.toLowerCase() === normalizedLemma),
  );
}
