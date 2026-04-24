# Shape Neighbor P0 Seed Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 20 P0 shape-neighbor groups from the candidate pool into seed data and keep retrieval/eval coverage stable.

**Architecture:** This is a data-first expansion that reuses the existing `confusion_group / confusion_group_member` model and the existing `shape_neighbor_search` retrieval path. No schema, query-mode, or UI shape changes are planned; verification is done through failing eval/test coverage first, then seed data, then regression commands.

**Tech Stack:** Next.js 16, TypeScript, Prisma 7, PostgreSQL/Prisma dev, Vitest, existing `tsx` eval scripts.

---

## Selected P0 Groups

Use all 20 P0 groups from `docs/superpowers/plans/2026-04-23-shape-neighbor-candidate-pool.md`:

- `access / assess / excess`
- `advice / advise`
- `accept / except`
- `aboard / abroad`
- `angel / angle / ankle`
- `assure / ensure / insure`
- `complement / compliment`
- `principal / principle`
- `personal / personnel`
- `economic / economical`
- `conscious / conscience`
- `precede / proceed`
- `perspective / prospective`
- `historic / historical`
- `sensible / sensitive`
- `considerable / considerate`
- `stationary / stationery`
- `device / devise`
- `loose / lose`
- `breath / breathe`

Keep P1 deferred until P0 is seeded and verified.

### Task 1: Add Failing P0 Coverage

**Files:**
- Modify: `scripts/run-shape-neighbor-eval.ts`
- Modify: `src/features/retrieval/retrieve-candidates.test.ts`

- [x] **Step 1: Add P0 eval cases before seed data changes**

Add direct-compare cases for every selected P0 group to `scripts/run-shape-neighbor-eval.ts`, plus representative shape-neighbor list cases for:

- `access`
- `advice`
- `angel`
- `assure`
- `breath`

Expected before seed changes: the new cases fail with `no_match` or missing grounding/comparison view.

- [x] **Step 2: Add focused retrieval integration tests**

Add two focused tests to `src/features/retrieval/retrieve-candidates.test.ts`:

- `access / assess / excess` resolves as a shared comparison group with all three members.
- `跟 breath 很像的词有哪些` resolves as `shape_neighbor_search` with `breath / breathe`.

Expected before seed changes: these tests fail because the P0 seed entries/groups do not exist yet.

- [x] **Step 3: Run the failing checks**

Run:

```powershell
corepack pnpm eval:shape
corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts
```

Expected: existing cases still pass; new P0 cases fail for missing seed data. Do not proceed to seed implementation unless the failures are caused by missing entries/groups rather than syntax or test errors.

### Task 2: Add P0 Seed Entries And Groups

**Files:**
- Modify: `data/exam-vocab/seed/entries.json`
- Modify: `data/exam-vocab/seed/confusion-groups.json`

- [x] **Step 1: Add missing P0 vocabulary entries**

Append seed entries for all selected P0 lemmas that are not already present. Each entry must include:

- stable `id` matching the lemma
- `lemma`
- at least one useful alias or collocation-like alias
- `pos`
- Chinese meanings
- exam scopes from the candidate pool
- one short example
- at least one collocation

- [x] **Step 2: Add P0 confusion groups**

Append one `confusion-groups.json` group per selected P0 group. Each group must include:

- stable id, such as `access-assess-excess`
- ordered `members`
- `teachFirst`
- `whyConfusing`
- `commonMisusePoints`
- `semanticBoundaryNotes`
- `memberNotes` when one member needs a high-signal memory hook

- [x] **Step 3: Validate and seed the content**

Run:

```powershell
corepack pnpm exec tsx scripts/check-seed-content.ts
corepack pnpm db:seed
```

Expected: seed content validates and `prisma db seed` completes.

### Task 3: Verify P0 Retrieval Stability

**Files:**
- Modify: `progress.md`
- Optional modify: `bugs.md` only if a new confirmed issue or environment pitfall appears.

- [x] **Step 1: Run targeted regression**

Run:

```powershell
corepack pnpm eval:shape
corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts
corepack pnpm exec eslint scripts/run-shape-neighbor-eval.ts src/features/retrieval/retrieve-candidates.test.ts
```

Expected: all new and existing shape-neighbor eval cases pass; retrieval tests pass; eslint passes.

- [x] **Step 2: Check seed scale**

Run:

```powershell
corepack pnpm exec tsx scripts/check-seed-content.ts
```

Expected: entry/group counts increase from the current 39 entries / 11 groups by the P0 seed additions.

- [x] **Step 3: Update progress handoff**

Update `progress.md` with:

- P0 expansion result
- exact verification commands and outcomes
- next recommendation: only after P0 stays stable, choose a smaller P1 slice; keep root/fragment search deferred

- [x] **Step 4: Mark this plan complete**

After all verification commands pass and `progress.md` is updated, mark completed checkboxes in this plan as they are finished.
