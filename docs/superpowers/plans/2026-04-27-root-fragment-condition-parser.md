# Root Fragment Condition Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one-off root / fragment query handling with a structured condition parser that supports prefix, suffix, contains, start-end pattern, and AND-combined word-shape filters.

**Architecture:** Keep the existing `root_family_summary` retrieval and answer style. Refactor `root-fragment-recall.ts` so it parses user wording into `RootFragmentQuery.constraints`, then applies one matcher against real in-scope vocabulary entries. Curated root prototypes (`stitute`, `tempt`) remain separate and continue to take priority.

**Tech Stack:** TypeScript, Next.js, Prisma-backed vocabulary entries, Vitest, existing `eval:answer-style`, `eval:product-smoke`, and provider smoke scripts.

---

## File Structure

- Modify: `src/features/retrieval/root-fragment-recall.ts`
  - Owns `RootFragmentConstraint`, `RootFragmentQuery`, condition parsing, ID generation, matching, and `RootFamilyView` construction for dynamic fragment recall.
- Modify: `src/features/retrieval/normalize-query.ts`
  - Routes structural fragment questions to `root_family_summary` without pulling ordinary lookup into this path.
- Modify: `src/features/retrieval/retrieve-candidates.ts`
  - Uses the new query object and matcher without changing curated prototype priority.
- Modify: `src/features/retrieval/retrieve-candidates.test.ts`
  - Adds integration coverage for suffix, contains, start-end single match, and multi-condition filtering.
- Modify: `src/features/answering/build-system-prompt.ts`
  - Keeps broad table contract aligned with any new dynamic query metadata.
- Modify: `src/features/answering/build-system-prompt.test.ts`
  - Locks prompt behavior if wording needs to mention single-match structural results.
- Modify: `scripts/run-answer-style-eval.ts`
  - Adds deterministic answer-style cases for new structural fragment queries.
- Modify: `scripts/lib/black-box-product-smoke.ts`
  - Adds black-box product smoke coverage for representative condition queries.
- Modify: `scripts/lib/black-box-product-smoke.test.ts`
  - Updates case listing expectations.
- Modify: `scripts/lib/answer-style-provider-smoke.ts`
  - Optionally adds one provider case after deterministic smoke is stable, preferably `tion 结尾的词有哪些` or `有 struct 的词`.
- Modify: `progress.md`
  - Records implementation results and verification.
- Modify: `bugs.md`
  - Removes or narrows stale "fragment search not implemented" wording after the plan lands.

## Task 1: Add Constraint Parser Unit Coverage

**Files:**
- Create or modify: `src/features/retrieval/root-fragment-recall.test.ts`
- Modify: `src/features/retrieval/root-fragment-recall.ts`

- [x] **Step 1: Write failing parser tests**

Add tests for:

```ts
expect(parseRootFragmentRecall("con 开头的词有哪些")).toMatchObject({
  id: "fragment-prefix-con",
  fragment: "con-",
  constraints: [{ type: "prefix", value: "con" }],
});

expect(parseRootFragmentRecall("tion 结尾的词")).toMatchObject({
  id: "fragment-suffix-tion",
  fragment: "-tion",
  constraints: [{ type: "suffix", value: "tion" }],
});

expect(parseRootFragmentRecall("有 struct 的词")).toMatchObject({
  id: "fragment-contains-struct",
  fragment: "struct",
  constraints: [{ type: "contains", value: "struct" }],
});

expect(parseRootFragmentRecall("re...ct 这种词")).toMatchObject({
  id: "fragment-pattern-re-ct",
  fragment: "re...ct",
  constraints: [{ type: "start_end", prefix: "re", suffix: "ct" }],
});

expect(parseRootFragmentRecall("con 开头 re 相关的词")).toMatchObject({
  id: "fragment-prefix-con-contains-re",
  constraints: [
    { type: "prefix", value: "con" },
    { type: "contains", value: "re" },
  ],
});

expect(parseRootFragmentRecall("re+con 的词根有什么词")).toBeNull();
```

- [x] **Step 2: Run parser tests and confirm RED**

Run:

```powershell
corepack pnpm test src/features/retrieval/root-fragment-recall.test.ts
```

