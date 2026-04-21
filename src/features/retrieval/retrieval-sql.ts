import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { ExamScopeCode } from "@/features/content/import-types";

export type EnglishCandidateRow = {
  entryId: string;
  lemma: string;
  matchedAlias: string | null;
  inScope: boolean;
  exactLemma: boolean;
  exactAlias: boolean;
  lemmaSimilarity: number;
  lemmaWordSimilarity: number;
  aliasSimilarity: number;
  aliasWordSimilarity: number;
};

export async function findEnglishCandidateRows(
  activeExamTarget: ExamScopeCode,
  needle: string,
) {
  const likePattern = `%${needle}%`;

  return db.$queryRaw<EnglishCandidateRow[]>(Prisma.sql`
    SELECT
      ve.id AS "entryId",
      ve.lemma,
      best_alias.alias AS "matchedAlias",
      BOOL_OR(ves."scopeCode"::text = ${activeExamTarget}) AS "inScope",
      ve.lemma = ${needle} AS "exactLemma",
      COALESCE(best_alias.exact_alias, false) AS "exactAlias",
      similarity(ve.lemma, ${needle}) AS "lemmaSimilarity",
      word_similarity(${needle}, ve.lemma) AS "lemmaWordSimilarity",
      COALESCE(best_alias.alias_similarity, 0) AS "aliasSimilarity",
      COALESCE(best_alias.alias_word_similarity, 0) AS "aliasWordSimilarity"
    FROM "vocabulary_entry" ve
    LEFT JOIN LATERAL (
      SELECT
        va.alias,
        va.alias = ${needle} AS exact_alias,
        similarity(va.alias, ${needle}) AS alias_similarity,
        word_similarity(${needle}, va.alias) AS alias_word_similarity
      FROM "vocabulary_alias" va
      WHERE va."entryId" = ve.id
      ORDER BY
        (va.alias = ${needle}) DESC,
        GREATEST(
          similarity(va.alias, ${needle}),
          word_similarity(${needle}, va.alias)
        ) DESC
      LIMIT 1
    ) AS best_alias ON TRUE
    LEFT JOIN "vocabulary_entry_scope" ves
      ON ves."entryId" = ve.id
    WHERE
      ve.lemma = ${needle}
      OR ve.lemma ILIKE ${likePattern}
      OR ve.lemma % ${needle}
      OR GREATEST(
        similarity(ve.lemma, ${needle}),
        word_similarity(${needle}, ve.lemma)
      ) >= 0.28
      OR COALESCE(best_alias.alias = ${needle}, false)
      OR COALESCE(best_alias.alias ILIKE ${likePattern}, false)
      OR COALESCE(best_alias.alias % ${needle}, false)
      OR COALESCE(best_alias.alias_word_similarity, 0) >= 0.28
    GROUP BY
      ve.id,
      ve.lemma,
      best_alias.alias,
      best_alias.exact_alias,
      best_alias.alias_similarity,
      best_alias.alias_word_similarity
    ORDER BY
      "exactLemma" DESC,
      "exactAlias" DESC,
      "inScope" DESC,
      GREATEST(
        similarity(ve.lemma, ${needle}),
        word_similarity(${needle}, ve.lemma),
        COALESCE(best_alias.alias_similarity, 0),
        COALESCE(best_alias.alias_word_similarity, 0)
      ) DESC,
      ve.lemma ASC
    LIMIT 8
  `);
}
