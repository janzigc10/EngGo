import { describe, expect, it } from "vitest";

import {
  findWordbookEntry,
  getDefaultWordbook,
  listWordbookEntries,
} from "@/features/wordbook/wordbook-data";

describe("wordbook data", () => {
  it("builds a CET-6 foundation wordbook from source-backed entries", () => {
    const wordbook = getDefaultWordbook();

    expect(wordbook.id).toBe("cet6-foundation-v1");
    expect(wordbook.label).toContain("CET-6");
    expect(wordbook.label).not.toContain("完整");
    expect(wordbook.sourceLabel).toContain("source-backed");
    expect(wordbook.entries.length).toBeGreaterThan(100);
    expect(wordbook.entries.every((entry) => entry.examScopes.includes("cet6"))).toBe(
      true,
    );
  });

  it("excludes entries without usable Chinese meanings", () => {
    const wordbook = getDefaultWordbook();

    expect(wordbook.entries.every((entry) => entry.meaningsZh.length > 0)).toBe(true);
    expect(
      wordbook.entries.every((entry) =>
        entry.meaningsZh.every((meaning) => meaning.trim().length > 0),
      ),
    ).toBe(true);
  });

  it("sorts entries and supports lemma or alias lookup", () => {
    const entries = listWordbookEntries();
    const sorted = [...entries].sort((left, right) =>
      left.lemma.localeCompare(right.lemma),
    );

    expect(entries.map((entry) => entry.lemma)).toEqual(
      sorted.map((entry) => entry.lemma),
    );
    expect(findWordbookEntry("access")?.lemma).toBe("access");
    expect(findWordbookEntry("have access to")?.lemma).toBe("access");
  });
});
