import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  findSourceLemmaMembership,
  loadSourceLemmaMemberships,
} from "@/features/content/source-lemma-sources";

const fixtureRoots: string[] = [];

async function createSourceLemmaFixture() {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "enggo-source-lemmas-"));
  fixtureRoots.push(fixtureRoot);

  const sourceDir = path.join(fixtureRoot, "source-lemmas");
  await mkdir(sourceDir, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(sourceDir, "gaokao-2020-lemmas.txt"),
      ["Accent", "", "ache"].join("\n"),
    ),
    writeFile(
      path.join(sourceDir, "cet-2016-lemmas.tsv"),
      [
        "lemma\tsourceScope",
        "accent\tcet4",
        "bachelor\tcet4",
        "detach\tcet6-extra",
        "",
      ].join("\n"),
    ),
  ]);

  return fixtureRoot;
}

describe("source lemma sources", () => {
  afterEach(async () => {
    await Promise.all(
      fixtureRoots.splice(0).map((fixtureRoot) =>
        rm(fixtureRoot, { recursive: true, force: true }),
      ),
    );
  });

  it("loads source lemma memberships with CET4 counted as CET6 base coverage", async () => {
    const baseDir = await createSourceLemmaFixture();

    const memberships = await loadSourceLemmaMemberships({ baseDir });

    expect(memberships).toEqual(
      expect.arrayContaining([
        {
          lemma: "accent",
          scopeCode: "gaokao",
          sourceName: "gaokao-2020-lemmas.txt",
          sourceScope: "gaokao",
        },
        {
          lemma: "accent",
          scopeCode: "cet4",
          sourceName: "cet-2016-lemmas.tsv",
          sourceScope: "cet4",
        },
        {
          lemma: "accent",
          scopeCode: "cet6",
          sourceName: "cet-2016-lemmas.tsv",
          sourceScope: "cet4",
        },
        {
          lemma: "detach",
          scopeCode: "cet6",
          sourceName: "cet-2016-lemmas.tsv",
          sourceScope: "cet6-extra",
        },
      ]),
    );
    expect(memberships).not.toContainEqual(
      expect.objectContaining({ scopeCode: "postgrad" }),
    );
  });

  it("finds exact source membership for the active scope only", async () => {
    const baseDir = await createSourceLemmaFixture();

    await expect(
      findSourceLemmaMembership({
        lemma: "BACHELOR",
        activeExamTarget: "cet6",
        baseDir,
      }),
    ).resolves.toMatchObject({
      lemma: "bachelor",
      scopeCode: "cet6",
      sourceScope: "cet4",
    });

    await expect(
      findSourceLemmaMembership({
        lemma: "detach",
        activeExamTarget: "cet4",
        baseDir,
      }),
    ).resolves.toBeNull();
  });
});
