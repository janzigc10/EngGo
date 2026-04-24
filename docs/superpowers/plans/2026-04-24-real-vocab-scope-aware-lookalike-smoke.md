# Real Vocab Scope-Aware Lookalike Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that EngGo can use real exam vocabulary data to find lookalike words inside the active exam scope, show their Chinese core meanings, and keep the answer concise enough for student-facing confusion resolution.

**Architecture:** Keep the current retrieval-first chain. Add a named real-smoke vocabulary dataset path beside the current seed dataset, then seed it explicitly instead of changing the default `db:seed` behavior. Upgrade `shape_neighbor_search` so it can fall back to dynamic in-scope lookalike recall even when no curated `confusion_group` exists; curated groups remain preferred when available.

**Tech Stack:** Next.js 16, TypeScript, Prisma 7, PostgreSQL/Prisma dev, `pg_trgm`, Vitest, `tsx`, existing `/api/chat`, existing OpenAI-compatible provider smoke runner.

---

## Scope Boundaries

This plan starts after:

- `docs/superpowers/plans/2026-04-24-enggo-answer-style-real-provider-smoke.md`
- the DeepSeek provider smoke rerun recorded in `progress.md`
- the product decision that `confusion_untangle` should become:
  - scope-aware recall
  - English word + Chinese core meaning
  - priority contrast
  - exam cue

Do:

- keep the default seed dataset untouched
- add an explicit real-smoke dataset loading path
- use real user-provided or otherwise confirmed source vocabulary, not invented filler
- verify scope-aware lookalike recall with deterministic eval before real provider calls
- ensure every recalled word surfaced to the model has at least one Chinese meaning
- update `confusion_untangle` prompt/eval expectations to the new structure after retrieval is trustworthy
- keep all Prisma-backed checks serial

Do not:

- replace the current 82-entry seed as the default local baseline
- ingest full vocabulary lists before the smoke dataset and recall behavior are verified
- relax `reqeust` / `recomand` typo gates
- implement root/fragment search for `re+con`, `re...ct`, or broad prefix queries
- add root-family database tables
- add real-provider smoke to `corepack pnpm verify`
- run `verify`, `eval:shape`, `eval:answer-style`, or provider smoke in parallel

## File Structure

- Modify: `src/features/content/load-seed-content.ts`
  - Keep `loadSeedContent()` as the default seed loader.
  - Add `loadVocabContent({ datasetName })` for explicit dataset names such as `seed` and `real-smoke`.
- Create: `src/features/content/load-seed-content.test.ts`
  - Unit-test dataset path selection, schema validation, duplicate checks, and missing member checks without touching Prisma.
- Modify: `prisma/seed.ts`
  - Accept `--dataset <name>` while defaulting to `seed`.
- Modify: `package.json`
  - Add `db:seed:real-smoke` and `eval:lookalike:real-smoke`.
- Create: `data/exam-vocab/real-smoke/README.md`
  - Document the source-file contract and the rule against fabricated vocabulary.
- Create after source data is available: `data/exam-vocab/real-smoke/entries.json`
  - Normalized first real-smoke entry set using the existing vocabulary seed schema.
- Create after source data is available: `data/exam-vocab/real-smoke/confusion-groups.json`
  - Optional curated groups only when the real source or manual review confirms the group.
- Create after source data is available: `data/exam-vocab/real-smoke/lookalike-smoke-cases.json`
  - Dataset-specific expected cases for scope-aware lookalike recall.
- Modify: `src/features/retrieval/retrieval-sql.ts`
  - Add a focused in-scope lookalike query helper.
- Modify: `src/features/retrieval/retrieve-candidates.ts`
  - Let `shape_neighbor_search` return dynamic in-scope lookalikes when no curated group exists.
- Modify: `src/features/retrieval/retrieve-candidates.test.ts`
  - Add integration coverage for scope filtering and dynamic lookalike fallback.
- Modify: `src/features/answering/build-grounding.ts`
  - Derive `confusion_untangle` for resolved `shape_neighbor_search` even without a curated `comparisonView`.
- Modify: `src/features/answering/build-system-prompt.ts`
  - Replace the old "为什么会混 / 先问一句 / 题里抓" structure with the new scope-aware recall structure.
- Modify: `src/features/answering/build-system-prompt.test.ts`
  - Lock the new prompt structure.
- Modify: `scripts/run-answer-style-eval.ts`
  - Update prompt snippets from the old structure to the new one.
