import "dotenv/config";

import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

import { detectQueryMode } from "@/features/retrieval/detect-query-mode";
import { retrieveCandidates } from "@/features/retrieval/retrieve-candidates";

describe("detectQueryMode", () => {
  it("detects zh meaning lookup", () => {
    expect(detectQueryMode("遵从怎么说")).toBe("meaning_lookup");
  });

  it("detects fuzzy spelling lookup", () => {
    expect(detectQueryMode("有个像 institute 的词")).toBe("fuzzy_recall");
  });

  it("detects direct comparison", () => {
    expect(detectQueryMode("restrain 和 constrain 的区别")).toBe("direct_compare");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("retrieveCandidates", () => {
  beforeAll(async () => {
    execSync("corepack pnpm db:seed", {
      cwd: process.cwd(),
      stdio: "pipe",
    });
  });

  it("finds an in-scope main answer from a Chinese meaning lookup", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "遵从怎么说",
    });

    expect(result.queryMode).toBe("meaning_lookup");
    expect(result.candidates[0]?.lemma).toBe("comply");
    expect(result.candidates[0]?.inScope).toBe(true);
  });

  it("returns a word family for incomplete English recall", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet6",
      query: "有个像 instituton 的词",
    });

    expect(result.queryMode).toBe("fuzzy_recall");
    expect(result.candidates.length).toBeGreaterThan(1);
    expect(result.candidates.map((candidate) => candidate.lemma)).toEqual(
      expect.arrayContaining(["institute", "institution"]),
    );
  });

  it("enters confusion-group view for direct comparison queries", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "postgrad",
      query: "restrain 和 constrain 的区别",
    });

    expect(result.queryMode).toBe("direct_compare");
    expect(result.comparisonView?.id).toBe("restrain-constrain-curb");
    expect(result.comparisonView?.members.map((member) => member.lemma)).toEqual(
      expect.arrayContaining(["restrain", "constrain"]),
    );
  });

  it("returns multiple candidates with disambiguation reasons for ambiguous input", async () => {
    const result = await retrieveCandidates({
      activeExamTarget: "cet4",
      query: "respect 那组词怎么分",
    });

    expect(result.candidates.length).toBeGreaterThan(1);
    expect(result.candidates.every((candidate) => candidate.reason.length > 0)).toBe(true);
  });
});
