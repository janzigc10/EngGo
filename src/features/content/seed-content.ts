import type { Prisma, PrismaClient } from "@prisma/client";

import type { SeedContent } from "@/features/content/seed-content-rules";

const examScopeLabels = {
  gaokao: "高考",
  cet4: "CET-4",
  cet6: "CET-6",
  postgrad: "考研",
} as const;

type TransactionClient = Prisma.TransactionClient;

async function seedExamScopes(tx: TransactionClient) {
  await Promise.all(
    Object.entries(examScopeLabels).map(([code, label]) =>
      tx.examScope.upsert({
        where: { code: code as keyof typeof examScopeLabels },
        update: { label },
        create: {
          code: code as keyof typeof examScopeLabels,
          label,
        },
      }),
    ),
  );
}

async function resetContentTables(tx: TransactionClient) {
  await tx.confusionGroupMember.deleteMany();
  await tx.confusionGroup.deleteMany();
  await tx.vocabularyAlias.deleteMany();
  await tx.vocabularyMeaning.deleteMany();
  await tx.vocabularyEntryScope.deleteMany();
  await tx.vocabularyEntry.deleteMany();
}

async function seedEntries(tx: TransactionClient, entries: SeedContent["entries"]) {
  for (const entry of entries) {
    await tx.vocabularyEntry.create({
      data: {
        id: entry.id,
        lemma: entry.lemma,
        pos: entry.pos,
        examples: entry.examples,
        collocations: entry.collocations,
        aliases: {
          create: entry.aliases.map((alias) => ({ alias })),
        },
        meanings: {
          create: entry.meaningsZh.map((zh) => ({ zh })),
        },
        scopes: {
          create: entry.examScopes.map((scopeCode, index) => ({
            scopeCode,
            teachingRank: index + 1,
          })),
        },
      },
    });
  }
}

async function seedConfusionGroups(
  tx: TransactionClient,
  confusionGroups: SeedContent["confusionGroups"],
) {
  for (const group of confusionGroups) {
    await tx.confusionGroup.create({
      data: {
        id: group.id,
        teachFirstEntryId: group.teachFirst,
        whyConfusing: group.whyConfusing,
        commonMisusePoints: group.commonMisusePoints,
        semanticBoundaryNotes: group.semanticBoundaryNotes,
        members: {
          create: group.members.map((entryId, index) => ({
            entryId,
            ordinal: index + 1,
            emphasisNote: group.memberNotes[entryId],
          })),
        },
      },
    });
  }
}

export async function seedContent(client: PrismaClient, seedContent: SeedContent) {
  await client.$transaction(async (tx) => {
    await seedExamScopes(tx);
    await resetContentTables(tx);
    await seedEntries(tx, seedContent.entries);
    await seedConfusionGroups(tx, seedContent.confusionGroups);
  });
}
