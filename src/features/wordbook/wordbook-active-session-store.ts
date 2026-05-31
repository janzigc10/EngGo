"use client";

import { isKnownWordbookId } from "@/features/wordbook/wordbook-data";
import type {
  StudyCardStage,
  StudyMode,
  StudySessionGoal,
  StudySessionState,
  StudySessionTarget,
  WordbookId,
} from "@/features/wordbook/wordbook-types";

export const activeStudySessionStorageKey = "enggo.activeStudySessions.v1";

const activeStudySessionVersion = 1;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type ActiveSessionListener = () => void;

export type ActiveStudySessionSnapshot = {
  version: typeof activeStudySessionVersion;
  mode: StudyMode;
  wordbookId: WordbookId;
  targetCount: StudySessionGoal;
  sessionId: string;
  startedAt: string;
  updatedAt: string;
  state: StudySessionState;
};

type ActiveSessionQuery = {
  mode: StudyMode;
  wordbookId: WordbookId;
};

type SaveActiveSessionInput = ActiveSessionQuery & {
  targetCount: StudySessionGoal;
  state: StudySessionState;
};

const listeners = new Set<ActiveSessionListener>();
let activeSessionVersion = 0;

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function notifyActiveSessionListeners() {
  activeSessionVersion += 1;
  listeners.forEach((listener) => listener());
}

export function getActiveStudySessionVersion() {
  return String(activeSessionVersion);
}

export function getServerActiveStudySessionSnapshot() {
  return "server";
}

export function subscribeActiveStudySessionChanges(
  listener: ActiveSessionListener,
) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStudyMode(value: unknown): value is StudyMode {
  return value === "learn" || value === "review";
}

function isStudySessionGoal(value: unknown): value is StudySessionGoal {
  return value === 10 || value === 20 || value === 30;
}

function isStudyCardStage(value: unknown): value is StudyCardStage {
  return (
    value === "recognitionChoice" ||
    value === "wrongChoiceContrast" ||
    value === "detailReveal" ||
    value === "guidedDetail" ||
    value === "passDetail" ||
    value === "answerReveal" ||
    value === "guidedRecall" ||
    value === "finalRecall" ||
    value === "hiddenSelfRecall" ||
    value === "reviewDetail" ||
    value === "fuzzyDetail" ||
    value === "forgotDetail" ||
    value === "complete"
  );
}

function isWordbookId(value: unknown): value is WordbookId {
  return isKnownWordbookId(value);
}

function normalizeIsoDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : null;
}

function normalizeTarget(value: unknown): StudySessionTarget | null {
  if (!isRecord(value) || !isRecord(value.entry) || !isRecord(value.progress)) {
    return null;
  }

  if (
    typeof value.entry.lemma !== "string" ||
    typeof value.progress.lemma !== "string" ||
    !isWordbookId(value.progress.wordbookId) ||
    !isStudyCardStage(value.resumeStage) ||
    typeof value.masteryDots !== "number" ||
    typeof value.failedAttempts !== "number" ||
    typeof value.eligibleAfterExposure !== "number"
  ) {
    return null;
  }

  return value as StudySessionTarget;
}

function normalizeTargetArray(value: unknown): StudySessionTarget[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const targets = value.map((item) => normalizeTarget(item));

  if (targets.some((item) => item === null)) {
    return null;
  }

  return targets as StudySessionTarget[];
}

function normalizeState(
  value: unknown,
  query: ActiveSessionQuery & { sessionId: string },
): StudySessionState | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.mode !== query.mode ||
    value.wordbookId !== query.wordbookId ||
    value.sessionId !== query.sessionId ||
    !isStudyCardStage(value.stage) ||
    value.stage === "complete" ||
    typeof value.totalTargets !== "number" ||
    value.totalTargets <= 0 ||
    typeof value.cardExposureCount !== "number"
  ) {
    return null;
  }

  const current = normalizeTarget(value.current);
  const pending = normalizeTargetArray(value.pending);
  const reserve = normalizeTargetArray(value.reserve);
  const completedTargetLemmas = normalizeStringArray(value.completedTargetLemmas);

  if (!current || !pending || !reserve || !completedTargetLemmas) {
    return null;
  }

  if (query.mode === "review") {
    if (current.countsTowardGoal === false) {
      return null;
    }

    return {
      ...(value as StudySessionState),
      current,
      pending: pending.filter((target) => target.countsTowardGoal !== false),
      reserve: [],
      completedTargetLemmas,
    };
  }

  return {
    ...(value as StudySessionState),
    current,
    pending,
    reserve,
    completedTargetLemmas,
  };
}

