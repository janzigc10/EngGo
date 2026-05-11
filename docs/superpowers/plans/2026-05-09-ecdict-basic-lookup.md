# ECDICT Basic Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an ECDICT basic profile lookup layer for exact word, hyphenated word, and phrase definitions, then route source-lemma ordinary lookup through it before provider fallback.

**Architecture:** Keep ECDICT lookup as an external dictionary adapter under `src/features/content`. Keep the CSV parser and translation cleaner in runtime-safe content code, expose a small exact lookup API that clearly distinguishes word, hyphenated word, phrase, and joined-phrase alias matches, and inject the lookup into chat answering through narrow ordinary-lookup gates.

**Tech Stack:** TypeScript, Vitest, existing EngGo content/retrieval types, local ECDICT CSV fixture or file path.

---

### Task 1: Basic Profile Lookup Module

**Files:**
- Create: `src/features/content/ecdict-basic-profiles.ts`
- Create: `src/features/content/ecdict-basic-profiles.test.ts`
- Modify: `docs/superpowers/plans/2026-05-09-ecdict-basic-lookup.md`

- [x] **Step 1: Write failing tests**

Cover:
- exact word lookup: `makeup`
- exact hyphenated word lookup: `well-known`
- exact phrase lookup: `according to`
- joined phrase alias: `accordingto -> according to`
- no automatic merge: `makeup` must not return `make up`
- domain-only translation returns no usable profile

Run:

```bash
corepack pnpm test src/features/content/ecdict-basic-profiles.test.ts
```

Expected: FAIL because the module does not exist yet.

- [x] **Step 2: Implement minimal profile module**

Create a focused module that:
 - parses ECDICT rows through shared content utilities
- normalizes lookup keys with lowercase and whitespace collapse
- preserves hyphenated words as exact word-like keys
- treats spaced entries as phrases
- applies explicit joined phrase aliases only
- returns `null` for missing or noisy-only definitions

- [x] **Step 3: Verify focused tests**

Run:

```bash
corepack pnpm test src/features/content/ecdict-basic-profiles.test.ts scripts/lib/ecdict-source-only-audit.test.ts
```

Expected: PASS.

- [x] **Step 4: Run focused lint**

Run:

```bash
corepack pnpm lint src/features/content/ecdict-basic-profiles.ts src/features/content/ecdict-basic-profiles.test.ts
```

Expected: PASS.

- [x] **Step 5: Update handoff docs**

Update `progress.md` with the new basic profile layer and the remaining next step: route `standard_lookup + source_lemma_exact` through the profile before provider.

---

### Task 2: Route Source-Lemma Standard Lookup Through ECDICT

**Files:**
- Modify: `src/features/answering/chat-service.ts`
- Modify: `src/features/answering/chat-service.test.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/features/content/ecdict-basic-profiles.ts`
- Modify: `docs/superpowers/plans/2026-05-09-ecdict-basic-lookup.md`
- Modify: `progress.md`

- [x] **Step 1: Write failing chat-service test**

Cover:
- `standard_lookup + source_lemma_exact` asks ECDICT before provider
- ECDICT usable profile returns a short template answer
- provider is not called when ECDICT answers
- grounding remains `grounded` and `standard_lookup`

Run:

```bash
corepack pnpm test src/features/answering/chat-service.test.ts
```

Expected: FAIL because `createChatService` does not yet accept or use an ECDICT profile lookup.

- [x] **Step 2: Implement injectable ECDICT short-circuit**

Add a narrow chat-service hook that:
- only applies to `grounding.answerStyle === "standard_lookup"`
- only applies to `grounding.matchType === "source_lemma_exact"`
- only applies when the main candidate is `sourceKind === "source_lemma"`
- returns a deterministic template answer from ECDICT meanings
- leaves all structured entries, no-match flows, spelling assist, and provider fallback behavior unchanged

- [x] **Step 3: Add runtime ECDICT profile loader**

Add a server-side loader that:
- reads `output/external-dictionaries/ecdict.csv`
- builds the existing ECDICT basic profile index lazily
- returns `null` when the file is missing or the profile is noisy/unusable
- supports explicit joined phrase aliases without automatic word/phrase merging

- [x] **Step 4: Wire API route**

Use the runtime ECDICT lookup when creating the chat service in `/api/chat`.

- [x] **Step 5: Verify focused tests and lint**

Run:

