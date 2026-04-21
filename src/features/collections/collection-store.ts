import {
  isExamTargetCode,
  type ExamTargetCode,
} from "@/features/exam-target/model";

const collectionStorageKey = "enggo.collectedWords";

export type CollectedWordInput = {
  lemma: string;
  note: string;
};

export type CollectedWord = CollectedWordInput & {
  examTarget: ExamTargetCode;
  collectedAt: string;
};

type CollectionBuckets = Partial<Record<ExamTargetCode, CollectedWord[]>>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

type CollectionRepository = {
  addCollectedWord(
    examTarget: ExamTargetCode,
    word: CollectedWordInput,
  ): CollectedWord;
  listCollectedWords(examTarget: ExamTargetCode): CollectedWord[];
};

type CollectionListener = () => void;

const listeners = new Set<CollectionListener>();

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeCollectedWord(
  value: unknown,
  examTarget: ExamTargetCode,
): CollectedWord | null {
  if (!isRecord(value)) {
    return null;
  }

  const lemma = typeof value.lemma === "string" ? value.lemma.trim() : "";
  const note = typeof value.note === "string" ? value.note.trim() : "";

  if (!lemma || !note) {
    return null;
  }

  return {
    examTarget,
    lemma,
    note,
    collectedAt:
      typeof value.collectedAt === "string"
        ? value.collectedAt
        : new Date(0).toISOString(),
  };
}

function normalizeCollectedWordsBucket(
  value: unknown,
  examTarget: ExamTargetCode,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeCollectedWord(item, examTarget))
    .filter((item): item is CollectedWord => item !== null);
}

function readBuckets(storage: StorageLike | null): CollectionBuckets {
  if (!storage) {
    return {};
  }

  const rawValue = storage.getItem(collectionStorageKey);

  if (!rawValue) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);

    if (!isRecord(parsed)) {
      return {};
    }

    const buckets: CollectionBuckets = {};

    for (const key of Object.keys(parsed)) {
      if (!isExamTargetCode(key)) {
        continue;
      }

      buckets[key] = normalizeCollectedWordsBucket(parsed[key], key);
    }

    return buckets;
  } catch {
    return {};
  }
}

function writeBuckets(storage: StorageLike | null, buckets: CollectionBuckets) {
  if (!storage) {
    return;
  }

  storage.setItem(collectionStorageKey, JSON.stringify(buckets));
}

function notifyCollectionListeners() {
  listeners.forEach((listener) => listener());
}

export function subscribeCollectionChanges(listener: CollectionListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function createCollectionRepository(
  resolveStorage: () => StorageLike | null = getStorage,
): CollectionRepository {
  return {
    addCollectedWord(examTarget, word) {
      const storage = resolveStorage();
      const buckets = readBuckets(storage);
      const nextCollectedWord: CollectedWord = {
        examTarget,
        lemma: word.lemma.trim(),
        note: word.note.trim(),
        collectedAt: new Date().toISOString(),
      };
      const existingWords = buckets[examTarget] ?? [];
      const nextWords = [
        ...existingWords.filter((item) => item.lemma !== nextCollectedWord.lemma),
        nextCollectedWord,
      ];

      buckets[examTarget] = nextWords;
      writeBuckets(storage, buckets);
      notifyCollectionListeners();

      return nextCollectedWord;
    },
    listCollectedWords(examTarget) {
      const storage = resolveStorage();
      const buckets = readBuckets(storage);

      return buckets[examTarget] ?? [];
    },
  };
}

const collectionRepository = createCollectionRepository();

export function addCollectedWord(
  examTarget: ExamTargetCode,
  word: CollectedWordInput,
) {
  return collectionRepository.addCollectedWord(examTarget, word);
}

export function listCollectedWords(examTarget: ExamTargetCode) {
  return collectionRepository.listCollectedWords(examTarget);
}
