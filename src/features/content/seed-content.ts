import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { Client } from "pg";

import type { SeedContent } from "@/features/content/seed-content-rules";

const examScopeLabels = {
  gaokao: "高考",
  cet4: "CET-4",
  cet6: "CET-6",
  postgrad: "考研",
} as const;

function getSeedConnectionString() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to seed content.");
  }

  return connectionString;
}

async function seedExamScopes(client: Client) {
  for (const [code, label] of Object.entries(examScopeLabels)) {
    await client.query(
      `
        INSERT INTO "exam_scope" ("code", "label")
        VALUES ($1::"ExamScopeCode", $2)
        ON CONFLICT ("code")
        DO UPDATE SET "label" = EXCLUDED."label"
      `,
      [code, label],
    );
  }
}

async function resetContentTables(client: Client) {
  await client.query(`DELETE FROM "confusion_group_member"`);
  await client.query(`DELETE FROM "confusion_group"`);
  await client.query(`DELETE FROM "vocabulary_alias"`);
  await client.query(`DELETE FROM "vocabulary_meaning"`);
  await client.query(`DELETE FROM "vocabulary_entry_scope"`);
  await client.query(`DELETE FROM "vocabulary_entry"`);
}

async function seedEntries(client: Client, entries: SeedContent["entries"]) {
  for (const entry of entries) {
    await client.query(
      `
        INSERT INTO "vocabulary_entry" (
          "id",
          "lemma",
          "pos",
          "examples",
          "collocations",
          "updatedAt"
        )
        VALUES ($1, $2, $3::text[], $4::text[], $5::text[], NOW())
      `,
      [entry.id, entry.lemma, entry.pos, entry.examples, entry.collocations],
    );

    for (const alias of entry.aliases) {
      await client.query(
        `
          INSERT INTO "vocabulary_alias" ("id", "entryId", "alias")
          VALUES ($1, $2, $3)
        `,
        [randomUUID(), entry.id, alias],
      );
    }

    for (const zh of entry.meaningsZh) {
      await client.query(
        `
          INSERT INTO "vocabulary_meaning" ("id", "entryId", "zh")
          VALUES ($1, $2, $3)
        `,
        [randomUUID(), entry.id, zh],
      );
    }

    for (const [index, scopeCode] of entry.examScopes.entries()) {
      await client.query(
        `
          INSERT INTO "vocabulary_entry_scope" ("entryId", "scopeCode", "teachingRank")
          VALUES ($1, $2::"ExamScopeCode", $3)
        `,
        [entry.id, scopeCode, index + 1],
      );
    }
  }
}

async function seedConfusionGroups(
  client: Client,
  confusionGroups: SeedContent["confusionGroups"],
) {
  for (const group of confusionGroups) {
    await client.query(
      `
        INSERT INTO "confusion_group" (
          "id",
          "teachFirstEntryId",
          "whyConfusing",
          "commonMisusePoints",
          "semanticBoundaryNotes",
          "labels",
          "purposes",
          "anchorPattern",
          "quickDistinction",
          "examHook",
          "updatedAt"
        )
        VALUES ($1, $2, $3, $4::text[], $5::text[], $6::text[], $7::text[], $8, $9, $10, NOW())
      `,
      [
        group.id,
        group.teachFirst,
        group.whyConfusing,
        group.commonMisusePoints ?? [],
        group.semanticBoundaryNotes ?? [],
        group.labels ?? [],
        group.purposes ?? [],
        group.anchorPattern ?? null,
        group.quickDistinction ?? null,
        group.examHook ?? null,
      ],
    );

    for (const [index, entryId] of group.members.entries()) {
      await client.query(
        `
          INSERT INTO "confusion_group_member" (
            "confusionGroupId",
            "entryId",
            "ordinal",
            "emphasisNote"
          )
          VALUES ($1, $2, $3, $4)
        `,
        [group.id, entryId, index + 1, group.memberNotes?.[entryId] ?? null],
      );
    }
  }
}

export async function seedContent(_client: PrismaClient, seedContent: SeedContent) {
  // Prisma adapter transactions are unstable against local Prisma Postgres on Windows,
  // so seed through a single pg transaction while keeping the public API unchanged.
  const client = new Client({ connectionString: getSeedConnectionString() });
  let backgroundClientError: Error | null = null;

  client.on("error", (error) => {
    backgroundClientError = error;
  });

  await client.connect();

  try {
    await client.query("BEGIN");
    await seedExamScopes(client);
    await resetContentTables(client);
    await seedEntries(client, seedContent.entries);
    await seedConfusionGroups(client, seedContent.confusionGroups);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  if (backgroundClientError) {
    throw backgroundClientError;
  }
}