- Create: `scripts/run-real-vocab-lookalike-smoke.ts`
  - Read dataset smoke cases, call `retrieveCandidates`, assert grounding shape, and print a concise JSON summary.
- Modify: `progress.md`
  - Record the plan, exact command outcomes, and next step.
- Optional modify: `bugs.md`
  - Only if this work confirms a new stable issue not already documented.

## Data Contract

The real-smoke dataset must use the current import schemas:

```ts
type VocabularySeedPayload = {
  id: string;
  lemma: string;
  aliases: string[];
  pos: string[];
  meaningsZh: string[];
  examScopes: Array<"gaokao" | "cet4" | "cet6" | "postgrad">;
  examples: string[];
  collocations: string[];
};

type ConfusionGroupSeedPayload = {
  id: string;
  members: string[];
  teachFirst: string;
  whyConfusing: string;
  commonMisusePoints?: string[];
  semanticBoundaryNotes?: string[];
  memberNotes?: Partial<Record<string, string>>;
};
```

The first real-smoke run should not be random. It should be a structured middle-sized slice:

- enough entries per exam scope to make lookalike density meaningful
- at least 30-50 complete lookalike clusters or dataset-specific smoke cases
- enough overlap to prove active-scope behavior, for example one query where CET-6 returns a smaller group and postgrad returns a larger group

If the source vocabulary files are not present, stop at Task 2 and record the blocker in `progress.md`. Do not invent "real" entries to make tests pass.

### 2026-04-24 Source Pivot

The first pass hit the original blocker at Task 2 Step 3 because no source files were present in the repository. The revised route is:

- use source-checkable official lemma manifests first, not commercial word-book content
- start with a smaller source-backed smoke slice to unblock loader/seed validation
- back `gaokao`, `cet4`, and `cet6` from:
  - 教育部《普通高中英语课程标准（2017年版2020年修订）》附录 2 词汇表
  - 中国教育考试网《全国大学英语四、六级考试大纲（2016年修订版）》词表
- keep `postgrad` out of `real-smoke` until an entry-level, source-checkable postgrad vocabulary file is available

This means Task 2 Step 4 now expects source-backed `gaokao`, `cet4`, and `cet6` coverage for the first smoke slice. Full 300-800 word coverage and `postgrad` scope remain gated follow-up work, not a reason to fabricate entries in this step.

### Task 1: Add Explicit Dataset Loading Without Changing The Default Seed

**Files:**
- Modify: `src/features/content/load-seed-content.ts`
- Create: `src/features/content/load-seed-content.test.ts`
- Modify: `prisma/seed.ts`
- Modify: `package.json`

- [x] **Step 1: Write failing loader tests**

Add tests that create temporary fixture directories and assert:

```ts
const content = await loadVocabContent({
  datasetName: "fixture-real-smoke",
  baseDir: fixtureRoot,
});

expect(content.entries.map((entry) => entry.lemma)).toEqual(["stationary", "stationery"]);
expect(content.confusionGroups[0].members).toEqual(["stationary", "stationery"]);
```

Also add failing tests for:

- duplicate entry ids
- duplicate group ids
- group member references missing entry ids
- `teachFirst` not included in members

Expected before implementation: FAIL because `loadVocabContent` and dataset base override do not exist.

- [x] **Step 2: Run the failing loader tests**

Run:

```powershell
corepack pnpm test src/features/content/load-seed-content.test.ts
```

Expected: FAIL for missing export or unsupported dataset argument.

- [x] **Step 3: Implement `loadVocabContent`**

In `src/features/content/load-seed-content.ts`, keep the current validation logic but parameterize the dataset directory:

```ts
export async function loadVocabContent({
  datasetName = "seed",
  baseDir = path.join(process.cwd(), "data", "exam-vocab"),
} = {}) {
  const seedDir = path.join(baseDir, datasetName);
  // read entries.json and confusion-groups.json, parse existing schemas,
  // run duplicate checks, ensure group members exist, assert requirements
}

export async function loadSeedContent() {
  return loadVocabContent({ datasetName: "seed" });
}
```

Keep the existing public behavior of `loadSeedContent()`.

- [x] **Step 4: Add the seed CLI dataset argument**

In `prisma/seed.ts`, parse:

```ts
const datasetArgIndex = process.argv.indexOf("--dataset");
const datasetName = datasetArgIndex === -1
  ? "seed"
  : process.argv[datasetArgIndex + 1];
```

Then call:

```ts
const seedData = await loadVocabContent({ datasetName });
```

