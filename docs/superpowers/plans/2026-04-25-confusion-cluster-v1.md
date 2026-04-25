# Confusion Cluster V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade existing confusion groups from untyped "words that are easy to mix up" into typed confusion clusters, and prove the path with two root-family clusters.

**Architecture:** Keep the current `confusion-groups.json` concept and existing `ConfusionGroup` table, but add lightweight columns to persist optional cluster metadata. Seed those fields from JSON, expose them through retrieval `comparisonView`, and let the answer layer explain groups according to why they are confusing.

**Tech Stack:** TypeScript, Zod, Prisma, existing JSON seed datasets, Vitest, `tsx` smoke scripts.

---

## Scope Boundaries

Do:

- keep existing 31 confusion groups valid
- add optional metadata to confusion group JSON parsing, persistence, and TypeScript retrieval types
- add labels to a small set of existing groups
- add 2 high-value root-family clusters to `real-smoke`
- make retrieval surface cluster labels through `comparisonView`
- update answer prompt language so `root_family` clusters are explained as grouped memory/confusion clusters, not a separate product lane
- add smoke coverage showing different user inputs land on the same cluster

Do not:

- add a new Prisma table
- rewrite all existing groups
- make every ordinary vocabulary entry a group
- copy the user-provided screenshot content into data
- expand the whole vocabulary dataset in this task
- loosen low-confidence typo gates

## File Map

- Modify: `src/features/content/import-schema.ts`
  - Accept optional cluster metadata on confusion groups.
- Modify: `src/features/content/import-types.ts`
  - Add shared cluster label and confusion group metadata types.
- Modify: `prisma/schema.prisma`
  - Add lightweight optional metadata columns to `ConfusionGroup`.
- Create: `prisma/migrations/20260425090000_add_confusion_cluster_metadata/migration.sql`
  - Add `labels`, `anchorPattern`, `quickDistinction`, and `examHook` columns.
- Modify: `src/features/content/seed-content.ts`
  - Persist optional metadata while seeding confusion groups.
- Modify: `src/features/retrieval/types.ts`
  - Add `ConfusionClusterLabel` and expose labels/anchor metadata on `ComparisonView`.
- Modify: `src/features/retrieval/retrieve-candidates.ts`
  - Populate `comparisonView` metadata from loaded/persisted group data where available.
- Modify: `src/features/answering/build-grounding.ts`
  - Treat cluster-backed root-family comparisons as `confusion_untangle`; keep no-match root fragment behavior.
- Modify: `src/features/answering/build-system-prompt.ts`
  - Make `confusion_untangle` prompt adapt to labels without inventing unsupported words.
- Modify: `data/exam-vocab/real-smoke/confusion-groups.json`
  - Add labels to selected existing groups and add root/structure clusters.
- Modify: `data/exam-vocab/real-smoke/entries.json`
  - Add only missing source-backed member entries required by the new clusters.
- Modify: `data/exam-vocab/real-smoke/README.md`
  - Document confusion cluster labels.
- Test: `src/features/content/load-seed-content.test.ts`
- Test: `src/features/retrieval/retrieve-candidates.test.ts`
- Test: `src/features/answering/build-system-prompt.test.ts`
- Test: `scripts/run-answer-style-eval.ts`

### Task 1: Add Cluster Metadata Shape

- [x] **Step 1: Write failing schema/type tests**

Add tests showing `loadVocabContent()` accepts a confusion group with:

```json
{
  "id": "root-stitute",
  "labels": ["root_family", "shape_like", "exam_high_value"],
  "anchorPattern": "stitute",
  "quickDistinction": "institute=设立；constitute=构成；substitute=替代",
  "examHook": "先抓 institute / institution，再用 constitute / substitute 做对比。"
}
```

Also add a negative test rejecting unknown labels such as `random_label`.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
corepack pnpm test src/features/content/load-seed-content.test.ts
```

Expected: FAIL because the schema does not yet accept or validate cluster labels.

- [x] **Step 3: Implement minimal schema/type support**

In `src/features/content/import-schema.ts`, add:

```ts
const confusionClusterLabelSchema = z.enum([
  "shape_like",
  "root_family",
  "prefix_family",
  "meaning_near",
  "collocation_boundary",
  "exam_high_value",
]);
```

Then add optional `labels`, `anchorPattern`, `quickDistinction`, and `examHook` to `confusionGroupSeedPayloadSchema`.

- [x] **Step 4: Verify GREEN**

Run:

```powershell
corepack pnpm test src/features/content/load-seed-content.test.ts
```

Expected: PASS.

### Task 2: Persist and Surface Cluster Metadata

- [x] **Step 1: Write failing persistence and retrieval tests**

Add a content/seed-level test proving metadata survives the JSON -> seed payload shape.

Add tests in `src/features/retrieval/retrieve-candidates.test.ts`:

- `respect 那组词怎么分` returns `comparisonView.labels` containing `root_family`.
- `access assess excess 怎么区分` returns `comparisonView.labels` containing `shape_like`.
- `institute substitute constitute 怎么分` resolves to one `comparisonView` with labels containing `root_family`.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```powershell
corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts
```

Expected: FAIL because `ComparisonView` currently has no label metadata, Prisma has no metadata columns, and `institute/substitute/constitute` is not yet a shared group.

- [x] **Step 3: Add metadata persistence**

Create migration:

```sql
ALTER TABLE "confusion_group"
ADD COLUMN "labels" text[] NOT NULL DEFAULT ARRAY[]::text[],
ADD COLUMN "anchorPattern" text,
ADD COLUMN "quickDistinction" text,
ADD COLUMN "examHook" text;
```

Update `prisma/schema.prisma` `ConfusionGroup` with:

```prisma
labels           String[] @default([])
anchorPattern    String?
quickDistinction String?
examHook         String?
```

Update `src/features/content/seed-content.ts` to insert those fields.

- [x] **Step 4: Extend retrieval types and comparison view builder**

In `src/features/retrieval/types.ts`, add:

```ts
export type ConfusionClusterLabel =
  | "shape_like"
  | "root_family"
  | "prefix_family"
  | "meaning_near"
  | "collocation_boundary"
  | "exam_high_value";
