# Real-Smoke Foundation Vocab Batch 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue the source-backed `real-smoke` foundation expansion from 262 entries to at least 400 entries.

**Architecture:** Keep the current JSON dataset schema and checker guardrails. Append a second reviewed batch of thin foundation entries whose lemmas are present in the existing Gaokao/CET source manifests, then rerun retrieval and answer-style smoke.

**Tech Stack:** TypeScript, `tsx`, Vitest, existing `real-smoke` JSON dataset and source lemma manifests.

---

## Scope Boundaries

Do:

- add source-backed thin entries to `data/exam-vocab/real-smoke/entries.json`
- keep `confusion-groups.json` unchanged unless a group is manually confirmed
- validate with `--min-entries 400 --require-source-lemmas`
- update `README.md` and `progress.md`

Do not:

- add `postgrad`
- copy commercial word-book content
- generate examples or long teaching notes
- change retrieval code or schema

### Task 1: Establish Batch 2 Target

- [x] **Step 1: Prove current dataset is below 300**

Run:

```powershell
corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke --min-entries 300 --require-source-lemmas
```

Expected: FAIL because the dataset currently has 262 entries.

- [x] **Step 2: Append batch-2 entries**

Add enough reviewed entries to reach at least 400 total entries. Every new lemma must resolve to `gaokao`, `cet4`, or `cet6` from the current source manifests.

- [x] **Step 3: Validate batch-2 content**

Run:

```powershell
corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke --min-entries 400 --require-source-lemmas
```

Expected: PASS.

### Task 2: Verify Compatibility

- [x] **Step 1: Seed and run smoke checks**

Run serially:

```powershell
corepack pnpm exec prisma dev ls
corepack pnpm db:seed:real-smoke
corepack pnpm eval:lookalike:real-smoke
corepack pnpm eval:answer-style
```

Expected: all pass.

- [x] **Step 2: Run focused tests and lint**

Run:

```powershell
corepack pnpm test scripts/check-vocab-content.test.ts src/features/content/load-seed-content.test.ts src/features/retrieval/retrieve-candidates.test.ts
corepack pnpm exec eslint scripts/check-vocab-content.ts scripts/check-vocab-content.test.ts
git diff --check
```

Expected: all pass.

- [x] **Step 3: Update handoff docs**

Update `data/exam-vocab/real-smoke/README.md` and `progress.md` with the new entry count, verification output, and next target.