If `--dataset` is provided without a value, throw a clear error.

- [x] **Step 5: Add the explicit package script**

In `package.json`, add:

```json
"db:seed:real-smoke": "tsx prisma/seed.ts --dataset real-smoke"
```

Do not change `db:seed`; it must continue to use the default seed dataset.

- [x] **Step 6: Run loader tests to green**

Run:

```powershell
corepack pnpm test src/features/content/load-seed-content.test.ts
corepack pnpm test src/features/content/seed-content-rules.test.ts
```

Expected: both pass.

### Task 2: Stage And Validate The Real-Smoke Vocabulary Dataset

**Files:**
- Create: `data/exam-vocab/real-smoke/README.md`
- Create: `data/exam-vocab/real-smoke/entries.json`
- Create: `data/exam-vocab/real-smoke/confusion-groups.json`
- Create: `data/exam-vocab/real-smoke/lookalike-smoke-cases.json`
- Modify: `scripts/check-seed-content.ts`
- Optional create: `scripts/check-vocab-content.ts`

- [x] **Step 1: Document the real-smoke source contract**

Create `data/exam-vocab/real-smoke/README.md` with:

- source name and date
- what each file contains
- rule: do not hand-invent real vocabulary entries
- rule: every entry must have at least one Chinese meaning
- rule: duplicate lemmas across scopes should merge into one entry with multiple `examScopes`
- rule: curated confusion groups require manual confirmation

- [x] **Step 2: Add dataset-aware content checking**

Either modify `scripts/check-seed-content.ts` to accept `--dataset`, or create `scripts/check-vocab-content.ts`.

Expected command:

```powershell
corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke
```

Expected output shape:

```text
Vocab content valid: <N> entries, <M> confusion groups, scopes=gaokao, cet4, cet6, postgrad.
```

- [x] **Step 3: Add source files or stop with a documented blocker**

If real source files are available, normalize them into:

```text
data/exam-vocab/real-smoke/entries.json
data/exam-vocab/real-smoke/confusion-groups.json
data/exam-vocab/real-smoke/lookalike-smoke-cases.json
```

If source files are not available, stop here and update `progress.md` with:

```text
Blocked: real vocabulary source files are not present; do not fabricate entries.
```

- [x] **Step 4: Validate normalized content**

Run:

```powershell
corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke
```

Expected: PASS with non-zero entry count and source-backed `gaokao`, `cet4`, and `cet6` scopes represented. `postgrad` remains intentionally absent until a source-checkable postgrad vocabulary file is available.

- [x] **Step 5: Seed the real-smoke dataset serially**

Run:

```powershell
corepack pnpm exec prisma dev ls
corepack pnpm db:seed:real-smoke
corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke
```

Expected:

- `enggo` is running before seeding
- seed command succeeds
- content checker succeeds

Do not run this in parallel with any eval or `verify` command.

### Task 3: Add Scope-Aware Dynamic Lookalike Retrieval

**Files:**
- Modify: `src/features/retrieval/retrieval-sql.ts`
- Modify: `src/features/retrieval/retrieve-candidates.ts`
- Modify: `src/features/retrieval/retrieve-candidates.test.ts`
- Modify: `src/features/answering/build-grounding.ts`

- [x] **Step 1: Write failing retrieval tests for active-scope differences**

Add tests that seed or fixture data can prove:

```ts
const cet6 = await retrieveCandidates({
  activeExamTarget: "cet6",
  query: "跟 stationary 很像的词有哪些",
});

expect(cet6.queryMode).toBe("shape_neighbor_search");
expect(cet6.resolution).toBe("resolved");
expect(cet6.mainAnswer.map((item) => item.lemma)).toContain("stationary");
expect(cet6.mainAnswer.map((item) => item.lemma)).toContain("stationery");
expect(cet6.mainAnswer.every((item) => item.inScope)).toBe(true);
expect(cet6.mainAnswer.every((item) => item.meaningsZh.length > 0)).toBe(true);
```

Add a second scope test from the real-smoke `lookalike-smoke-cases.json` that expects a different candidate count or different expected includes for another exam scope.

Expected before implementation: FAIL if no curated `confusion_group` exists for the source word or if the handler returns out-of-scope candidates.

- [x] **Step 2: Add focused SQL for in-scope lookalikes**

In `src/features/retrieval/retrieval-sql.ts`, add a helper like:

