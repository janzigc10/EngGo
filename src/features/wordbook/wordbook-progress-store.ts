import type {
  MasteryDots,
  ReviewStrength,
  Wordbook,
  WordbookEntry,
  WordbookId,
  WordStudyProgress,
} from "@/features/wordbook/wordbook-types";

export const wordbookProgressStorageKey = "enggo.wordbookProgress.v1";
export const activeWordbookStorageKey = "enggo.activeWordbook.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type ProgressListener = () => void;

export type WordbookProgressSnapshot = {
  total: number;
  passed: number;
  learnable: number;
  dueReview: number;
  blocked: number;
};

const listeners = new Set<ProgressListener>();
let progressVersion = 0;

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWordbookId(value: unknown): value is WordbookId {
  return value === "cet6-foundation-v1";
}

function normalizeDots(value: unknown): MasteryDots {
  return value === 1 || value === 2 || value === 3 ? value : 0;
}

function normalizeReviewStrength(value: unknown): ReviewStrength {
  return value === 1 || value === 2 || value === 3 ? value : 0;
}

function normalizeStatus(value: unknown): WordStudyProgress["status"] {
  if (
    value === "learning" ||
    value === "passed" ||
    value === "reviewing" ||
    value === "lapsed" ||
    value === "blockedContent"
  ) {
    return value;
  }

  return "unseen";
}

function normalizeOptionalDate(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeProgress(value: unknown): WordStudyProgress | null {
  if (!isRecord(value) || !isWordbookId(value.wordbookId)) {
    return null;
  }

  const lemma = typeof value.lemma === "string" ? value.lemma.trim() : "";
  const updatedAt = normalizeOptionalDate(value.updatedAt) ?? new Date(0).toISOString();

  if (!lemma) {
    return null;
  }

  return {
    wordbookId: value.wordbookId,
    lemma,
    status: normalizeStatus(value.status),
    masteryDots: normalizeDots(value.masteryDots),
    reviewStrength: normalizeReviewStrength(value.reviewStrength),
    seenCount: typeof value.seenCount === "number" ? Math.max(0, value.seenCount) : 0,
    correctCount:
      typeof value.correctCount === "number" ? Math.max(0, value.correctCount) : 0,
    wrongCount:
      typeof value.wrongCount === "number" ? Math.max(0, value.wrongCount) : 0,
    lastSeenAt: normalizeOptionalDate(value.lastSeenAt),
    nextReviewAt: normalizeOptionalDate(value.nextReviewAt),
    updatedAt,
  };
}

function readProgressRecords(storage: StorageLike | null): WordStudyProgress[] {
  if (!storage) {
    return [];
  }

  const rawValue = storage.getItem(wordbookProgressStorageKey);

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

    return rawRecords
      .map((item) => normalizeProgress(item))
      .filter((item): item is WordStudyProgress => item !== null);
  } catch {
    return [];
  }
}

function writeProgressRecords(
  storage: StorageLike | null,
  records: WordStudyProgress[],
) {
  if (!storage) {
    return;
  }

  storage.setItem(wordbookProgressStorageKey, JSON.stringify({ records }));
}

function getLemmaKey(lemma: string) {
  return lemma.trim().toLowerCase();
}

function notifyProgressListeners() {
  progressVersion += 1;
  listeners.forEach((listener) => listener());
}

export function getWordbookProgressVersion() {
  return String(progressVersion);
}

export function subscribeWordbookProgressChanges(listener: ProgressListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function loadProgressRecords(
  resolveStorage: () => StorageLike | null = getStorage,
): WordStudyProgress[] {
  return readProgressRecords(resolveStorage());
}

export function saveWordProgress(
  progress: WordStudyProgress,
  resolveStorage: () => StorageLike | null = getStorage,
) {
  const storage = resolveStorage();
  const records = readProgressRecords(storage);
  const nextKey = `${progress.wordbookId}:${getLemmaKey(progress.lemma)}`;
  const nextRecords = [
    ...records.filter(
      (record) => `${record.wordbookId}:${getLemmaKey(record.lemma)}` !== nextKey,
    ),
    progress,
  ];

  writeProgressRecords(storage, nextRecords);
  notifyProgressListeners();
}

export function createDefaultProgress(
  entry: WordbookEntry,
  wordbookId: WordbookId = "cet6-foundation-v1",
  now: Date = new Date(),
): WordStudyProgress {
  return {
    wordbookId,
    lemma: entry.lemma,
    status: "unseen",
    masteryDots: 0,
    reviewStrength: 0,
    seenCount: 0,
    correctCount: 0,
    wrongCount: 0,
    updatedAt: now.toISOString(),
  };
}

export function getProgressForEntry(
  entry: WordbookEntry,
  records: WordStudyProgress[] = loadProgressRecords(),
  now: Date = new Date(),
): WordStudyProgress {
  const lemmaKey = getLemmaKey(entry.lemma);
  const existing = records.find(
    (record) =>
      record.wordbookId === "cet6-foundation-v1" &&
      getLemmaKey(record.lemma) === lemmaKey,
  );

  return existing ?? createDefaultProgress(entry, "cet6-foundation-v1", now);
}

export function getNextReviewAt(now: Date, reviewStrength: ReviewStrength): string {
  const dayOffsets: Record<ReviewStrength, number> = {
    0: 0,
    1: 1,
    2: 3,
    3: 7,
  };
  const next = new Date(now);

  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + dayOffsets[reviewStrength]);

  return next.toISOString();
}

export function buildWordbookProgressSnapshot(
  wordbook: Wordbook,
  now: Date = new Date(),
  records: WordStudyProgress[] = loadProgressRecords(),
): WordbookProgressSnapshot {
  return wordbook.entries.reduce<WordbookProgressSnapshot>(
    (snapshot, entry) => {
      const progress = getProgressForEntry(entry, records, now);
      const dueAt = progress.nextReviewAt ? new Date(progress.nextReviewAt) : null;
      const isDue = dueAt !== null && dueAt.getTime() <= now.getTime();

      snapshot.total += 1;

      if (progress.status === "blockedContent") {
        snapshot.blocked += 1;
        return snapshot;
      }

      if (progress.status === "passed" || progress.status === "reviewing") {
        snapshot.passed += 1;
      }

      if (
        progress.status === "unseen" ||
        progress.status === "learning" ||
        progress.status === "lapsed"
      ) {
        snapshot.learnable += 1;
      }

      if (
        progress.status === "lapsed" ||
        ((progress.status === "passed" || progress.status === "reviewing") && isDue)
      ) {
        snapshot.dueReview += 1;
      }

      return snapshot;
    },
    {
      total: 0,
      passed: 0,
      learnable: 0,
      dueReview: 0,
      blocked: 0,
    },
  );
}