```bash
corepack pnpm test src/features/answering/chat-service.test.ts src/features/content/ecdict-basic-profiles.test.ts scripts/lib/ecdict-source-only-audit.test.ts
corepack pnpm lint src/features/answering/chat-service.ts src/features/answering/chat-service.test.ts src/features/content/ecdict-basic-profiles.ts src/app/api/chat/route.ts
```

Expected: PASS.

- [x] **Step 6: Update handoff docs**

Update `progress.md` with the ECDICT route integration result, remaining risks, and latest focused verification.

---

### Task 3: Review Fix for Hyphenated and Phrase Routing

**Files:**
- Modify: `src/features/retrieval/normalize-query.ts`
- Modify: `src/features/content/source-lemma-sources.ts`
- Modify: `src/features/retrieval/retrieve-candidates.ts`
- Modify: `src/features/answering/chat-service.ts`
- Modify: `src/features/retrieval/types.ts`
- Create: `src/features/content/ecdict-csv.ts`
- Modify: `scripts/lib/ecdict-source-only-audit.ts`
- Modify: `progress.md`

- [x] **Step 1: Write failing end-to-end routing tests**

Cover:
- hyphenated words such as `x-ray` remain `direct_lookup`
- hyphenated source lemmas resolve as `source_lemma_exact`
- explicit spaced phrase aliases such as `according to` resolve through source lemma membership
- direct phrases such as `make up` do not fuzzy-match unrelated single words
- no-match exact phrases can use ECDICT phrase fallback before provider/no-match text

- [x] **Step 2: Fix retrieval routing**

Implement:
- do not treat ordinary hyphenated words as root fragments
- source lemma lookup accepts explicit spaced phrase aliases only
- direct multi-term lookup suppresses unrelated fuzzy single-word matches

- [x] **Step 3: Fix ECDICT phrase fallback**

Implement:
- `standard_lookup + source_lemma_exact` still short-circuits provider through ECDICT
- `direct_lookup` phrase no-match can return an ECDICT phrase answer with `matchType: "external_dictionary_exact"`
- structured exact lookup remains provider-backed and is not stolen by ECDICT

- [x] **Step 4: Move shared ECDICT parsing into runtime-safe content module**

Implement:
- add `src/features/content/ecdict-csv.ts`
- have runtime profile lookup import from content code
- have audit script reuse and re-export the shared parser/cleaner

- [x] **Step 5: Verify focused tests and lint**

Run:

```bash
corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts
corepack pnpm test src/features/content/ecdict-basic-profiles.test.ts scripts/lib/ecdict-source-only-audit.test.ts src/features/answering/chat-service.test.ts
corepack pnpm lint src/features/content/ecdict-csv.ts src/features/content/ecdict-basic-profiles.ts src/features/content/ecdict-basic-profiles.test.ts scripts/lib/ecdict-source-only-audit.ts scripts/lib/ecdict-source-only-audit.test.ts src/features/content/source-lemma-sources.ts src/features/retrieval/normalize-query.ts src/features/retrieval/retrieve-candidates.ts src/features/retrieval/retrieve-candidates.test.ts src/features/answering/chat-service.ts src/features/answering/chat-service.test.ts src/features/retrieval/types.ts
```

Expected: PASS.

---

### Task 4: Ordinary Lookup Display Template

**Files:**
- Modify: `src/features/answering/chat-service.ts`
- Modify: `src/features/answering/chat-service.test.ts`
- Modify: `src/features/retrieval/types.ts`
- Modify: `src/features/retrieval/retrieve-candidates.ts`
- Modify: `progress.md`

- [x] **Step 1: Write failing display tests**

Cover:
- ECDICT word answers render as a word header plus POS lines.
- ECDICT phrase answers render as a word header plus `phr.` line.
- Structured standard lookup answers keep POS metadata and render in the same compact block style.

- [x] **Step 2: Implement ordinary lookup formatter**

Implement:
- parse ECDICT-style POS-prefixed meanings into display lines.
- normalize comma-separated meanings into semicolon-separated readable chunks.
- format structured ordinary lookup from grounding metadata when available.

- [x] **Step 3: Verify focused tests and lint**

Run:

```bash
corepack pnpm test src/features/answering/chat-service.test.ts src/features/retrieval/retrieve-candidates.test.ts
corepack pnpm lint src/features/answering/chat-service.ts src/features/answering/chat-service.test.ts src/features/retrieval/types.ts src/features/retrieval/retrieve-candidates.ts
```

Expected: PASS.
