import type {
  MasteryDots,
  Wordbook,
  WordbookEntry,
  WordbookId,
  WordStudyProgress,
} from "@/features/wordbook/wordbook-types";
import { isKnownWordbookId } from "@/features/wordbook/wordbook-data";
import { getDueReviewTime } from "@/features/wordbook/wordbook-review-scheduling";

export { getNextReviewAt } from "@/features/wordbook/wordbook-review-scheduling";

export const wordbookProgressStorageKey = "enggo.wordbookProgress.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type ProgressListener = () => void;

export type WordbookProgressSnapshot = {
  total: number;
  passed: number;
  learnable: number;
  unseen: number;
  learning: number;
  dueReview: number;
  reviewRescue: number;
  scheduledReview: number;
  blocked: number;
};

export type WordbookProgressExplanation = {
  key: "unseen" | "learning" | "dueReview" | "reviewRescue" | "scheduledReview" | "blocked";
  label: string;
  value: number;
  description: string;
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
  return isKnownWordbookId(value);
}

function normalizeDots(value: unknown): MasteryDots {
  return value === 1 || value === 2 || value === 3 ? value : 0;
}

function normalizeReviewStrength(value: unknown): WordStudyProgress["reviewStrength"] {
  return value === 1 || value === 2 || value === 3 ? value : 0;
}

function normalizeStatus(value: unknown): WordStudyProgress["status"] {
  if (
    value === "learning" ||
    value === "passed" ||
    value === "reviewing" ||
    value === "lapsed" ||
    value === "reviewLapsed" ||
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
  wordbookId: WordbookId = "cet6-foundation-v1",
): WordStudyProgress {
  const lemmaKey = getLemmaKey(entry.lemma);
  const existing = records.find(
    (record) =>
      record.wordbookId === wordbookId &&
      getLemmaKey(record.lemma) === lemmaKey,
  );

  return existing ?? createDefaultProgress(entry, wordbookId, now);
}

export function buildWordbookProgressSnapshot(
  wordbook: Wordbook,
  now: Date = new Date(),
  records: WordStudyProgress[] = loadProgressRecords(),
): WordbookProgressSnapshot {
  return wordbook.entries.reduce<WordbookProgressSnapshot>(
    (snapshot, entry) => {
      const progress = getProgressForEntry(entry, records, now, wordbook.id);
      const isDue = getDueReviewTime(progress, now) !== null;

      snapshot.total += 1;

      if (progress.status === "blockedContent") {
        snapshot.blocked += 1;
        return snapshot;
      }

      if (progress.status === "passed" || progress.status === "reviewing") {
        snapshot.passed += 1;
      }

      if (progress.status === "unseen") {
        snapshot.unseen += 1;
        snapshot.learnable += 1;
      }

      if (progress.status === "learning") {
        snapshot.learning += 1;
        snapshot.learnable += 1;
      }

      if (
        progress.status === "lapsed" ||
        progress.status === "reviewLapsed" ||
        ((progress.status === "passed" || progress.status === "reviewing") && isDue)
      ) {
        snapshot.dueReview += 1;
      }

      if (progress.status === "lapsed" || progress.status === "reviewLapsed") {
        snapshot.reviewRescue += 1;
      }

      if (
        (progress.status === "passed" || progress.status === "reviewing") &&
        !isDue
      ) {
        snapshot.scheduledReview += 1;
      }

      return snapshot;
    },
    {
      total: 0,
      passed: 0,
      learnable: 0,
      unseen: 0,
      learning: 0,
      dueReview: 0,
      reviewRescue: 0,
      scheduledReview: 0,
      blocked: 0,
    },
  );
}

export function buildWordbookProgressExplanations(
  snapshot: WordbookProgressSnapshot,
): WordbookProgressExplanation[] {
  return [
    {
      key: "unseen",
      label: "未学习",
      value: snapshot.unseen,
      description: "还没有进入 Learn session 的词。",
    },
    {
      key: "learning",
      label: "学习中",
      value: snapshot.learning,
      description: "已经开始 Learn，但还没有完成三灯确认。",
    },
    {
      key: "dueReview",
      label: "待复习",
      value: snapshot.dueReview,
      description: "今天需要 Review 的词，包含到期词和补救词。",
    },
    {
      key: "reviewRescue",
      label: "补救中",
      value: snapshot.reviewRescue,
      description: "Review 里失误后仍留在 Review 队列的词。",
    },
    {
      key: "scheduledReview",
      label: "未到期",
      value: snapshot.scheduledReview,
      description: "已经阶段性通过，下一次复习时间还没到。",
    },
    {
      key: "blocked",
      label: "内容不足",
      value: snapshot.blocked,
      description: "缺少足够选项或教学内容，暂时跳过的词。",
    },
  ];
}
