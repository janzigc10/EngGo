ALTER TABLE "confusion_group"
ADD COLUMN "purposes" text[] NOT NULL DEFAULT ARRAY[]::text[];
