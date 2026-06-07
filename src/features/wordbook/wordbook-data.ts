import rawEntries from "../../../data/exam-vocab/ecdict-wordbook/entries.json";

import type { ExamTargetCode } from "@/features/exam-target/model";
import {
  hasScopeInExamTargetClosure,
  scopeCodesFromEcdictTags,
} from "@/features/exam-target/scope-closure";
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

  if (!lemma || meaningsZh.length === 0 || examScopes.length === 0) {
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

const allEntries = (rawEntries as RawEntry[])
  .map((entry) => normalizeEntry(entry))
  .filter((entry): entry is WordbookEntry => entry !== null)
  .sort((left, right) => left.lemma.localeCompare(right.lemma));

const wordbookConfigs = [
  {
    id: "gaokao-foundation-v1",
    examTarget: "gaokao",
    label: "高考 ECDICT 基础词书 V1",
  },
  {
    id: "cet4-foundation-v1",
    examTarget: "cet4",
    label: "CET-4 ECDICT 基础词书 V1",
  },
  {
    id: "cet6-foundation-v1",
    examTarget: "cet6",
    label: "CET-6 ECDICT 基础词书 V1",
  },
  {
    id: "postgrad-foundation-v1",
    examTarget: "postgrad",
    label: "考研 ECDICT 基础词书 V1",
  },
] as const satisfies readonly {
  id: WordbookId;
  examTarget: ExamTargetCode;
  label: string;
}[];

function buildWordbook(config: (typeof wordbookConfigs)[number]): Wordbook {
  return {
    id: config.id,
    examTarget: config.examTarget,
    label: config.label,
    sourceLabel: "基于 ECDICT exam tags 的 compact entries",
    entries: allEntries.filter((entry) =>
      hasScopeInExamTargetClosure(entry.examScopes, config.examTarget),
    ),
  };
}

const wordbookRegistry: Wordbook[] = wordbookConfigs.map((config) => buildWordbook(config));
const defaultWordbook = getWordbookById(defaultWordbookId);

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
  return (
    wordbookRegistry.find((wordbook) => wordbook.id === wordbookId)
    ?? wordbookRegistry.find((wordbook) => wordbook.id === defaultWordbookId)
    ?? wordbookRegistry[0]
  );
}

export function getDefaultWordbook(): Wordbook {
  return getWordbookById(defaultWordbookId);
}

export function listWordbookEntries(wordbookId: WordbookId = defaultWordbookId): WordbookEntry[] {
  return getWordbookById(wordbookId).entries;
}

export function getWordbookByExamTarget(examTarget: ExamTargetCode): Wordbook {
  return wordbookRegistry.find((wordbook) => wordbook.examTarget === examTarget) ?? defaultWordbook;
}

export function getWordbookIdForExamTarget(examTarget: ExamTargetCode): WordbookId {
  return getWordbookByExamTarget(examTarget).id;
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

export { scopeCodesFromEcdictTags };
