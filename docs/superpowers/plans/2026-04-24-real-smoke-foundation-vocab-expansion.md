# Real-Smoke Foundation Vocab Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the source-backed `real-smoke` vocabulary dataset from a small confusion sample into a broader, thin foundation slice for exact lookup and scope-aware retrieval.

**Architecture:** Keep the existing dataset schema and import path. Add checker support for minimum entry counts and source-lemma coverage, then append reviewed basic entries whose lemmas are present in the current source manifests.

**Tech Stack:** TypeScript, Vitest, `tsx`, existing `data/exam-vocab/real-smoke` JSON dataset, existing source lemma manifests.

---

## Scope Boundaries

Do:

- expand `data/exam-vocab/real-smoke/entries.json`
- keep `confusion-groups.json` focused on manually confirmed groups
- require new `real-smoke` entries to be backed by `gaokao`, `cet4`, or `cet6` source lemma manifests
- keep each new entry thin: `lemma`, `pos`, `meaningsZh`, `examScopes`, optional aliases/collocations
- run local validation serially

Do not:

- add `postgrad` scope before a machine-readable source exists
- copy commercial word-book explanations, examples, mnemonics, or chapter structure
- create a confusion group just because words look similar
- change the default `seed` dataset
- add embedding or new retrieval tables in this slice

## Files

- Modify: `scripts/check-vocab-content.ts`
- Modify: `scripts/check-vocab-content.test.ts`
- Modify: `data/exam-vocab/real-smoke/entries.json`
- Modify: `data/exam-vocab/real-smoke/README.md`
- Modify: `progress.md`

### Task 1: Add Expansion Guardrails To The Content Checker

- [x] **Step 1: Write failing checker tests**

Add tests for:

- `--min-entries <n>` parsing and failure when the dataset is too small
- `--require-source-lemmas` rejecting entries whose `examScopes` are not backed by source manifests

- [x] **Step 2: Run the checker tests red**

Run:

```powershell
corepack pnpm test scripts/check-vocab-content.test.ts
```

Expected: FAIL because the checker does not understand the new guardrail options.

- [x] **Step 3: Implement the checker guardrails**

Support:

```powershell
corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke --min-entries 180 --require-source-lemmas
```

Expected behavior:

- fail if entry count is below `--min-entries`
- fail if a scoped lemma is missing from the matching source manifest
- treat `cet4` source lemmas as valid for both `cet4` and shared `cet6` scope
- keep `postgrad` unsupported until source files exist

- [x] **Step 4: Run checker tests green**

Run:

```powershell
corepack pnpm test scripts/check-vocab-content.test.ts
```

Expected: PASS.

### Task 2: Expand The Real-Smoke Foundation Entries

- [x] **Step 1: Prove the current dataset is below the new slice target**

Run:

```powershell
corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke --min-entries 180 --require-source-lemmas
```

Expected: FAIL because the current dataset has 86 entries.

- [x] **Step 2: Append source-backed thin entries**

Add enough reviewed basic entries to bring `real-smoke` to at least 180 entries. Every new lemma must be present in `gaokao-2020-lemmas.txt` or `cet-2016-lemmas.tsv`.

- [x] **Step 3: Run content validation green**

Run:

```powershell
corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke --min-entries 180 --require-source-lemmas
```

Expected: PASS.

- [x] **Step 4: Update dataset README**

Update `data/exam-vocab/real-smoke/README.md` with the new entry count and note that this is a thin foundation slice, not a fully reviewed teaching corpus.

### Task 3: Verify Retrieval Compatibility And Handoff

- [x] **Step 1: Seed and run deterministic smoke**

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

Update `progress.md` with the new size, guardrail commands, verification outcomes, and next recommended expansion target.
