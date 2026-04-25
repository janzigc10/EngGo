ALTER TABLE "confusion_group"
ADD COLUMN "labels" text[] NOT NULL DEFAULT ARRAY[]::text[],
ADD COLUMN "anchorPattern" text,
ADD COLUMN "quickDistinction" text,
ADD COLUMN "examHook" text;
