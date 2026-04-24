# EngGo Answer Style And Root Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make EngGo answers visibly follow the new "confusion untangle" style, and add a minimal `root_family_summary` closed loop without creating root-family database tables.

**Architecture:** Keep retrieval-first, generation-second. Add a small answer-style contract to grounding, route root/fragment intent into a new query mode, and use a tiny curated root-family prototype layer only for first-phase validation. This phase must not loosen low-confidence typo gates, must not add a root schema/table, and must not turn chat output into a generic word-origin article.

**Tech Stack:** Next.js 16, TypeScript, Prisma 7, PostgreSQL/Prisma dev, Vitest, `tsx` eval scripts, existing OpenAI-compatible chat provider.

---

## Scope Boundaries

This plan is the first implementation slice after:

- `docs/superpowers/plans/2026-04-23-enggo-confusion-taxonomy-roadmap.md`
- `docs/superpowers/plans/2026-04-23-shape-neighbor-p0-seed-expansion.md`

Do:

- make `confusion_untangle` prompts require "先问一句", 2-4 decision branches, exam cues, and concise closing distinctions
- introduce `root_family_summary` as an explicit query mode and answer style
- support a tiny, curated root prototype set for `stitute` and `tempt`
- keep `re+con` / unsupported root-combination inputs conservative when the prototype layer cannot ground them
- add deterministic local eval coverage before optional real-provider smoke

Do not:

- add root-family Prisma models or migrations
- bulk-expand seed vocabulary
- relax `reqeust` / `recomand` typo behavior
- let the model invent ungrounded family members as the main explanation
- run Prisma-backed verification commands in parallel

## File Structure

- Modify `src/features/retrieval/types.ts`
  - Add `root_family_summary` to `QueryMode`.
  - Add `AnswerStyle`, `RootFamilyView`, and optional `rootFamilyView` on `RetrievalResult`.
- Modify `src/features/retrieval/normalize-query.ts`
  - Detect root/fragment intent while preserving existing direct compare, shape-neighbor, and fuzzy-recall boundaries.
- Create `src/features/retrieval/root-family-prototypes.ts`
  - Hold the small first-phase root prototype data and matcher helpers.
- Create `src/features/retrieval/root-family-prototypes.test.ts`
  - Test prototype matching, priority labels, and "do not hard-fit" cautions.
- Modify `src/features/retrieval/retrieve-candidates.ts`
  - Add `handleRootFamilySummary`.
  - Return `rootFamilyView` for grounded root prototypes.
  - Return no-match for unsupported root requests without calling the model.
- Modify `src/features/retrieval/retrieve-candidates.test.ts`
  - Add query-mode and retrieval integration coverage for root-family inputs.
  - Update fixtures if `RetrievalResult` requires `rootFamilyView`.
- Modify `src/features/answering/build-grounding.ts`
  - Carry `answerStyle` and `rootFamilyView` into `AnswerGrounding`.
  - Give root no-match a root-specific follow-up prompt.
- Modify `src/features/answering/build-system-prompt.ts`
  - Branch prompt instructions by `answerStyle`.
- Modify `src/features/answering/build-system-prompt.test.ts`
  - Lock prompt guardrails for `confusion_untangle` and `root_family_summary`.
- Modify `src/features/answering/chat-service.ts`
  - Make no-match answer text aware of `root_family_summary`.
- Modify `src/features/answering/chat-service.test.ts`
  - Update fixtures and add root no-match / root resolved behavior checks.
- Create `scripts/run-answer-style-eval.ts`
  - Deterministically evaluate retrieval, grounding, prompt style, and provider short-circuit behavior with a fake provider.
- Modify `package.json`
  - Add `eval:answer-style`.
- Modify `progress.md`
  - Record finished tasks, exact command outcomes, and next handoff.
- Optional modify `bugs.md`
  - Only if a new confirmed environment pitfall or product-side blocker appears.

### Task 1: Add Answer Style Contract And Prompt Guardrails

**Files:**
- Modify: `src/features/retrieval/types.ts`
- Modify: `src/features/answering/build-grounding.ts`
- Modify: `src/features/answering/build-system-prompt.ts`
- Modify: `src/features/answering/build-system-prompt.test.ts`
- Modify: `src/features/answering/chat-service.test.ts`

- [x] **Step 1: Write failing prompt tests for confusion untangle style**

Add a `comparisonView` fixture in `src/features/answering/build-system-prompt.test.ts` for `stationary / stationery`.

