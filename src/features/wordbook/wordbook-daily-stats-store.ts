"use client";

import { isKnownWordbookId } from "@/features/wordbook/wordbook-data";
import type {
  StudyMode,
  WordbookId,
  WordStudyProgress,
} from "@/features/wordbook/wordbook-types";

export const wordbookDailyStatsStorageKey = "enggo.wordbookDailyStats.v1";

export type WordbookDailyStatsRecord = {
  date: string;
  wordbookId: WordbookId;
  learnActivityCount: number;
  learnCompletedCount: number;
  reviewActivityCount: number;
  reviewCompletedCount: number;
  learnActivityLemmas: string[];
  learnCompletedLemmas: string[];
  reviewActivityLemmas: string[];
  reviewCompletedLemmas: string[];
  updatedAt: string;
};

export type WordbookDailyActivityDay = WordbookDailyStatsRecord & {
  label: string;
  totalActivityCount: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type DailyStatsListener = () => void;

type RecordKey = `${string}:${WordbookId}`;

const listeners = new Set<DailyStatsListener>();
let dailyStatsVersion = 0;

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function notifyDailyStatsListeners() {
  dailyStatsVersion += 1;
  listeners.forEach((listener) => listener());
}

export function getWordbookDailyStatsSnapshot() {
  return String(dailyStatsVersion);
}

export function getServerWordbookDailyStatsSnapshot() {
  return "server";
}

export function subscribeWordbookDailyStatsChanges(
  listener: DailyStatsListener,
) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function normalizeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function normalizeLemma(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeLemmaList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map(normalizeLemma).filter(Boolean))).sort();
}

function normalizeIsoDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeDateKey(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map((part) => Number(part));
  const localDate = new Date(year, month - 1, day);

  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    return null;
  }

  return value;
}

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getRecordKey(record: Pick<WordbookDailyStatsRecord, "date" | "wordbookId">): RecordKey {
  return `${record.date}:${record.wordbookId}`;
}

function createEmptyRecord(
  date: string,
  wordbookId: WordbookId,
  updatedAt: string,
): WordbookDailyStatsRecord {
  return {
    date,
    wordbookId,
    learnActivityCount: 0,
    learnCompletedCount: 0,
    reviewActivityCount: 0,
    reviewCompletedCount: 0,
    learnActivityLemmas: [],
    learnCompletedLemmas: [],
    reviewActivityLemmas: [],
    reviewCompletedLemmas: [],
    updatedAt,
  };
}

function mergeLemmaLists(left: string[], right: string[]) {
  return Array.from(new Set([...left, ...right])).sort();
}

function getLegacyCountBase(count: number, lemmas: string[]) {
  return Math.max(0, count - lemmas.length);
}

function mergeRecord(
  left: WordbookDailyStatsRecord,
  right: WordbookDailyStatsRecord,
): WordbookDailyStatsRecord {
  const learnActivityLemmas = mergeLemmaLists(
    left.learnActivityLemmas,
    right.learnActivityLemmas,
  );
  const learnCompletedLemmas = mergeLemmaLists(
    left.learnCompletedLemmas,
    right.learnCompletedLemmas,
  );
  const reviewActivityLemmas = mergeLemmaLists(
    left.reviewActivityLemmas,
    right.reviewActivityLemmas,
  );
  const reviewCompletedLemmas = mergeLemmaLists(
    left.reviewCompletedLemmas,
    right.reviewCompletedLemmas,
  );

  return {
    date: left.date,
    wordbookId: left.wordbookId,
    learnActivityCount:
      getLegacyCountBase(left.learnActivityCount, left.learnActivityLemmas) +
      getLegacyCountBase(right.learnActivityCount, right.learnActivityLemmas) +
      learnActivityLemmas.length,
    learnCompletedCount:
      getLegacyCountBase(left.learnCompletedCount, left.learnCompletedLemmas) +
      getLegacyCountBase(right.learnCompletedCount, right.learnCompletedLemmas) +
      learnCompletedLemmas.length,
    reviewActivityCount:
      getLegacyCountBase(left.reviewActivityCount, left.reviewActivityLemmas) +
      getLegacyCountBase(right.reviewActivityCount, right.reviewActivityLemmas) +
      reviewActivityLemmas.length,
    reviewCompletedCount:
      getLegacyCountBase(left.reviewCompletedCount, left.reviewCompletedLemmas) +
      getLegacyCountBase(right.reviewCompletedCount, right.reviewCompletedLemmas) +
      reviewCompletedLemmas.length,
    learnActivityLemmas,
    learnCompletedLemmas,
    reviewActivityLemmas,
    reviewCompletedLemmas,
    updatedAt: left.updatedAt > right.updatedAt ? left.updatedAt : right.updatedAt,
  };
}

