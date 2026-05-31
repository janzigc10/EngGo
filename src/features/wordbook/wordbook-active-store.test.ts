// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  activeWordbookStorageKey,
  loadActiveWordbook,
  loadActiveWordbookId,
  saveActiveWordbookId,
  subscribeActiveWordbookChanges,
} from "@/features/wordbook/wordbook-active-store";

describe("active wordbook store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to the registered CET-6 foundation wordbook", () => {
    expect(loadActiveWordbookId()).toBe("cet6-foundation-v1");
    expect(loadActiveWordbook().label).toBe("CET-6 基础词书 V1");
  });

  it("falls back when storage contains an unsupported wordbook id", () => {
    window.localStorage.setItem(activeWordbookStorageKey, "__missing__");

    expect(loadActiveWordbookId()).toBe("cet6-foundation-v1");
  });

  it("persists and notifies active wordbook changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActiveWordbookChanges(listener);

    saveActiveWordbookId("cet6-foundation-v1");

    expect(window.localStorage.getItem(activeWordbookStorageKey)).toBe(
      "cet6-foundation-v1",
    );
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
