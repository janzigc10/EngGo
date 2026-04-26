# Black-Box Product Smoke Implementation Plan

> **For agentic workers:** This plan marks the shift from repeated vocab expansion to product-feel validation on the current 546-entry `real-smoke` foundation dataset.

**Goal:** Add a compact black-box smoke matrix that checks whether the current vocabulary base behaves like a usable learning product before deciding whether to expand more words.

**Architecture:** Keep this as a deterministic local runner with a stub provider. It exercises `retrieveCandidates -> chatService -> grounding` and validates routing, resolution, answer style, grounding lemmas, root views, comparison views, and no-match short-circuiting. It does not judge real model prose.

## Scope Boundaries

Do:

- Cover ordinary lookup, typo/fuzzy lookup, shape-neighbor recall, direct confusion, Chinese expression recall, root-family recall, and conservative no-match.
- Include new batch-3 foundation words in ordinary lookup checks.
- Let the smoke fail when a product gap is real.
- Record failures in `progress.md` / `bugs.md`.

Do not:

- Add more vocabulary in this slice.
- Call a real provider.
- Add this smoke to default `verify`.
- Weaken failures just to make the runner green.

## Task 1: Add Black-Box Case Library

- [x] **Step 1: Write failing library tests**

Add tests for:

- 20-30 product-facing cases.
- Coverage of all major query categories.
- Batch-3 standard lookup coverage.
- Failure reporting for missing grounding.

- [x] **Step 2: Implement case definitions and evaluator**

Create `scripts/lib/black-box-product-smoke.ts`.

## Task 2: Add Runner And Run It

- [x] **Step 1: Add a deterministic runner**

Create `scripts/run-black-box-product-smoke.ts` and package script `eval:product-smoke`.

- [x] **Step 2: Run black-box smoke**

Run:

```powershell
corepack pnpm eval:product-smoke
```

Observed result: 25 total / 23 pass / 2 fail.

Current failures:

- `generte 是什么意思` still no-matches instead of recalling `generate`.
- `horizen 是什么意思` still no-matches instead of recalling `horizon`.

## Task 3: Fix Immediate Root-Family Grounding Risk

- [x] **Step 1: Add root-family regression**

Ensure `跟 institute 一样那几个词怎么记` does not expose `restitute` / `prostitute` in current-scope root-family grounding.

- [x] **Step 2: Filter root-family visible members**

Only expose root-family members that have real entries and are in the active exam scope.

## Task 4: Handoff

- [x] **Step 1: Record outcome**

Update `progress.md` and `bugs.md`.
