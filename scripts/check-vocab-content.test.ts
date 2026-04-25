import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  checkVocabContent,
  formatCliError,
  readCheckVocabContentOptions,
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

  test("fails when the dataset is smaller than the requested minimum", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "enggo-vocab-min-"));
    const datasetDir = path.join(baseDir, "fixture-real-smoke");
    await mkdir(datasetDir);

    await writeFile(
      path.join(datasetDir, "entries.json"),
      JSON.stringify([
        {
          id: "stationary",
          lemma: "stationary",
          aliases: [],
          pos: ["adjective"],
          meaningsZh: ["静止的"],
          examScopes: ["cet4"],
          examples: [],
          collocations: [],
        },
      ]),
    );
    await writeFile(path.join(datasetDir, "confusion-groups.json"), JSON.stringify([]));

    await expect(
      checkVocabContent({
        datasetName: "fixture-real-smoke",
        baseDir,
        minEntries: 2,
      }),
    ).rejects.toThrow("fixture-real-smoke has 1 entries; expected at least 2.");
  });

  test("fails when source-lemma coverage is required but scoped lemmas are missing", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "enggo-vocab-source-"));
    const datasetDir = path.join(baseDir, "fixture-real-smoke");
    const sourceDir = path.join(baseDir, "source-lemmas");
    await mkdir(datasetDir);
    await mkdir(sourceDir);

    await writeFile(path.join(sourceDir, "gaokao-2020-lemmas.txt"), "stationary\n");
    await writeFile(
      path.join(sourceDir, "cet-2016-lemmas.tsv"),
      "lemma\tsourceScope\nstationary\tcet4\n",
    );
    await writeFile(
      path.join(datasetDir, "entries.json"),
      JSON.stringify([
        {
          id: "stationary",
          lemma: "stationary",
          aliases: [],
          pos: ["adjective"],
          meaningsZh: ["静止的"],
          examScopes: ["gaokao", "cet4", "cet6"],
          examples: [],
          collocations: [],
        },
        {
          id: "phantom",
          lemma: "phantom",
          aliases: [],
          pos: ["noun"],
          meaningsZh: ["幻影"],
          examScopes: ["cet4"],
          examples: [],
          collocations: [],
        },
      ]),
    );
    await writeFile(path.join(datasetDir, "confusion-groups.json"), JSON.stringify([]));

    await expect(
      checkVocabContent({
        datasetName: "fixture-real-smoke",
        baseDir,
        requireSourceLemmas: true,
      }),
    ).rejects.toThrow("source lemma coverage missing: phantom[cet4]");
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

describe("readCheckVocabContentOptions", () => {
  test("parses dataset, minimum entries, and source coverage flags", () => {
    expect(
      readCheckVocabContentOptions([
        "node",
        "script",
        "--dataset",
        "real-smoke",
        "--min-entries",
        "180",
        "--require-source-lemmas",
      ]),
    ).toEqual({
      datasetName: "real-smoke",
      minEntries: 180,
      requireSourceLemmas: true,
    });
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