function normalizeDailyStatsRecord(
  value: unknown,
): WordbookDailyStatsRecord | null {
  if (!isRecord(value) || !isKnownWordbookId(value.wordbookId)) {
    return null;
  }

  const date = normalizeDateKey(value.date);
  const updatedAt = normalizeIsoDate(value.updatedAt) ?? new Date(0).toISOString();

  if (!date) {
    return null;
  }

  const learnActivityLemmas = normalizeLemmaList(value.learnActivityLemmas);
  const learnCompletedLemmas = normalizeLemmaList(value.learnCompletedLemmas);
  const reviewActivityLemmas = normalizeLemmaList(value.reviewActivityLemmas);
  const reviewCompletedLemmas = normalizeLemmaList(value.reviewCompletedLemmas);

  return {
    date,
    wordbookId: value.wordbookId,
    learnActivityCount: Math.max(
      normalizeCount(value.learnActivityCount),
      learnActivityLemmas.length,
    ),
    learnCompletedCount: Math.max(
      normalizeCount(value.learnCompletedCount),
      learnCompletedLemmas.length,
    ),
    reviewActivityCount: Math.max(
      normalizeCount(value.reviewActivityCount),
      reviewActivityLemmas.length,
    ),
    reviewCompletedCount: Math.max(
      normalizeCount(value.reviewCompletedCount),
      reviewCompletedLemmas.length,
    ),
    learnActivityLemmas,
    learnCompletedLemmas,
    reviewActivityLemmas,
    reviewCompletedLemmas,
    updatedAt,
  };
}

function mergeDailyStatsRecords(records: WordbookDailyStatsRecord[]) {
  const merged = new Map<RecordKey, WordbookDailyStatsRecord>();

  for (const record of records) {
    const key = getRecordKey(record);
    const existing = merged.get(key);

    merged.set(key, existing ? mergeRecord(existing, record) : record);
  }

  return Array.from(merged.values()).sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.wordbookId.localeCompare(right.wordbookId),
  );
}

function readDailyStatsRecords(storage: StorageLike | null) {
  if (!storage) {
    return [];
  }

  const rawValue = storage.getItem(wordbookDailyStatsStorageKey);

  if (!rawValue) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);
    const rawRecords = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.records)
        ? parsed.records
        : [];

    return mergeDailyStatsRecords(
      rawRecords
        .map((item) => normalizeDailyStatsRecord(item))
        .filter((item): item is WordbookDailyStatsRecord => item !== null),
    );
  } catch {
    return [];
  }
}

function writeDailyStatsRecords(
  storage: StorageLike | null,
  records: WordbookDailyStatsRecord[],
) {
  if (!storage) {
    return;
  }

  storage.setItem(
    wordbookDailyStatsStorageKey,
    JSON.stringify({ records: mergeDailyStatsRecords(records) }),
  );
}

function getLemmaKey(lemma: string) {
  return lemma.trim().toLowerCase();
}

function getUniqueProgressUpdates(
  wordbookId: WordbookId,
  progressUpdates: WordStudyProgress[],
) {
  const updatesByLemma = new Map<string, WordStudyProgress>();

  for (const update of progressUpdates) {
    const lemmaKey = getLemmaKey(update.lemma);

    if (update.wordbookId !== wordbookId || !lemmaKey) {
      continue;
    }

    updatesByLemma.set(lemmaKey, update);
  }

  return Array.from(updatesByLemma.values());
}

export function loadWordbookDailyStats(
  resolveStorage: () => StorageLike | null = getStorage,
) {
  return readDailyStatsRecords(resolveStorage());
}

