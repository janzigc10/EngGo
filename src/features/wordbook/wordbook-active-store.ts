"use client";

import {
  getWordbookById,
  normalizeWordbookId,
} from "@/features/wordbook/wordbook-data";
import type { Wordbook, WordbookId } from "@/features/wordbook/wordbook-types";

export const activeWordbookStorageKey = "enggo.activeWordbook.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type ActiveWordbookListener = () => void;

const listeners = new Set<ActiveWordbookListener>();
let activeWordbookVersion = 0;

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function notifyActiveWordbookListeners() {
  activeWordbookVersion += 1;
  listeners.forEach((listener) => listener());
}

export function getActiveWordbookVersion() {
  return String(activeWordbookVersion);
}

export function subscribeActiveWordbookChanges(listener: ActiveWordbookListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function loadActiveWordbookId(
  resolveStorage: () => StorageLike | null = getStorage,
): WordbookId {
  const storage = resolveStorage();

  return normalizeWordbookId(storage?.getItem(activeWordbookStorageKey));
}

export function saveActiveWordbookId(
  wordbookId: WordbookId,
  resolveStorage: () => StorageLike | null = getStorage,
) {
  const storage = resolveStorage();

  if (!storage) {
    return;
  }

  storage.setItem(activeWordbookStorageKey, wordbookId);
  notifyActiveWordbookListeners();
}

export function loadActiveWordbook(): Wordbook {
  return getWordbookById(loadActiveWordbookId());
}

export function getActiveWordbookSnapshot() {
  return loadActiveWordbookId();
}

export function getServerActiveWordbookSnapshot(): WordbookId {
  return normalizeWordbookId(null);
}