```ts
export async function findInScopeLookalikeRows(
  activeExamTarget: ExamScopeCode,
  needle: string,
  limit = 8,
) {
  // query vocabulary_entry joined to vocabulary_entry_scope for active scope
  // include exact lemma plus high-similarity lemmas
  // order exact first, then similarity desc, then lemma asc
}
```

This helper should:

- filter to `vocabulary_entry_scope.scopeCode = activeExamTarget`
- include the exact source lemma if present in scope
- include lookalikes above a conservative similarity threshold
- return enough rows for 2-6 candidates, not a long list

- [x] **Step 3: Implement dynamic fallback in `handleShapeNeighborSearch`**

Keep current curated group behavior first. If no `bestGroup` exists, use the new SQL helper:

```ts
const dynamicLookalikes = await findInScopeLookalikeRows(
  input.activeExamTarget,
  normalizedQuery.englishTerms[0],
  8,
);
```

Return `no_match` if fewer than 2 in-scope candidates remain after ranking.

Return `resolved` with:

- `mainAnswer`: the exact source plus top in-scope lookalikes
- `confusionBoundary`: `[]`
- `comparisonView`: `null`
- all selected candidates containing `meaningsZh`

- [x] **Step 4: Treat resolved shape-neighbor as `confusion_untangle`**

In `build-grounding.ts`, change `deriveAnswerStyle` so resolved `shape_neighbor_search` can still use `confusion_untangle` without a curated `comparisonView`.

Suggested rule:

```ts
if (queryMode === "shape_neighbor_search") {
  return "confusion_untangle";
}
```

Keep `root_family_summary` first.

- [x] **Step 5: Run retrieval tests to green**

Run:

```powershell
corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts
corepack pnpm test src/features/answering/chat-service.test.ts
```

Expected: all pass.

### Task 4: Update `confusion_untangle` To The New Answer Structure

**Files:**
- Modify: `src/features/answering/build-system-prompt.ts`
- Modify: `src/features/answering/build-system-prompt.test.ts`
- Modify: `scripts/run-answer-style-eval.ts`
- Modify: `scripts/lib/answer-style-provider-smoke.ts`

- [x] **Step 1: Write failing prompt tests for the new structure**

Update prompt tests to assert the `confusion_untangle` prompt contains:

```ts
expect(prompt).toContain("当前考试范围");
expect(prompt).toContain("每个词必须带中文核心义");
expect(prompt).toContain("先列范围内召回到的相似词");
expect(prompt).toContain("优先区分最容易混的 2 个");
expect(prompt).toContain("做题抓手");
```

Remove expectations that require `"先问一句"` as the central structure.

Expected before implementation: FAIL because the prompt still uses the old structure.

- [x] **Step 2: Implement the new `confusion_untangle` prompt**

Replace the old three-part structure with:

```text
只输出这 4 段：范围内相似词、词义速览、重点区分、做题抓手。
范围内相似词：说明在当前考试范围里，和用户给的词长得像的有哪些。
词义速览：每个词必须写英文词 + 中文核心义，不能只列英文。
重点区分：如果超过 2 个词，优先讲最容易混的 2 个，其余先给中文方向。
做题抓手：只给最有用的词性、搭配或场景题眼。
```

Keep the guardrail:

```text
不要使用 e= envelope 这类牵强字母口诀；优先用语义、词性、搭配和场景做边界。
```

- [x] **Step 3: Update deterministic eval snippets**

In `scripts/run-answer-style-eval.ts`, change expected prompt snippets for confusion cases from:

```ts
["先问一句", "题里抓"]
```

to:

```ts
["范围内相似词", "词义速览", "做题抓手"]
```

- [x] **Step 4: Update provider smoke manual checks**

In `scripts/lib/answer-style-provider-smoke.ts`, update `confusion_untangle` manual checks so they ask:

- did the answer list the active-scope lookalike words?
- did every listed word include Chinese core meaning?
- did it prioritize the 2 most confusing words instead of spreading evenly?
- did it provide one concrete exam cue?

- [x] **Step 5: Run answer style checks**

Run:

```powershell
corepack pnpm test src/features/answering/build-system-prompt.test.ts
corepack pnpm eval:answer-style
corepack pnpm test scripts/lib/answer-style-provider-smoke.test.ts
```

Expected: all pass.

### Task 5: Add A Real-Smoke Lookalike Eval Runner

**Files:**
- Create: `scripts/run-real-vocab-lookalike-smoke.ts`
- Modify: `package.json`

