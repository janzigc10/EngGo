import type {
  StudySessionGoal,
  WordbookStudySettings,
} from "@/features/wordbook/wordbook-types";

export const wordbookStudySettingsStorageKey = "enggo.wordbookStudySettings.v1";

export const defaultWordbookStudySettings: WordbookStudySettings = Object.freeze({
  learnTargetCount: 10,
  reviewTargetCount: 10,
});

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type SettingsListener = () => void;

const listeners = new Set<SettingsListener>();
let settingsVersion = 0;

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeStudySessionGoal(value: unknown): StudySessionGoal {
  return value === 10 || value === 20 || value === 30 ? value : 10;
}

function cloneSettings(settings: WordbookStudySettings): WordbookStudySettings {
  return {
    learnTargetCount: settings.learnTargetCount,
    reviewTargetCount: settings.reviewTargetCount,
  };
}

function normalizeSettings(value: unknown): WordbookStudySettings {
  if (!isRecord(value)) {
    return cloneSettings(defaultWordbookStudySettings);
  }

  return {
    learnTargetCount: normalizeStudySessionGoal(value.learnTargetCount),
    reviewTargetCount: normalizeStudySessionGoal(value.reviewTargetCount),
  };
}

function notifySettingsListeners() {
  settingsVersion += 1;
  listeners.forEach((listener) => listener());
}

export function loadWordbookStudySettings(
  resolveStorage: () => StorageLike | null = getStorage,
): WordbookStudySettings {
  const storage = resolveStorage();

  if (!storage) {
    return cloneSettings(defaultWordbookStudySettings);
  }

  const rawValue = storage.getItem(wordbookStudySettingsStorageKey);

  if (!rawValue) {
    return cloneSettings(defaultWordbookStudySettings);
  }

  try {
    return normalizeSettings(JSON.parse(rawValue));
  } catch {
    return cloneSettings(defaultWordbookStudySettings);
  }
}

export function saveWordbookStudySettings(
  settings: WordbookStudySettings,
  resolveStorage: () => StorageLike | null = getStorage,
) {
  const storage = resolveStorage();
  const normalized = normalizeSettings(settings);

  if (storage) {
    storage.setItem(wordbookStudySettingsStorageKey, JSON.stringify(normalized));
  }

  notifySettingsListeners();
}

export function subscribeWordbookStudySettings(listener: SettingsListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getWordbookStudySettingsSnapshot() {
  return String(settingsVersion);
}

export function getServerWordbookStudySettingsSnapshot() {
  return "0";
}
