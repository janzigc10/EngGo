import {
  defaultExamTarget,
  isExamTargetCode,
  type ExamTargetCode,
} from "@/features/exam-target/model";

export const examTargetStorageKey = "enggo.activeExamTarget";
const listeners = new Set<() => void>();

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function readStoredExamTarget() {
  const storage = getStorage();

  if (!storage) {
    return defaultExamTarget;
  }

  const storedValue = storage.getItem(examTargetStorageKey);

  if (!storedValue || !isExamTargetCode(storedValue)) {
    return defaultExamTarget;
  }

  return storedValue;
}

export function persistExamTarget(examTarget: ExamTargetCode) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(examTargetStorageKey, examTarget);
  listeners.forEach((listener) => listener());
}

export function subscribeExamTarget(listener: () => void) {
  listeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      listeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === examTargetStorageKey) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function getServerExamTargetSnapshot() {
  return defaultExamTarget;
}