Expected: fails because `RootFragmentQuery.constraints`, suffix, contains, and multi-condition parsing do not exist yet.

- [x] **Step 3: Implement parser types and conservative mapping**

In `src/features/retrieval/root-fragment-recall.ts`:

```ts
export type RootFragmentConstraint =
  | { type: "prefix"; value: string }
  | { type: "suffix"; value: string }
  | { type: "contains"; value: string }
  | { type: "start_end"; prefix: string; suffix: string }
  | { type: "ordered_contains"; parts: string[] };

export type RootFragmentQuery = {
  id: string;
  fragment: string;
  constraints: RootFragmentConstraint[];
};
```

Keep `re+con 的词根有什么词` out of this parser unless wording says it is word-shape containment, not root theory.

- [x] **Step 4: Run parser tests and confirm GREEN**

Run:

```powershell
corepack pnpm test src/features/retrieval/root-fragment-recall.test.ts
```

Expected: parser tests pass.

- [x] **Step 5: Commit**

```powershell
git add src/features/retrieval/root-fragment-recall.ts src/features/retrieval/root-fragment-recall.test.ts
git commit -m "feat: parse root fragment constraints"
```

## Task 2: Replace Pattern Matcher With Constraint Matcher

**Files:**
- Modify: `src/features/retrieval/root-fragment-recall.ts`
- Test: `src/features/retrieval/root-fragment-recall.test.ts`

- [x] **Step 1: Write failing matcher tests**

Add tests for a small in-memory entry list:

```ts
const entries = [
  entry("conference", ["n."], ["会议"]),
  entry("condition", ["n."], ["条件"]),
  entry("construct", ["v."], ["建造"]),
  entry("structure", ["n."], ["结构"]),
  entry("respect", ["v.", "n."], ["尊重"]),
];
```

Assert:

- `prefix=con AND contains=re` returns only `conference`.
- `contains=struct` returns `construct / structure`.
- `start_end re...ct` returns `respect`.
- 0 matches returns `[]`.
- Single structural match is allowed.

- [x] **Step 2: Run matcher tests and confirm RED**

Run:

```powershell
corepack pnpm test src/features/retrieval/root-fragment-recall.test.ts
```

Expected: fails because matcher still branches on `kind`.

- [x] **Step 3: Implement `lemmaMatchesConstraints`**

Replace kind-specific matching with:

```ts
function lemmaMatchesConstraint(lemma: string, constraint: RootFragmentConstraint) {
  if (constraint.type === "prefix") return lemma.startsWith(constraint.value);
  if (constraint.type === "suffix") return lemma.endsWith(constraint.value);
  if (constraint.type === "contains") return lemma.includes(constraint.value);
  if (constraint.type === "start_end") {
    return lemma.startsWith(constraint.prefix)
      && lemma.endsWith(constraint.suffix)
      && lemma.length > constraint.prefix.length + constraint.suffix.length;
  }
  // ordered_contains
  let searchFrom = 0;
  for (const part of constraint.parts) {
    const index = lemma.indexOf(part, searchFrom);
    if (index === -1) return false;
    searchFrom = index + part.length;
  }
  return true;
}
```

Then require every constraint to match.

- [x] **Step 4: Run matcher tests and confirm GREEN**

Run:

```powershell
corepack pnpm test src/features/retrieval/root-fragment-recall.test.ts
```

Expected: all parser and matcher tests pass.

- [x] **Step 5: Commit**

```powershell
git add src/features/retrieval/root-fragment-recall.ts src/features/retrieval/root-fragment-recall.test.ts
git commit -m "feat: match root fragment constraints"
```

## Task 3: Integrate Dynamic Condition Queries

**Files:**
- Modify: `src/features/retrieval/normalize-query.ts`
- Modify: `src/features/retrieval/retrieve-candidates.ts`
- Modify: `src/features/retrieval/retrieve-candidates.test.ts`

- [x] **Step 1: Write failing retrieval integration tests**

Add cases:

