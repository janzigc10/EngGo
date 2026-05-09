# Source Lemma Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let source-backed but unstructured exam lemmas answer ordinary exact lookups.

**Architecture:** Add a shared file-backed source lemma index and call it only after structured English lookup misses. Source-only candidates reuse `standard_lookup`, carry `sourceKind: "source_lemma"`, and keep provider grounding sanitized.

**Tech Stack:** Next.js, TypeScript, Vitest, Prisma/Postgres for existing structured entries, file-backed source lemma manifests for the first fallback slice.

---

### Task 1: Source Lemma Index

**Files:**
- Create: `src/features/content/source-lemma-sources.ts`
- Create: `src/features/content/source-lemma-sources.test.ts`
- Modify: `scripts/check-vocab-content.ts`

- [x] Write tests for gaokao txt parsing, CET TSV parsing, `cet4` membership also counting for `cet6`, and no `postgrad` membership.
- [x] Run source lemma tests and confirm they fail before implementation.
- [x] Extract source lemma parsing from `scripts/check-vocab-content.ts` into the shared helper.
- [x] Run source lemma tests and `scripts/check-vocab-content.test.ts`.

### Task 2: Retrieval Fallback

**Files:**
- Modify: `src/features/retrieval/types.ts`
- Modify: `src/features/retrieval/retrieve-candidates.ts`
- Modify: `src/features/retrieval/retrieve-candidates.test.ts`

- [x] Add a failing integration test: `accent` resolves from source lemmas for `cet4` even when absent from structured entries.
- [x] Add candidate metadata for `sourceKind?: "structured" | "source_lemma"` and `matchType?: "exact" | "fuzzy" | "source_lemma_exact"`.
- [x] After structured ordinary English lookup misses, check exact source lemma membership for direct lookup / single-token fuzzy recall.
- [x] Return a resolved source-only `standard_lookup` result with one candidate and no confusion boundary.

### Task 3: Answering Boundary

**Files:**
- Modify: `src/features/answering/build-system-prompt.ts`
- Modify: `src/features/answering/chat-provider.ts`
- Modify: `src/features/answering/chat-service.ts`
- Modify: related tests under `src/features/answering`

- [x] Add failing tests proving source-only standard lookup still sanitizes provider grounding.
- [x] Add prompt wording for source-only candidates: explain only the confirmed lemma, no examples, no range language, no expansion.
- [x] Keep source-only return cleaning on the existing standard lookup cleanup path.
- [x] Add fallback behavior for source-only candidates with no curated `meaningsZh`.

### Task 4: Docs and Verification

**Files:**
- Modify: `progress.md`
- Modify: `bugs.md`

- [x] Update handoff docs with the new Scheme C decision.
- [x] Run focused tests.
- [x] Run focused lint.
- [x] Run `eval:product-smoke`.
- [x] If local services are healthy, run `eval:standard-lookup:provider`.

### Task 5: Source-Only Lookup Sampling

**Files:**
- Create: `scripts/lib/source-only-lookup-sample.ts`
- Create: `scripts/lib/source-only-lookup-sample.test.ts`
- Create: `scripts/run-source-only-lookup-sample.ts`
- Modify: `scripts/lib/answer-style-provider-smoke.ts`
- Modify: `package.json`
- Modify: `progress.md`

- [x] Write tests for filtering structured lemmas, de-duplicating source-only lemmas across scopes, and parsing sample runner options.
- [x] Run the new tests and confirm they fail before implementation.
- [x] Implement the source-only sample case builder.
- [x] Add the provider runner and package script.
- [x] Run focused tests and lint.
- [x] Run a small source-only provider sample and record the result.

### Task 6: Source-Only Lookup Scale Validation

**Files:**
- Modify: `scripts/lib/source-only-lookup-sample.ts`
- Modify: `scripts/lib/source-only-lookup-sample.test.ts`
- Modify: `scripts/run-source-only-lookup-sample.ts`
- Modify: `progress.md`

- [x] Write failing tests for deterministic stratified sampling, report classification, and output path options.
- [x] Implement seeded stratified sampling across `gaokao` / `cet4` / `cet6`.
- [x] Implement JSON and Markdown report generation for source-only sample results.
- [x] Run focused tests and lint.
- [x] Run a 300-case source-only provider sample with report output.
- [x] Update `progress.md` with pass/fail summary and next decision.
- [x] Commit the scale-validation tooling and report summary.
