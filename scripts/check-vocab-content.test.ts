import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  checkVocabContent,
  formatCliError,
  readDatasetName,
} from "./check-vocab-content";

describe("checkVocabContent", () => {
  test("loads a named dataset and formats the content summary", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "enggo-vocab-check-"));
    const datasetDir = path.join(baseDir, "fixture-real-smoke");
    await mkdir(datasetDir);

    await writeFile(
      path.join(datasetDir, "entries.json"),
      JSON.stringify([
        {
          id: "stationary",
          lemma: "stationary",
          aliases: [],
          pos: ["adj."],
          meaningsZh: ["静止的"],
          examScopes: ["gaokao", "cet4"],
          examples: [],
          collocations: ["remain stationary"],
        },
        {
          id: "stationery",
          lemma: "stationery",
          aliases: [],
          pos: ["n."],
          meaningsZh: ["文具"],
          examScopes: ["cet6", "postgrad"],
          examples: [],
          collocations: ["stationery store"],
        },
      ]),
    );
    await writeFile(
      path.join(datasetDir, "confusion-groups.json"),
      JSON.stringify([
        {
          id: "stationary-stationery",
          members: ["stationary", "stationery"],
          teachFirst: "stationary",
          whyConfusing: "Only one letter differs.",
        },
      ]),
    );

    await expect(
      checkVocabContent({ datasetName: "fixture-real-smoke", baseDir }),
    ).resolves.toBe(
      "Vocab content valid: 2 entries, 1 confusion groups, scopes=gaokao, cet4, cet6, postgrad.",
    );
  });
});

describe("readDatasetName", () => {
  test("throws when --dataset is missing a value", () => {
    expect(() => readDatasetName(["node", "script", "--dataset"])).toThrow(
      "Expected a dataset name after --dataset.",
    );
  });

  test("throws on unknown flags", () => {
    expect(() => readDatasetName(["node", "script", "--datset", "real-smoke"])).toThrow(
      "Unknown argument: --datset.",
    );
  });
});

describe("formatCliError", () => {
  test("returns a stable message for Error objects", () => {
    expect(formatCliError(new Error("Expected a dataset name after --dataset."))).toBe(
      "Expected a dataset name after --dataset.",
    );
  });

  test("stringifies non-Error values", () => {
    expect(formatCliError("plain failure")).toBe("plain failure");
  });
});
