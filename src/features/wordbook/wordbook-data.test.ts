import { describe, expect, it } from "vitest";

import { hasScopeInExamTargetClosure } from "@/features/exam-target/scope-closure";
import {
  findWordbookEntry,
  getWordbookById,
  getWordbookByExamTarget,
  getDefaultWordbook,
  listWordbooks,
  listWordbookEntries,
  normalizeWordbookId,
} from "@/features/wordbook/wordbook-data";

describe("wordbook data", () => {
  it("builds a CET-6 foundation wordbook from ECDICT tag closure", () => {
    const wordbook = getDefaultWordbook();

    expect(wordbook.id).toBe("cet6-foundation-v1");
    expect(wordbook.label).toContain("CET-6");
    expect(wordbook.label).toContain("ECDICT");
    expect(wordbook.label).not.toContain("完整");
    expect(wordbook.sourceLabel).toContain("ECDICT");
    expect(wordbook.sourceLabel).toContain("exam tags");
    expect(wordbook.entries.length).toBeGreaterThan(6500);
    expect(
      wordbook.entries.every((entry) =>
        hasScopeInExamTargetClosure(entry.examScopes, "cet6"),
      ),
    ).toBe(true);
    expect(wordbook.entries.some((entry) => entry.examScopes.includes("gaokao"))).toBe(
      true,
    );
    expect(wordbook.entries.some((entry) => entry.examScopes.includes("cet4"))).toBe(true);
    expect(wordbook.entries.some((entry) => entry.examScopes.includes("cet6"))).toBe(true);
    expect(findWordbookEntry("activity")?.examScopes).toEqual([
      "gaokao",
      "cet4",
      "postgrad",
    ]);
  });

  it("builds all exam wordbooks from one ECDICT tag dataset", () => {
    const wordbooks = listWordbooks();

    expect(wordbooks.map((wordbook) => wordbook.id)).toEqual([
      "gaokao-foundation-v1",
      "cet4-foundation-v1",
      "cet6-foundation-v1",
      "postgrad-foundation-v1",
    ]);
    expect(getWordbookByExamTarget("gaokao").entries.length).toBeGreaterThan(3000);
    expect(getWordbookByExamTarget("cet4").entries.length).toBeGreaterThan(
      getWordbookByExamTarget("gaokao").entries.length,
    );
    expect(getWordbookByExamTarget("cet6").entries.length).toBeGreaterThan(
      getWordbookByExamTarget("cet4").entries.length,
    );
    expect(getWordbookByExamTarget("postgrad").entries.length).toBeGreaterThan(
      getWordbookByExamTarget("cet6").entries.length,
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

  it("sorts entries and supports case-insensitive lemma lookup", () => {
    const entries = listWordbookEntries();
    const sorted = [...entries].sort((left, right) =>
      left.lemma.localeCompare(right.lemma),
    );

    expect(entries.map((entry) => entry.lemma)).toEqual(
      sorted.map((entry) => entry.lemma),
    );
    expect(findWordbookEntry("access")?.lemma).toBe("access");
    expect(findWordbookEntry("ACCESS")?.lemma).toBe("access");
  });

  it("exposes a registry-backed active wordbook boundary", () => {
    expect(getWordbookById("cet6-foundation-v1")).toBe(getDefaultWordbook());
    expect(getWordbookByExamTarget("postgrad").id).toBe("postgrad-foundation-v1");
    expect(normalizeWordbookId("__missing__")).toBe("cet6-foundation-v1");
  });
});