Assert the system prompt contains:

```ts
expect(prompt).toContain("先问一句");
expect(prompt).toContain("2-4 个分流项");
expect(prompt).toContain("题里抓");
expect(prompt).toContain("不要把回答写成泛泛词典百科");
```

Expected before implementation: FAIL because the prompt only says "并列对比方式组织回答" or "形近词簇".

- [x] **Step 2: Write failing prompt tests for root-family style**

Add a `rootFamilyView` fixture for `stitute` and assert:

```ts
expect(prompt).toContain("词根家族地图");
expect(prompt).toContain("前缀方向");
expect(prompt).toContain("优先背");
expect(prompt).toContain("不成立");
expect(prompt).toContain("不要硬凑");
```

Expected before implementation: FAIL because `AnswerGrounding` has no `rootFamilyView` or `answerStyle`.

- [x] **Step 3: Run the failing prompt test**

Run:

```powershell
corepack pnpm test src/features/answering/build-system-prompt.test.ts
```

Expected: FAIL for missing style-specific prompt content or missing type fields.

- [x] **Step 4: Add answer-style types and grounding derivation**

In `src/features/retrieval/types.ts`, add:

```ts
export type AnswerStyle =
  | "standard_lookup"
  | "confusion_untangle"
  | "root_family_summary";
```

In `AnswerGrounding`, include:

```ts
answerStyle: AnswerStyle;
rootFamilyView: RootFamilyView | null;
```

Derive the style in `buildGrounding`:

- `queryMode === "root_family_summary"` -> `root_family_summary`
- `comparisonView !== null` -> `confusion_untangle`
- otherwise -> `standard_lookup`

- [x] **Step 5: Implement style-specific prompt sections**

In `build-system-prompt.ts`, keep the current global rules, then append one style section:

- `confusion_untangle`
  - "你会混，是因为..."
  - "先问一句"
  - 2-4 branches
  - "题里抓"
  - concise final distinctions
- `root_family_summary`
  - explain whether fragment is a word or a word-building part
  - prefix direction + action story + modern meaning
  - priority labels
  - explicit "不成立 / 低频 / 不建议背"
- `standard_lookup`
  - current main-answer rhythm

Keep this instruction:

```text
必须严格依赖 grounding，不要自由补充未检索到的新词作为主答案。
```

- [x] **Step 6: Run prompt tests to green**

Run:

```powershell
corepack pnpm test src/features/answering/build-system-prompt.test.ts
corepack pnpm test src/features/answering/chat-service.test.ts
```

Expected: both pass.

### Task 2: Detect Root-Family Query Mode

**Files:**
- Modify: `src/features/retrieval/types.ts`
- Modify: `src/features/retrieval/normalize-query.ts`
- Modify: `src/features/retrieval/retrieve-candidates.test.ts`

- [x] **Step 1: Add failing query-mode tests**

Add tests under `describe("detectQueryMode")`:

```ts
expect(detectQueryMode("stitute 是什么")).toBe("root_family_summary");
expect(detectQueryMode("tempt 这一族怎么记")).toBe("root_family_summary");
expect(detectQueryMode("re+con 的词根有什么词")).toBe("root_family_summary");
expect(detectQueryMode("re...ct 这种词")).toBe("root_family_summary");
```

Also keep these regression assertions:

```ts
expect(detectQueryMode("有个像 institute 的词")).toBe("fuzzy_recall");
expect(detectQueryMode("跟 recent 很像的词有哪些")).toBe("shape_neighbor_search");
expect(detectQueryMode("access assess excess 怎么区分")).toBe("direct_compare");
```

- [x] **Step 2: Run the failing query-mode tests**

Run:

```powershell
corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts
```

Expected: FAIL because root-family inputs still resolve as `fuzzy_recall`.

- [x] **Step 3: Implement conservative root intent detection**

Add root cue detection in `normalize-query.ts`.

Suggested cues:

- Chinese cues: `词根`, `前缀`, `后缀`, `同根`, `这一族`, `家族`, `派生`, `构词`, `组合`
- fragment patterns: `re+con`, `re...ct`, `-tain`, `accomm...`
- single English fragments with a root cue or short root-like query such as `stitute 是什么`

Ordering must stay:

1. explicit multi-word comparison / group comparison
2. shape-neighbor search
3. root-family summary
4. direct lookup
5. fuzzy recall
6. meaning lookup fallback

Do not classify plain `comply with` or `recent` as root-family input.

