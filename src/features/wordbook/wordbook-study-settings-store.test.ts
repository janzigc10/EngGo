// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  defaultWordbookStudySettings,
  getServerWordbookStudySettingsSnapshot,
  getWordbookStudySettingsSnapshot,
  loadWordbookStudySettings,
  saveWordbookStudySettings,
  subscribeWordbookStudySettings,
  wordbookStudySettingsStorageKey,
} from "@/features/wordbook/wordbook-study-settings-store";

describe("wordbook study settings store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns default settings when storage is missing", () => {
    expect(loadWordbookStudySettings()).toEqual({
      learnTargetCount: 10,
      reviewTargetCount: 10,
    });
    expect(loadWordbookStudySettings()).not.toBe(defaultWordbookStudySettings);
  });

  it("returns default settings for invalid JSON", () => {
    window.localStorage.setItem(wordbookStudySettingsStorageKey, "{not-json");

    expect(loadWordbookStudySettings()).toEqual(defaultWordbookStudySettings);
  });

  it("normalizes invalid values to defaults", () => {
    window.localStorage.setItem(
      wordbookStudySettingsStorageKey,
      JSON.stringify({
        learnTargetCount: 5,
        reviewTargetCount: "30",
      }),
    );

    expect(loadWordbookStudySettings()).toEqual({
      learnTargetCount: 10,
      reviewTargetCount: 10,
    });
  });

  it("persists and reloads saved 20/30 settings", () => {
    saveWordbookStudySettings({
      learnTargetCount: 20,
      reviewTargetCount: 30,
    });

    expect(window.localStorage.getItem(wordbookStudySettingsStorageKey)).toBe(
      JSON.stringify({
        learnTargetCount: 20,
        reviewTargetCount: 30,
      }),
    );
    expect(loadWordbookStudySettings()).toEqual({
      learnTargetCount: 20,
      reviewTargetCount: 30,
    });
  });

  it("notifies subscribers and changes snapshot version after saves", () => {
    const listener = vi.fn();
    const beforeSnapshot = getWordbookStudySettingsSnapshot();
    const unsubscribe = subscribeWordbookStudySettings(listener);

    saveWordbookStudySettings({
      learnTargetCount: 20,
      reviewTargetCount: 30,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getWordbookStudySettingsSnapshot()).not.toBe(beforeSnapshot);
    expect(getServerWordbookStudySettingsSnapshot()).toBe("0");

    unsubscribe();
    saveWordbookStudySettings({
      learnTargetCount: 30,
      reviewTargetCount: 20,
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