export function recordWordbookDailyActivity(
  input: {
    mode: StudyMode;
    wordbookId: WordbookId;
    progressUpdates: WordStudyProgress[];
    now?: Date;
  },
  resolveStorage: () => StorageLike | null = getStorage,
) {
  const storage = resolveStorage();
  const uniqueUpdates = getUniqueProgressUpdates(
    input.wordbookId,
    input.progressUpdates,
  );

  if (!storage || uniqueUpdates.length === 0) {
    return;
  }

  if (!isKnownWordbookId(input.wordbookId)) {
    return;
  }

  const now = input.now ?? new Date();
  const date = formatLocalDateKey(now);
  const updatedAt = now.toISOString();
  const existingRecords = readDailyStatsRecords(storage);
  const key = getRecordKey({ date, wordbookId: input.wordbookId });
  const baseRecord =
    existingRecords.find((record) => getRecordKey(record) === key) ??
    createEmptyRecord(date, input.wordbookId, updatedAt);
  const activityLemmas = uniqueUpdates
    .map((update) => getLemmaKey(update.lemma))
    .filter(Boolean);
  const completedLemmas = uniqueUpdates
    .filter((update) => update.status === "passed")
    .map((update) => getLemmaKey(update.lemma))
    .filter(Boolean);
  const nextLearnActivityLemmas =
    input.mode === "learn"
      ? mergeLemmaLists(baseRecord.learnActivityLemmas, activityLemmas)
      : baseRecord.learnActivityLemmas;
  const nextLearnCompletedLemmas =
    input.mode === "learn"
      ? mergeLemmaLists(baseRecord.learnCompletedLemmas, completedLemmas)
      : baseRecord.learnCompletedLemmas;
  const nextReviewActivityLemmas =
    input.mode === "review"
      ? mergeLemmaLists(baseRecord.reviewActivityLemmas, activityLemmas)
      : baseRecord.reviewActivityLemmas;
  const nextReviewCompletedLemmas =
    input.mode === "review"
      ? mergeLemmaLists(baseRecord.reviewCompletedLemmas, completedLemmas)
      : baseRecord.reviewCompletedLemmas;
  const nextRecord: WordbookDailyStatsRecord = {
    ...baseRecord,
    learnActivityCount:
      input.mode === "learn"
        ? getLegacyCountBase(
            baseRecord.learnActivityCount,
            baseRecord.learnActivityLemmas,
          ) + nextLearnActivityLemmas.length
        : baseRecord.learnActivityCount,
    learnCompletedCount:
      input.mode === "learn"
        ? getLegacyCountBase(
            baseRecord.learnCompletedCount,
            baseRecord.learnCompletedLemmas,
          ) + nextLearnCompletedLemmas.length
        : baseRecord.learnCompletedCount,
    reviewActivityCount:
      input.mode === "review"
        ? getLegacyCountBase(
            baseRecord.reviewActivityCount,
            baseRecord.reviewActivityLemmas,
          ) + nextReviewActivityLemmas.length
        : baseRecord.reviewActivityCount,
    reviewCompletedCount:
      input.mode === "review"
        ? getLegacyCountBase(
            baseRecord.reviewCompletedCount,
            baseRecord.reviewCompletedLemmas,
          ) + nextReviewCompletedLemmas.length
        : baseRecord.reviewCompletedCount,
    learnActivityLemmas: nextLearnActivityLemmas,
    learnCompletedLemmas: nextLearnCompletedLemmas,
    reviewActivityLemmas: nextReviewActivityLemmas,
    reviewCompletedLemmas: nextReviewCompletedLemmas,
    updatedAt,
  };

  writeDailyStatsRecords(storage, [
    ...existingRecords.filter((record) => getRecordKey(record) !== key),
    nextRecord,
  ]);
  notifyDailyStatsListeners();
}

function addLocalDays(date: Date, days: number) {
  const next = new Date(date);

  next.setDate(next.getDate() + days);
  return next;
}

function getDayLabel(dateKey: string) {
  const [, month, day] = dateKey.split("-");

  return `${month}/${day}`;
}

export function buildWordbookDailyActivitySeries({
  wordbookId,
  records = loadWordbookDailyStats(),
  now = new Date(),
  days = 7,
}: {
  wordbookId: WordbookId;
  records?: WordbookDailyStatsRecord[];
  now?: Date;
  days?: number;
}): WordbookDailyActivityDay[] {
  const normalizedDays = Math.max(1, Math.floor(days));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const recordsByDate = new Map(
    mergeDailyStatsRecords(records)
      .filter((record) => record.wordbookId === wordbookId)
      .map((record) => [record.date, record]),
  );

  return Array.from({ length: normalizedDays }, (_, index) => {
    const date = formatLocalDateKey(
      addLocalDays(today, index - normalizedDays + 1),
    );
    const record =
      recordsByDate.get(date) ??
      createEmptyRecord(date, wordbookId, new Date(0).toISOString());

    return {
      ...record,
      label: getDayLabel(date),
      totalActivityCount:
        record.learnActivityCount + record.reviewActivityCount,
    };
  });
}