- [x] **Step 4: Run query-mode tests to green**

Run:

```powershell
corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts
```

Expected: query-mode tests pass. Retrieval integration tests may still fail until Task 3 if fixtures require `rootFamilyView`.

### Task 3: Add Minimal Root Family Prototype Retrieval

**Files:**
- Create: `src/features/retrieval/root-family-prototypes.ts`
- Create: `src/features/retrieval/root-family-prototypes.test.ts`
- Modify: `src/features/retrieval/types.ts`
- Modify: `src/features/retrieval/retrieve-candidates.ts`
- Modify: `src/features/retrieval/retrieve-candidates.test.ts`
- Modify: `src/features/answering/build-grounding.ts`
- Modify: `src/features/answering/chat-service.ts`
- Modify: `src/features/answering/chat-service.test.ts`

- [x] **Step 1: Add failing prototype and retrieval tests**

Prototype tests:

```ts
expect(findRootFamilyPrototype("stitute 是什么")?.id).toBe("root-stitute");
expect(findRootFamilyPrototype("tempt 这一族怎么记")?.id).toBe("root-tempt");
expect(findRootFamilyPrototype("re+con 的词根有什么词")).toBeNull();
expect(findRootFamilyPrototype("tempt 这一族怎么记")?.caution).toContain("不要硬套");
```

Retrieval integration tests:

```ts
const stitute = await retrieveCandidates({
  activeExamTarget: "cet6",
  query: "stitute 是什么",
});
expect(stitute.queryMode).toBe("root_family_summary");
expect(stitute.resolution).toBe("resolved");
expect(stitute.rootFamilyView?.id).toBe("root-stitute");
expect(stitute.rootFamilyView?.members.map((member) => member.lemma)).toContain("institute");

const unsupported = await retrieveCandidates({
  activeExamTarget: "cet6",
  query: "re+con 的词根有什么词",
});
expect(unsupported.queryMode).toBe("root_family_summary");
expect(unsupported.resolution).toBe("no_match");
expect(unsupported.rootFamilyView).toBeNull();
```

Expected before implementation: FAIL for missing files/types/handler.

- [x] **Step 2: Define first-phase root-family view types**

In `src/features/retrieval/types.ts`, add:

```ts
export type RootFamilyPriority =
  | "must_memorize"
  | "recognize"
  | "low_priority";

export type RootFamilyView = {
  id: string;
  fragment: string;
  coreImage: string;
  note: string;
  caution: string;
  members: Array<{
    lemma: string;
    prefix: string | null;
    prefixDirection: string;
    actionStory: string;
    modernMeaningZh: string;
    priority: RootFamilyPriority;
    entryId: string | null;
    inScope: boolean;
  }>;
};
```

Add `rootFamilyView: RootFamilyView | null` to `RetrievalResult` and `AnswerGrounding`.

- [x] **Step 3: Create tiny curated root prototypes**

Create `src/features/retrieval/root-family-prototypes.ts`.

Initial prototypes:

- `root-stitute`
  - fragment: `stitute`
  - core image: "放置 / 建立"
  - must memorize: `institute`, `institution`
  - recognize: `constitute`, `substitute`
  - low priority: `restitute`, `prostitute`
  - caution: not every prefix combination is exam-useful
- `root-tempt`
  - fragment: `tempt`
  - core image: "试探 / 诱惑"
  - must memorize: `attempt`, `tempt`, `temptation`
  - recognize: `contempt`
  - caution: do not hard-fit `re- + tempt` as a common exam family branch

Important: this file is a first-phase grounding prototype, not the long-term source of truth.

- [x] **Step 4: Implement `handleRootFamilySummary`**

In `retrieve-candidates.ts`:

- route `normalizedQuery.queryMode === "root_family_summary"` before meaning lookup
- match a prototype by normalized text and English fragments
- if no prototype, return `no_match` with `low_confidence`
- if a prototype exists, return:
  - `resolution: "resolved"`
  - `rootFamilyView`
  - `mainAnswer`: DB-backed prototype members that exist in `vocabulary_entry`
  - `confusionBoundary`: `[]`
  - `comparisonView`: `null`

Do not force missing prototype members into `RetrievalCandidate`; they belong only inside `rootFamilyView`.

- [x] **Step 5: Make root no-match answer specific**

Update `chat-service.ts` so `root_family_summary` no-match says, in Chinese, that EngGo will not hard-fit unsupported roots/prefix combinations yet.