```ts
it("resolves suffix fragment recall from in-scope entries", async () => {
  const result = await retrieveCandidates({
    activeExamTarget: "cet6",
    query: "tion 结尾的词有哪些",
  });

  expect(result.queryMode).toBe("root_family_summary");
  expect(result.resolution).toBe("resolved");
  expect(result.rootFamilyView?.id).toBe("fragment-suffix-tion");
  const lemmas = result.rootFamilyView?.members.map((member) => member.lemma) ?? [];
  expect(lemmas.length).toBeGreaterThan(8);
  expect(lemmas.every((lemma) => lemma.endsWith("tion"))).toBe(true);
  expect(lemmas).toEqual(expect.arrayContaining([
    "condition",
    "connection",
    "function",
    "institution",
    "temptation",
    "tradition",
  ]));
});
```

Also add:

- `有 struct 的词` -> `construct / structure`
- `con 开头 re 相关的词` -> `conference`
- `re...ct 这种词` -> `respect`
- `re+con 的词根有什么词` remains `no_match`
- Negative routing tests: `content 是什么意思`, `inter 是什么意思`, and `con 是什么意思` must not become dynamic fragment recall.

- [x] **Step 2: Run integration tests and confirm RED**

Run:

```powershell
corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts -t "fragment|root"
```

Expected: new condition cases fail under the current parser.

Actual during execution: after Task 1-2, the existing dynamic retrieval branch was already using `parseRootFragmentRecall`, so the new fragment integration cases were GREEN immediately. The first full retrieval run failed on the known Prisma dev `Connection terminated unexpectedly` environment issue; a non-deleting restart plus migrate/seed restored the database and the full file passed.

- [x] **Step 3: Wire parser into query-mode routing**

In `normalize-query.ts`, make routing depend on concrete structure:

- route to `root_family_summary` when `findRootFamilyPrototype(normalizedText)` is not null
- route to `root_family_summary` when `parseRootFragmentRecall(normalizedText)` returns a `RootFragmentQuery`
- keep direct comparisons and shape-neighbor routing ahead of generic fuzzy recall

Do not route based only on broad words like `相关`. Those cues are valid only when the parser has extracted at least one explicit word-shape constraint.

Add or keep negative tests proving these stay out of dynamic fragment recall:

- `content 是什么意思`
- `inter 是什么意思`
- `con 是什么意思`
- `re+con 的词根有什么词`

- [x] **Step 4: Build `RootFamilyView` from condition query**

In `retrieve-candidates.ts`, continue:

- prototype first
- dynamic condition parser second
- no-match fallback last

For single-match structural queries, return resolved. The visible answer can say the current scope only matched one word.

- [x] **Step 5: Run integration tests and confirm GREEN**

Run:

```powershell
corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts
```

Expected: all retrieval tests pass.

- [x] **Step 6: Commit**

```powershell
git add src/features/retrieval/normalize-query.ts src/features/retrieval/retrieve-candidates.ts src/features/retrieval/retrieve-candidates.test.ts
git commit -m "feat: resolve root fragment condition queries"
```

## Task 4: Update Local Product Smoke

**Files:**
- Modify: `scripts/run-answer-style-eval.ts`
- Modify: `scripts/lib/black-box-product-smoke.ts`
- Modify: `scripts/lib/black-box-product-smoke.test.ts`

- [x] **Step 1: Add deterministic eval cases**

After Task 3 is green, add deterministic regression smoke cases. These smoke cases verify the integrated behavior; the parser and retrieval tests above are the main RED/GREEN guardrail.

Add cases for:

- `tion 结尾的词有哪些`
- `有 struct 的词`
- `con 开头 re 相关的词`
- `re...ct 这种词`
- `re+con 的词根有什么词`

Expected:

- first four are `root_family_summary / resolved`
- `re+con` remains `root_family_summary / no_match`

- [x] **Step 2: Run local evals and confirm failures where expected**

Run:

```powershell
corepack pnpm eval:answer-style
corepack pnpm eval:product-smoke
```

Expected before implementation is complete: new cases fail. After Task 3, they should pass.

- [x] **Step 3: Update black-box case tests**

Update `scripts/lib/black-box-product-smoke.test.ts` to assert the new case names and expected root family view IDs.

- [x] **Step 4: Run smoke tests**

Run:

```powershell
corepack pnpm test scripts/lib/black-box-product-smoke.test.ts
corepack pnpm eval:answer-style
corepack pnpm eval:product-smoke
```

Expected:

- answer-style eval passes
- product smoke passes
- product smoke category totals now include the new root-family cases

