import "dotenv/config";

import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { seedContent } from "@/features/content/seed-content";
import type { SeedContent } from "@/features/content/seed-content-rules";

const sentinelEntryId = "sentinel-rollback-check";
const validRollbackEntryId = "rollback-valid-entry";

describe.skipIf(!process.env.DATABASE_URL)("seedContent", () => {
  afterEach(async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });

    await client.connect();
    await client.query("DELETE FROM vocabulary_alias WHERE \"entryId\" = $1", [sentinelEntryId]);
    await client.query("DELETE FROM vocabulary_meaning WHERE \"entryId\" = $1", [sentinelEntryId]);
    await client.query("DELETE FROM vocabulary_entry_scope WHERE \"entryId\" = $1", [sentinelEntryId]);
    await client.query("DELETE FROM vocabulary_entry WHERE id = $1", [sentinelEntryId]);
    await client.end();
  });

  it("rolls back destructive reset work when confusion-group seeding fails", async () => {
    await db.examScope.upsert({
      where: { code: "cet6" },
      update: { label: "CET-6" },
      create: {
        code: "cet6",
        label: "CET-6",
      },
    });

    await db.vocabularyEntry.create({
      data: {
        id: sentinelEntryId,
        lemma: sentinelEntryId,
        pos: ["noun"],
        examples: [],
        collocations: [],
        aliases: {
          create: [],
        },
        meanings: {
          create: [{ zh: "事务回滚哨兵" }],
        },
        scopes: {
          create: [{ scopeCode: "cet6", teachingRank: 999 }],
        },
      },
    });

    const brokenSeedData = {
      entries: [
        {
          id: validRollbackEntryId,
          lemma: validRollbackEntryId,
          aliases: [],
          pos: ["noun"],
          meaningsZh: ["事务回滚测试词条"],
          examScopes: ["cet6"],
          examples: [],
          collocations: [],
        },
      ],
      confusionGroups: [
        {
          id: "broken-rollback-group",
          members: [validRollbackEntryId, "missing-entry"],
          teachFirst: validRollbackEntryId,
          whyConfusing: "This group intentionally references a missing entry.",
        },
      ],
    } satisfies SeedContent;

    await expect(seedContent(db, brokenSeedData)).rejects.toThrow();

    const client = new Client({ connectionString: process.env.DATABASE_URL });

    await client.connect();
    const persistedSentinel = await client.query(
      "SELECT id FROM vocabulary_entry WHERE id = $1",
      [sentinelEntryId],
    );
    await client.end();

    expect(persistedSentinel.rows[0]?.id).toBe(sentinelEntryId);
  });

  it("persists optional confusion cluster metadata", async () => {
    const seedData = {
      entries: [
        {
          id: "metadata-left",
          lemma: "metadata-left",
          aliases: [],
          pos: ["noun"],
          meaningsZh: ["元数据左项"],
          examScopes: ["cet6"],
          examples: [],
          collocations: [],
        },
        {
          id: "metadata-right",
          lemma: "metadata-right",
          aliases: [],
          pos: ["noun"],
          meaningsZh: ["元数据右项"],
          examScopes: ["cet6"],
          examples: [],
          collocations: [],
        },
      ],
      confusionGroups: [
        {
          id: "metadata-cluster",
          labels: ["root_family", "exam_high_value"],
          anchorPattern: "meta",
          members: ["metadata-left", "metadata-right"],
          teachFirst: "metadata-left",
          whyConfusing: "This group is used to verify metadata persistence.",
          quickDistinction: "left=左项；right=右项",
          examHook: "Use the metadata fields to guide cluster explanations.",
          commonMisusePoints: [],
          semanticBoundaryNotes: [],
          memberNotes: {},
        },
      ],
    } satisfies SeedContent;

    await seedContent(db, seedData);

    const client = new Client({ connectionString: process.env.DATABASE_URL });

    await client.connect();
    const persistedGroup = await client.query<{
      labels: string[];
      anchorPattern: string | null;
      quickDistinction: string | null;
      examHook: string | null;
    }>(
      `
        SELECT
          "labels",
          "anchorPattern",
          "quickDistinction",
          "examHook"
        FROM "confusion_group"
        WHERE "id" = $1
      `,
      ["metadata-cluster"],
    );
    await client.end();

    expect(persistedGroup.rows[0]).toEqual({
      labels: ["root_family", "exam_high_value"],
      anchorPattern: "meta",
      quickDistinction: "left=左项；right=右项",
      examHook: "Use the metadata fields to guide cluster explanations.",
    });
  });
});