- [x] **Step 1: Write the runner against `lookalike-smoke-cases.json`**

Each smoke case should include:

```ts
type LookalikeSmokeCase = {
  name: string;
  query: string;
  activeExamTarget: ExamScopeCode;
  expectedQueryMode: "shape_neighbor_search";
  expectedResolution: "resolved";
  expectedIncludes: string[];
  expectedExcludes?: string[];
  minCandidates: number;
  maxCandidates: number;
};
```

The runner should assert:

- query mode is `shape_neighbor_search`
- resolution is `resolved`
- all expected includes are present
- expected excludes are absent
- every selected candidate is in the active scope
- every selected candidate has at least one Chinese meaning
- candidate count is between `minCandidates` and `maxCandidates`

- [x] **Step 2: Add summary output**

Print one line per case:

```text
[PASS] cet6 stationary lookalikes | lemmas=stationary/stationery | elapsed=123ms
```

Then print:

```json
{
  "total": 0,
  "pass": 0,
  "fail": 0,
  "averageElapsedMs": 0
}
```

Exit with code `1` if any case fails.

- [x] **Step 3: Add package script**

In `package.json`, add:

```json
"eval:lookalike:real-smoke": "tsx scripts/run-real-vocab-lookalike-smoke.ts --dataset real-smoke"
```

- [x] **Step 4: Run the real-smoke eval serially**

Run:

```powershell
corepack pnpm exec prisma dev ls
corepack pnpm db:seed:real-smoke
corepack pnpm eval:lookalike:real-smoke
```

Expected:

- Prisma dev is running
- real-smoke seed succeeds
- lookalike eval has `fail: 0`

### Task 6: Run Targeted Verification And Optional Provider Smoke

**Files:**
- Modify: `progress.md`
- Optional modify: `bugs.md`

- [x] **Step 1: Run local deterministic checks serially**

Run:

```powershell
corepack pnpm test src/features/content/load-seed-content.test.ts
corepack pnpm test src/features/content/seed-content-rules.test.ts
corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts
corepack pnpm test src/features/answering/build-system-prompt.test.ts
corepack pnpm test src/features/answering/chat-service.test.ts
corepack pnpm eval:answer-style
corepack pnpm eval:lookalike:real-smoke
```

Expected: all pass.

- [x] **Step 2: Run lint on touched files**

Run:

```powershell
corepack pnpm exec eslint src/features/content/load-seed-content.ts src/features/content/load-seed-content.test.ts src/features/retrieval/retrieval-sql.ts src/features/retrieval/retrieve-candidates.ts src/features/retrieval/retrieve-candidates.test.ts src/features/answering/build-grounding.ts src/features/answering/build-system-prompt.ts src/features/answering/build-system-prompt.test.ts scripts/run-answer-style-eval.ts scripts/lib/answer-style-provider-smoke.ts scripts/run-real-vocab-lookalike-smoke.ts prisma/seed.ts
```

Expected: no lint errors.

- [ ] **Step 3: Run a small provider smoke only after local checks pass**

Start the local app:

```powershell
corepack pnpm dev
```

Then run:

```powershell
corepack pnpm eval:answer-style:provider
```

Expected:

- `fail: 0`
- manual cases, if any, are about wording quality rather than grounding/query-mode drift
- no-match cases still skip provider

Stop the dev server after the smoke run.

- [x] **Step 4: Update handoff docs**

Update `progress.md` with:

- exact source dataset status
- entry and scope counts
- lookalike smoke summary
- answer-style summary
- provider smoke summary if run
- whether the next step should be full real vocabulary ingestion, more structured real-smoke cases, or prompt threshold calibration

Update `bugs.md` only for newly confirmed stable issues.

### Task 7: Completion Gate

**Files:**
- Modify: `docs/superpowers/plans/2026-04-24-real-vocab-scope-aware-lookalike-smoke.md`

- [ ] **Step 1: Mark steps as completed during execution**

As each step finishes, immediately change the checkbox from `- [ ]` to `- [x]`.

- [ ] **Step 2: Do not claim completion without fresh verification**

Before marking the plan complete, rerun the relevant commands from Task 6 and record exact outcomes in `progress.md`.

- [ ] **Step 3: Keep full ingestion gated**

Do not move to full real vocabulary ingestion until:

- `eval:lookalike:real-smoke` has `fail: 0`
- all selected candidates carry Chinese meanings
- at least one smoke case proves active exam scope changes the lookalike set
- no provider hard fails are present in the optional provider smoke