Example intent:

```text
这类词根/前缀组合我还没有稳定 grounding。为避免硬凑规律，这次先不展开。你可以给一个完整单词、一个更明确的词根片段，或者问某一族（如 stitute / tempt）。
```

- [x] **Step 6: Run prototype and retrieval tests to green**

Run:

```powershell
corepack pnpm test src/features/retrieval/root-family-prototypes.test.ts
corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts
corepack pnpm test src/features/answering/chat-service.test.ts
```

Expected: all pass.

### Task 4: Add Deterministic Answer Style Eval

**Files:**
- Create: `scripts/run-answer-style-eval.ts`
- Modify: `package.json`
- Optional modify: `scripts/run-chat-batch-eval.ts` only if sharing tiny helpers is cleaner than duplication.

- [x] **Step 1: Create failing eval script cases**

Create `scripts/run-answer-style-eval.ts` with local fake-provider checks similar to `scripts/run-shape-neighbor-eval.ts`.

Cases should include:

- `stationary 和 stationery 哪个是文具`
- `access assess excess 怎么区分`
- `comply conform defer 怎么区分`
- `respect 那组词怎么分`
- `stitute 是什么`
- `tempt 这一族怎么记`
- `re+con 的词根有什么词`
- `有个像 reqeust 的词`

Each case should assert:

- expected `queryMode`
- expected `resolution`
- expected `answerStyle`
- expected `rootFamilyView` id when applicable
- expected prompt snippets for resolved style cases
- provider is not called for no-match cases

- [x] **Step 2: Add package script**

In `package.json`:

```json
"eval:answer-style": "tsx scripts/run-answer-style-eval.ts"
```

- [x] **Step 3: Run the eval red/green loop**

Run:

```powershell
corepack pnpm eval:answer-style
```

Expected before previous tasks are complete: FAIL.

Expected after Tasks 1-3: PASS with a JSON summary similar to shape eval.

- [x] **Step 4: Keep real-provider smoke optional**

Do not require MiniMax/OpenAI keys for this eval.

If a real-provider smoke is needed later, add an explicit flag or separate script. Do not make `verify` or local eval depend on external provider availability.

### Task 5: Verify And Update Handoff

**Files:**
- Modify: `progress.md`
- Optional modify: `bugs.md` only for newly confirmed issues.
- Modify: `docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md`

- [x] **Step 1: Run targeted verification serially**

Run:

```powershell
corepack pnpm test src/features/answering/build-system-prompt.test.ts
corepack pnpm test src/features/answering/chat-service.test.ts
corepack pnpm test src/features/retrieval/root-family-prototypes.test.ts
corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts
corepack pnpm eval:answer-style
corepack pnpm eval:shape
```

Expected: all pass. Do not proceed if any test fails.

- [x] **Step 2: Run lint on touched files**

Run:

```powershell
corepack pnpm exec eslint src/features/answering/build-grounding.ts src/features/answering/build-system-prompt.ts src/features/answering/build-system-prompt.test.ts src/features/answering/chat-service.ts src/features/answering/chat-service.test.ts src/features/retrieval/normalize-query.ts src/features/retrieval/retrieve-candidates.ts src/features/retrieval/retrieve-candidates.test.ts src/features/retrieval/root-family-prototypes.ts src/features/retrieval/root-family-prototypes.test.ts src/features/retrieval/types.ts scripts/run-answer-style-eval.ts
```

Expected: no lint errors.

- [x] **Step 3: Run full verify only after targeted checks pass**

Run:

```powershell
corepack pnpm verify
```

Expected: pass.

Do not run `verify` in parallel with `eval:shape` or `eval:answer-style`.

- [x] **Step 4: Record known TypeScript status**

Do not add `corepack pnpm exec tsc --noEmit` to this plan's pass/fail gate. It is already documented as a separate existing engineering-debt bucket in `bugs.md`.

If you run it anyway, record the outcome separately and do not block this plan on pre-existing errors.

- [x] **Step 5: Update progress handoff**

Update `progress.md` with:

- completed tasks and checkboxes
- exact verification commands and outcomes
- whether root prototype coverage is limited to `stitute` / `tempt`
- whether `re+con`, `re...ct`, and broad typo support remain deferred
- next recommended step after this plan

- [x] **Step 6: Mark this plan as complete task-by-task**

As each step finishes, immediately change its checkbox from `- [ ]` to `- [x]`.

Do not mark future steps complete speculatively.
