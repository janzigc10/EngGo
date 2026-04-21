CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "vocabulary_entry_lemma_trgm_idx"
ON "vocabulary_entry" USING GIN ("lemma" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "vocabulary_alias_alias_trgm_idx"
ON "vocabulary_alias" USING GIN ("alias" gin_trgm_ops);