- [x] **Step 5: Commit**

```powershell
git add scripts/run-answer-style-eval.ts scripts/lib/black-box-product-smoke.ts scripts/lib/black-box-product-smoke.test.ts
git commit -m "test: cover root fragment condition smoke"
```

## Task 5: Provider Smoke and Prompt Tightening

**Files:**
- Modify: `scripts/lib/answer-style-provider-smoke.ts`
- Modify: `scripts/lib/answer-style-provider-smoke.test.ts`
- Modify if needed: `src/features/answering/build-system-prompt.ts`
- Modify if needed: `src/features/answering/build-system-prompt.test.ts`

- [x] **Step 1: Add one provider case after local smoke is green**

Prefer one of:

- `tion 结尾的词有哪些` for broad table behavior
- `有 struct 的词` for narrow structural recall

Do not add every deterministic case to provider smoke; keep real-provider cost bounded.

- [x] **Step 2: Run provider smoke**

Start local app if needed, then run:

```powershell
corepack pnpm eval:answer-style:provider
```

Expected:

- 0 hard fail
- no `providerUnknown`
- new case produces grounded answer
- if broad, answer uses `word | 词性 | 核心义`

Actual during execution: `corepack pnpm eval:answer-style:provider` returned 16 total / 15 pass / 1 manual / 0 fail, `providerUnknown=0`. The new `root: tion suffix fragment` case passed with broad table output; the only manual flag was the pre-existing `access/assess/excess` confusion case exceeding the 450-char budget.

- [x] **Step 3: Tighten prompt only if the real output proves a repeated issue**

Do not preemptively add more prompt rules. Only tighten if provider output:

- invents words
- omits table members
- drops part-of-speech
- expands into a long word-origin lecture

- [x] **Step 4: Commit**

```powershell
git add scripts/lib/answer-style-provider-smoke.ts scripts/lib/answer-style-provider-smoke.test.ts src/features/answering/build-system-prompt.ts src/features/answering/build-system-prompt.test.ts
git commit -m "test: add provider smoke for fragment conditions"
```

## Task 6: Final Verification and Handoff

**Files:**
- Modify: `progress.md`
- Modify: `bugs.md`

- [ ] **Step 1: Run final verification**

Run:

```powershell
corepack pnpm test src/features/retrieval/root-fragment-recall.test.ts src/features/retrieval/retrieve-candidates.test.ts src/features/answering/build-system-prompt.test.ts scripts/lib/black-box-product-smoke.test.ts scripts/lib/answer-style-provider-smoke.test.ts
corepack pnpm eval:answer-style
corepack pnpm eval:product-smoke
corepack pnpm eval:answer-style:provider
corepack pnpm exec eslint src/features/retrieval/root-fragment-recall.ts src/features/retrieval/normalize-query.ts src/features/retrieval/retrieve-candidates.ts src/features/retrieval/retrieve-candidates.test.ts src/features/answering/build-system-prompt.ts src/features/answering/build-system-prompt.test.ts scripts/run-answer-style-eval.ts scripts/lib/black-box-product-smoke.ts scripts/lib/black-box-product-smoke.test.ts scripts/lib/answer-style-provider-smoke.ts scripts/lib/answer-style-provider-smoke.test.ts
git diff --check
```

Expected:

- tests pass
- local smoke passes
- provider smoke has 0 hard fail
- `git diff --check` has no whitespace error, Windows line-ending warnings are acceptable

- [ ] **Step 2: Update docs**

Update `progress.md` with:

- new condition types
- exact smoke results
- provider smoke result
- any remaining unsupported query classes

Update `bugs.md` to narrow the remaining fragment gap to semantic/root-theory queries, not structural word-shape filters.

- [ ] **Step 3: Final commit**

```powershell
git add progress.md bugs.md
git commit -m "docs: record root fragment condition parser"
```

## Notes for Execution

- Do not broaden ordinary lookup.
- Do not add vocabulary data.
- Keep `re+con 的词根有什么词` conservative unless the user explicitly decides it should be treated as word-shape containment.
- If Prisma dev fails with connection errors, use the documented recovery path in `bugs.md` before changing retrieval logic.
- Keep provider smoke bounded; deterministic smoke should carry most of the matrix.
