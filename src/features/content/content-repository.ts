import type { ExamScopeCode, Prisma } from "@prisma/client";

import { db } from "@/lib/db";

const vocabularyEntryInclude = {
  aliases: true,
  meanings: true,
  scopes: true,
} satisfies Prisma.VocabularyEntryInclude;

export type VocabularyEntryRecord = Prisma.VocabularyEntryGetPayload<{
  include: typeof vocabularyEntryInclude;
}>;

export async function getVocabularyEntryById(entryId: string) {
  return db.vocabularyEntry.findUnique({
    where: { id: entryId },
    include: vocabularyEntryInclude,
  });
}

export async function listEntriesForExamScope(scopeCode: ExamScopeCode) {
  return db.vocabularyEntry.findMany({
    where: {
      scopes: {
        some: {
          scopeCode,
        },
      },
    },
    include: vocabularyEntryInclude,
    orderBy: [{ lemma: "asc" }],
  });
}

export async function getConfusionGroupById(groupId: string) {
  return db.confusionGroup.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: {
          entry: {
            include: vocabularyEntryInclude,
          },
        },
        orderBy: {
          ordinal: "asc",
        },
      },
      teachFirstEntry: {
        include: vocabularyEntryInclude,
      },
    },
  });
}
