import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadVocabContent } from "@/features/content/load-seed-content";

const fixtureRoots: string[] = [];

const validEntries = [
  {
    id: "stationary",
    lemma: "stationary",
    aliases: [],
    pos: ["adjective"],
    meaningsZh: ["静止的"],
    examScopes: ["cet4"],
    examples: [],
    collocations: ["remain stationary"],
  },
  {
    id: "stationery",
    lemma: "stationery",
    aliases: [],
    pos: ["noun"],
    meaningsZh: ["文具"],
    examScopes: ["cet4"],
    examples: [],
    collocations: ["stationery store"],
  },
];

const validConfusionGroups = [
  {
    id: "stationary-stationery",
    labels: ["shape_like", "exam_high_value"],
    anchorPattern: "stationar",
    members: ["stationary", "stationery"],
    teachFirst: "stationery",
    whyConfusing: "only one letter differs",
    quickDistinction: "stationary=静止的；stationery=文具",
    examHook: "文具场景选 stationery；remain/keep 不动选 stationary。",
    commonMisusePoints: [],
    semanticBoundaryNotes: [],
    memberNotes: {
      stationary: "remain stationary",
      stationery: "stationery store",
    },
  },
];

async function createFixtureDataset({
  entries = validEntries,
  confusionGroups = validConfusionGroups,
} = {}) {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "enggo-vocab-content-"));
  fixtureRoots.push(fixtureRoot);

  const datasetDir = path.join(fixtureRoot, "fixture-real-smoke");
  await mkdir(datasetDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(datasetDir, "entries.json"), JSON.stringify(entries, null, 2)),
    writeFile(
      path.join(datasetDir, "confusion-groups.json"),
      JSON.stringify(confusionGroups, null, 2),
    ),
  ]);

  return fixtureRoot;
}

describe("loadVocabContent", () => {
  afterEach(async () => {
    await Promise.all(
      fixtureRoots.splice(0).map((fixtureRoot) =>
        rm(fixtureRoot, { recursive: true, force: true }),
      ),
    );
  });

  it("loads entries and confusion groups from an explicit dataset directory", async () => {
    const fixtureRoot = await createFixtureDataset();

    const content = await loadVocabContent({
      datasetName: "fixture-real-smoke",
      baseDir: fixtureRoot,
    });

    expect(content.entries.map((entry) => entry.lemma)).toEqual([
      "stationary",
      "stationery",
    ]);
    expect(content.confusionGroups[0].members).toEqual([
      "stationary",
      "stationery",
    ]);
    expect(content.confusionGroups[0].labels).toEqual([
      "shape_like",
      "exam_high_value",
    ]);
    expect(content.confusionGroups[0].anchorPattern).toBe("stationar");
    expect(content.confusionGroups[0].quickDistinction).toContain("stationary=静止的");
    expect(content.confusionGroups[0].examHook).toContain("文具场景");
  });

  it("rejects unknown confusion cluster labels", async () => {
    const fixtureRoot = await createFixtureDataset({
      confusionGroups: [
        {
          ...validConfusionGroups[0],
          labels: ["random_label"],
        },
      ],
    });

    await expect(
      loadVocabContent({
        datasetName: "fixture-real-smoke",
        baseDir: fixtureRoot,
      }),
    ).rejects.toThrow(/labels/i);
  });

  it("rejects duplicate entry ids", async () => {
    const fixtureRoot = await createFixtureDataset({
      entries: [
        validEntries[0],
        {
          ...validEntries[1],
          id: "stationary",
        },
      ],
    });

    await expect(
      loadVocabContent({
        datasetName: "fixture-real-smoke",
        baseDir: fixtureRoot,
      }),
    ).rejects.toThrow(/entries contains duplicate values: stationary/i);
  });

  it("rejects duplicate group ids", async () => {
    const fixtureRoot = await createFixtureDataset({
      confusionGroups: [
        validConfusionGroups[0],
        {
          ...validConfusionGroups[0],
          members: ["stationery", "stationary"],
        },
      ],
    });

    await expect(
      loadVocabContent({
        datasetName: "fixture-real-smoke",
        baseDir: fixtureRoot,
      }),
    ).rejects.toThrow(/confusion groups contains duplicate values: stationary-stationery/i);
  });

  it("rejects group members that reference missing entry ids", async () => {
    const fixtureRoot = await createFixtureDataset({
      confusionGroups: [
        {
          ...validConfusionGroups[0],
          members: ["stationary", "missing-entry"],
        },
      ],
    });

    await expect(
      loadVocabContent({
        datasetName: "fixture-real-smoke",
        baseDir: fixtureRoot,
      }),
    ).rejects.toThrow(/confusion groups reference missing entries: missing-entry/i);
  });

  it("rejects teachFirst values that are not included in members", async () => {
    const fixtureRoot = await createFixtureDataset({
      confusionGroups: [
        {
          ...validConfusionGroups[0],
          teachFirst: "missing-entry",
        },
      ],
    });

    await expect(
      loadVocabContent({
        datasetName: "fixture-real-smoke",
        baseDir: fixtureRoot,
      }),
    ).rejects.toThrow(
      /confusion group stationary-stationery does not include teachFirst entry missing-entry/i,
    );
  });
});
