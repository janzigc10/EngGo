import "dotenv/config";

import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { loadSeedContent } from "@/features/content/load-seed-content";
import { seedContent } from "@/features/content/seed-content";

const sentinelEntryId = "sentinel-rollback-check";

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

    const seedData = await loadSeedContent();
    const brokenSeedData = {
      ...seedData,
      confusionGroups: seedData.confusionGroups.map((group, index) =>
        index === 0
          ? {
              ...group,
              members: [...group.members, "missing-entry"],
            }
          : group,
      ),
    };

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
});
