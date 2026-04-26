# Real-Smoke Foundation Vocab Batch 3 Implementation Plan

> **For agentic workers:** Continue this plan task-by-task. Keep validation serial when commands touch local Prisma dev.

**Goal:** Expand the source-backed `real-smoke` foundation dataset from 409 entries to at least 500 entries without changing answer architecture or adding unreviewed confusion groups.

**Architecture:** Keep the existing JSON schema and source-lemma guardrails. Add thin foundation entries backed by the current Gaokao/CET source manifests. Each new entry should have `lemma`, `pos`, `meaningsZh`, `examScopes`, empty `aliases` / `examples`, and optional short `collocations`.

**Scope Boundaries**

Do:

- Add source-backed thin entries to `data/exam-vocab/real-smoke/entries.json`.
- Keep `confusion-groups.json` unchanged unless a group is manually confirmed.
- Validate with `--min-entries 500 --require-source-lemmas`.
- Update `data/exam-vocab/real-smoke/README.md` and `progress.md`.

Do not:

- Add `postgrad` scope.
- Copy commercial word-book explanations, examples, mnemonics, or chapter structure.
- Create confusion groups from spelling similarity alone.
- Change retrieval code, Prisma schema, or answer prompt architecture in this slice.

## Task 1: Establish Batch 3 Target

- [x] **Step 1: Prove current dataset is below 500**

Run:

```powershell
corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke --min-entries 500 --require-source-lemmas
```

Expected: FAIL because the dataset has 409 entries before batch 3.

- [x] **Step 2: Append batch-3 foundation entries**

Add enough reviewed source-backed entries to reach at least 500 total entries.

- [x] **Step 3: Validate batch-3 content**

Run:

```powershell
corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke --min-entries 500 --require-source-lemmas
```

Expected: PASS.

## Task 2: Verify Compatibility

- [x] **Step 1: Seed and run deterministic smoke checks**

Run serially:

```powershell
corepack pnpm exec prisma dev ls
corepack pnpm db:seed:real-smoke
corepack pnpm eval:lookalike:real-smoke
corepack pnpm eval:answer-style
```

Expected: all pass. If local Prisma dev reports `Connection terminated unexpectedly`, use non-destructive `prisma dev stop/start`, then rerun migrate, seed, and the failed smoke.

- [x] **Step 2: Run focused tests and lint**

Run:

```powershell
corepack pnpm test scripts/check-vocab-content.test.ts src/features/content/load-seed-content.test.ts src/features/retrieval/retrieve-candidates.test.ts
corepack pnpm exec eslint scripts/check-vocab-content.ts scripts/check-vocab-content.test.ts src/features/retrieval/retrieve-candidates.test.ts
git diff --check
```

Expected: all pass.

- [x] **Step 3: Update handoff docs**

Update `data/exam-vocab/real-smoke/README.md` and `progress.md` with the new entry count, verification output, and next target.
