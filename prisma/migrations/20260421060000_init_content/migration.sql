-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ExamScopeCode" AS ENUM ('gaokao', 'cet4', 'cet6', 'postgrad');

-- CreateTable
CREATE TABLE "exam_scope" (
    "code" "ExamScopeCode" NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "exam_scope_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "vocabulary_entry" (
    "id" TEXT NOT NULL,
    "lemma" TEXT NOT NULL,
    "pos" TEXT[],
    "examples" TEXT[],
    "collocations" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocabulary_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_alias" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,

    CONSTRAINT "vocabulary_alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_meaning" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "zh" TEXT NOT NULL,

    CONSTRAINT "vocabulary_meaning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_entry_scope" (
    "entryId" TEXT NOT NULL,
    "scopeCode" "ExamScopeCode" NOT NULL,
    "teachingRank" INTEGER,

    CONSTRAINT "vocabulary_entry_scope_pkey" PRIMARY KEY ("entryId","scopeCode")
);

-- CreateTable
CREATE TABLE "confusion_group" (
    "id" TEXT NOT NULL,
    "teachFirstEntryId" TEXT NOT NULL,
    "whyConfusing" TEXT NOT NULL,
    "commonMisusePoints" TEXT[],
    "semanticBoundaryNotes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "confusion_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "confusion_group_member" (
    "confusionGroupId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "emphasisNote" TEXT,

    CONSTRAINT "confusion_group_member_pkey" PRIMARY KEY ("confusionGroupId","entryId")
);

-- CreateIndex
CREATE INDEX "vocabulary_entry_lemma_idx" ON "vocabulary_entry"("lemma");

-- CreateIndex
CREATE INDEX "vocabulary_alias_alias_idx" ON "vocabulary_alias"("alias");

-- CreateIndex
CREATE INDEX "vocabulary_meaning_zh_idx" ON "vocabulary_meaning"("zh");

-- CreateIndex
CREATE INDEX "confusion_group_member_entryId_idx" ON "confusion_group_member"("entryId");

-- AddForeignKey
ALTER TABLE "vocabulary_alias" ADD CONSTRAINT "vocabulary_alias_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "vocabulary_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_meaning" ADD CONSTRAINT "vocabulary_meaning_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "vocabulary_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_entry_scope" ADD CONSTRAINT "vocabulary_entry_scope_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "vocabulary_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_entry_scope" ADD CONSTRAINT "vocabulary_entry_scope_scopeCode_fkey" FOREIGN KEY ("scopeCode") REFERENCES "exam_scope"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confusion_group" ADD CONSTRAINT "confusion_group_teachFirstEntryId_fkey" FOREIGN KEY ("teachFirstEntryId") REFERENCES "vocabulary_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confusion_group_member" ADD CONSTRAINT "confusion_group_member_confusionGroupId_fkey" FOREIGN KEY ("confusionGroupId") REFERENCES "confusion_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confusion_group_member" ADD CONSTRAINT "confusion_group_member_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "vocabulary_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