```

Extend `ComparisonView` with optional-safe metadata:

```ts
labels: ConfusionClusterLabel[];
anchorPattern: string | null;
quickDistinction: string | null;
examHook: string | null;
```

Populate those fields in `buildComparisonView()`.

- [x] **Step 5: Add minimal data for selected groups**

Update `data/exam-vocab/real-smoke/confusion-groups.json`:

- `access-assess-excess`: `["shape_like", "exam_high_value"]`
- `respect-respective-respectful-respectable`: `["root_family", "shape_like", "exam_high_value"]`
- Add or update a `root-stitute` cluster covering at least `institute`, `institution`, `constitute`, `substitute`.
- Add or update a `root-tempt` cluster covering at least `attempt`, `tempt`, `temptation`, `contempt`.

If any new member is missing from `entries.json`, add a thin source-backed entry with `lemma`, `pos`, `meaningsZh`, and `examScopes` only.

- [x] **Step 6: Seed and verify GREEN**

Run serially:

```powershell
corepack pnpm db:migrate
corepack pnpm exec prisma generate
corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke --min-entries 400 --require-source-lemmas
corepack pnpm db:seed:real-smoke
corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts
```

Expected: all pass.

### Task 3: Make Answer Prompt Use Cluster Labels

- [x] **Step 1: Write failing prompt tests**

Add tests in `src/features/answering/build-system-prompt.test.ts` proving:

- `confusion_untangle` with `root_family` label asks the model to explain shared word fragments/structure.
- It does not ask the model to use the old standalone `root_family_summary` wording.
- It still preserves shape-like wording for `shape_like` groups.

- [x] **Step 2: Run prompt tests and verify RED**

Run:

```powershell
corepack pnpm test src/features/answering/build-system-prompt.test.ts
```

Expected: FAIL because prompts do not yet inspect comparison labels.

- [x] **Step 3: Implement label-aware prompt guidance**

In `src/features/answering/build-system-prompt.ts`, add short label-specific lines inside the `confusion_untangle` branch:

- `root_family`: explain common fragment, priority, and do-not-hard-force caution.
- `shape_like`: explain visual/spelling boundary.
- `meaning_near`: explain Chinese meaning boundary.
- `collocation_boundary`: explain fixed collocation and following pattern.

Keep total answer constraints. Do not add new answer style names.

- [x] **Step 4: Verify GREEN**

Run:

```powershell
corepack pnpm test src/features/answering/build-system-prompt.test.ts
```

Expected: PASS.

### Task 4: Add Cluster Smoke Cases

- [x] **Step 1: Add focused smoke cases**

Extend `scripts/run-answer-style-eval.ts`. Do not add a separate runner in this task, and do not put these into `lookalike-smoke-cases.json`, because that runner is intentionally restricted to `shape_neighbor_search`.

The focused cluster smoke should verify these inputs:

- `stitute 是什么`
- `institute substitute constitute 怎么分`
- `跟 institute 一样那几个词怎么记`
- `respect 那组词怎么分`

The first can still use `root_family_summary` during transition, but it must expose the cluster through grounding. The direct comparison should resolve to the same `root-stitute` cluster.

- [x] **Step 2: Run focused deterministic smoke**

Run:

```powershell
corepack pnpm eval:answer-style
corepack pnpm eval:lookalike:real-smoke
```

Expected: pass, with no regression to old shape-like smoke.

- [x] **Step 3: Run focused tests and lint**

Run:

```powershell
corepack pnpm test src/features/content/load-seed-content.test.ts src/features/retrieval/retrieve-candidates.test.ts src/features/answering/build-system-prompt.test.ts
corepack pnpm exec eslint src/features/content/import-schema.ts src/features/retrieval/types.ts src/features/retrieval/retrieve-candidates.ts src/features/retrieval/retrieve-candidates.test.ts src/features/answering/build-system-prompt.ts src/features/answering/build-system-prompt.test.ts
git diff --check
```

Expected: all pass. Only Windows LF/CRLF warnings are acceptable.

### Task 5: Handoff Docs

- [x] **Step 1: Update README**

Update `data/exam-vocab/real-smoke/README.md` with a short explanation:

- ordinary entries are not all groups
- confusion clusters are for words worth remembering together
- cluster labels explain why the group exists

- [x] **Step 2: Update progress**

Update `progress.md` with:

- which labels were added
- which groups were upgraded or added
- verification output
- next recommended task

- [x] **Step 3: Final verification**

Run:

```powershell
corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke --min-entries 400 --require-source-lemmas
corepack pnpm eval:answer-style
corepack pnpm eval:lookalike:real-smoke
git diff --check
```

Expected: all pass.