function normalizeSnapshot(value: unknown): ActiveStudySessionSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.version !== activeStudySessionVersion ||
    !isStudyMode(value.mode) ||
    !isWordbookId(value.wordbookId) ||
    !isStudySessionGoal(value.targetCount) ||
    typeof value.sessionId !== "string" ||
    value.sessionId.trim() === ""
  ) {
    return null;
  }

  const startedAt = normalizeIsoDate(value.startedAt);
  const updatedAt = normalizeIsoDate(value.updatedAt);
  const state = normalizeState(value.state, {
    mode: value.mode,
    wordbookId: value.wordbookId,
    sessionId: value.sessionId,
  });

  if (!startedAt || !updatedAt || !state) {
    return null;
  }

  return {
    version: activeStudySessionVersion,
    mode: value.mode,
    wordbookId: value.wordbookId,
    targetCount: value.targetCount,
    sessionId: value.sessionId,
    startedAt,
    updatedAt,
    state,
  };
}

function getSessionKey(query: ActiveSessionQuery) {
  return `${query.wordbookId}:${query.mode}`;
}

function readSnapshots(storage: StorageLike | null) {
  if (!storage) {
    return [];
  }

  const rawValue = storage.getItem(activeStudySessionStorageKey);

  if (!rawValue) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);
    const rawSessions =
      isRecord(parsed) && Array.isArray(parsed.sessions) ? parsed.sessions : [];

    return rawSessions
      .map((item) => normalizeSnapshot(item))
      .filter((item): item is ActiveStudySessionSnapshot => item !== null);
  } catch {
    return [];
  }
}

function writeSnapshots(
  storage: StorageLike | null,
  snapshots: ActiveStudySessionSnapshot[],
) {
  if (!storage) {
    return;
  }

  if (snapshots.length === 0) {
    storage.removeItem(activeStudySessionStorageKey);
    return;
  }

  storage.setItem(activeStudySessionStorageKey, JSON.stringify({ sessions: snapshots }));
}

export function loadActiveStudySession(
  query: ActiveSessionQuery,
  resolveStorage: () => StorageLike | null = getStorage,
) {
  const key = getSessionKey(query);

  return (
    readSnapshots(resolveStorage()).find(
      (snapshot) => getSessionKey(snapshot) === key,
    ) ?? null
  );
}

export function hasActiveStudySession(
  query: ActiveSessionQuery,
  resolveStorage: () => StorageLike | null = getStorage,
) {
  return loadActiveStudySession(query, resolveStorage) !== null;
}

export function saveActiveStudySession(
  input: SaveActiveSessionInput,
  resolveStorage: () => StorageLike | null = getStorage,
) {
  const storage = resolveStorage();

  if (!storage) {
    return;
  }

  if (input.state.stage === "complete" || input.state.totalTargets <= 0) {
    clearActiveStudySession(input, resolveStorage);
    return;
  }

  const now = new Date().toISOString();
  const key = getSessionKey(input);
  const existingSnapshots = readSnapshots(storage);
  const existing = existingSnapshots.find(
    (snapshot) => getSessionKey(snapshot) === key,
  );
  const candidate = normalizeSnapshot({
    version: activeStudySessionVersion,
    mode: input.mode,
    wordbookId: input.wordbookId,
    targetCount: input.targetCount,
    sessionId: input.state.sessionId,
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
    state: input.state,
  });

  if (!candidate) {
    clearActiveStudySession(input, resolveStorage);
    return;
  }

  writeSnapshots(storage, [
    ...existingSnapshots.filter((snapshot) => getSessionKey(snapshot) !== key),
    candidate,
  ]);
  notifyActiveSessionListeners();
}

export function clearActiveStudySession(
  query: ActiveSessionQuery,
  resolveStorage: () => StorageLike | null = getStorage,
) {
  const storage = resolveStorage();

  if (!storage) {
    return;
  }

  const key = getSessionKey(query);
  const nextSnapshots = readSnapshots(storage).filter(
    (snapshot) => getSessionKey(snapshot) !== key,
  );

  writeSnapshots(storage, nextSnapshots);
  notifyActiveSessionListeners();
}
