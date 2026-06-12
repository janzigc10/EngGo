# Structured Legacy Data Cleanup V1

## Goal
Retire the old Prisma / real-smoke / product-smoke cleanup leftovers now that FastAPI + ECDICT wordbook are the current runtime path.

## Scope
- [x] Preserve useful curated learning content from `real-smoke` before deleting the old dataset.
- [x] Delete the legacy Prisma seed / repository path and remove Prisma scripts/dependencies.
- [x] Delete old `real-smoke` dataset files and the outdated black-box product smoke gate.
- [x] Update current docs, bugs, and progress so the next session does not treat the old paths as active.
- [x] Verify with focused tests, lint, and stale-reference search.

## Keep Deliberately
- ECDICT wordbook JSON and generator.
- Source lemma manifests used by current backend source membership logic.
- `data/exam-vocab/seed` curated content, because FastAPI still reads it directly.
