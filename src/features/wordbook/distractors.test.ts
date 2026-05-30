import { describe, expect, it } from "vitest";

import { buildMeaningChoice } from "@/features/wordbook/distractors";
import type { WordbookEntry } from "@/features/wordbook/wordbook-types";

function entry(
  lemma: string,
  meaningZh: string,
  pos: string[] = ["verb"],
): WordbookEntry {
  return {
    id: lemma,
    lemma,
    aliases: [],
    pos,
    meaningsZh: meaningZh ? [meaningZh] : [],
    examScopes: ["cet6"],
    examples: [],
    collocations: [],
  };
}

describe("buildMeaningChoice", () => {
  const entries = [
    entry("adapt", "适应"),
    entry("adopt", "采纳"),
    entry("adjust", "调整"),
    entry("affect", "影响"),
    entry("advice", "建议", ["noun"]),
  ];

  it("returns exactly four options with one correct answer", () => {
    const result = buildMeaningChoice({
      entry: entries[0],
      allEntries: entries,
      seed: "session-1",
    });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") {
      return;
    }

    expect(result.options).toHaveLength(4);
    expect(result.options.filter((option) => option.isCorrect)).toHaveLength(1);
    expect(result.options.find((option) => option.isCorrect)?.meaningZh).toBe("适应");
  });

  it("prefers same part of speech distractors", () => {
    const result = buildMeaningChoice({
      entry: entries[0],
      allEntries: entries,
      seed: "session-1",
    });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") {
      return;
    }

    expect(result.options.filter((option) => !option.isCorrect)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lemma: "adopt" }),
        expect.objectContaining({ lemma: "adjust" }),
        expect.objectContaining({ lemma: "affect" }),
      ]),
    );
    expect(result.options.some((option) => option.lemma === "advice")).toBe(false);
  });

  it("excludes duplicate Chinese meaning strings", () => {
    const result = buildMeaningChoice({
      entry: entry("request", "要求"),
      allEntries: [
        entry("request", "要求"),
        entry("require", "要求"),
        entry("demand", "需求"),
        entry("suggest", "建议"),
        entry("propose", "提议"),
      ],
      seed: "session-1",
    });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") {
      return;
    }

    expect(
      result.options
        .filter((option) => !option.isCorrect)
        .map((option) => option.meaningZh),
    ).not.toContain("要求");
    expect(result.options.find((option) => option.isCorrect)?.meaningZh).toBe("要求");
  });

  it("shuffles deterministically by seed", () => {
    const first = buildMeaningChoice({
      entry: entries[0],
      allEntries: entries,
      seed: "session-1",
    });
    const second = buildMeaningChoice({
      entry: entries[0],
      allEntries: entries,
      seed: "session-1",
    });
    const third = buildMeaningChoice({
      entry: entries[0],
      allEntries: entries,
      seed: "session-2",
    });

    expect(first.kind).toBe("ready");
    expect(second.kind).toBe("ready");
    expect(third.kind).toBe("ready");
    if (first.kind !== "ready" || second.kind !== "ready" || third.kind !== "ready") {
      return;
    }

    expect(first.options.map((option) => option.id)).toEqual(
      second.options.map((option) => option.id),
    );
    expect(first.options.map((option) => option.id)).not.toEqual(
      third.options.map((option) => option.id),
    );
  });

  it("returns blocked when content is insufficient", () => {
    expect(
      buildMeaningChoice({
        entry: entry("empty", ""),
        allEntries: entries,
        seed: "session-1",
      }),
    ).toEqual({ kind: "blocked", reason: "missing_correct_meaning" });

    expect(
      buildMeaningChoice({
        entry: entries[0],
        allEntries: [entries[0], entries[1]],
        seed: "session-1",
      }),
    ).toEqual({ kind: "blocked", reason: "insufficient_distractors" });
  });
});
