# Dynamic Light Grounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first FastAPI dynamic light grounding slice so broad vocabulary questions can build a scoped candidate pool instead of depending on curated `confusion_group` / `root_family` gates.

**Architecture:** Keep ordinary exact lookup unchanged. Add a focused Python candidate builder under `backend/app/retrieval/` that scores in-scope structured candidates by exact token, prefix/suffix/fragment, edit distance, n-gram overlap, meaning keyword, and curated group boost. Wire `AdvancedLookupService` to return `broad_vocab_summary` grounding for broad meaning/shape/root questions when the dynamic pool is strong enough, while preserving conservative no-match for truly empty pools.

**Tech Stack:** Python 3.12, FastAPI backend services, pytest, existing `RetrievalCandidate` / `ConfusionGroup` dataclasses, existing provider interface.

---

### Task 1: Add Dynamic Candidate Builder Tests

**Files:**
- Create: `backend/tests/test_dynamic_light_grounding.py`
- Later create: `backend/app/retrieval/dynamic_light_grounding.py`

- [x] **Step 1: Write failing tests for explicit shape candidates**

Add a test that builds candidates for `commend、comment、command 这几个很像，怎么区分` and expects `commend`, `comment`, and `command` to be the first three lemmas with exact and shape signals.

- [x] **Step 2: Write failing tests for prefix and semantic broad queries**

Add tests for `con 开头的词太多了，哪些最容易混在一起` and `表示要求别人做事的词有哪些容易混`, checking scope filtering, signal metadata, and top candidate order.

- [x] **Step 3: Write failing tests for curated group boost**

Add a test showing that an old curated group boosts group members without being required for a dynamic answer.

- [x] **Step 4: Run the focused test and verify RED**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_dynamic_light_grounding.py
```

Expected: fail because `backend.app.retrieval.dynamic_light_grounding` does not exist yet.

### Task 2: Implement Dynamic Candidate Builder

**Files:**
- Create: `backend/app/retrieval/dynamic_light_grounding.py`
- Modify: `backend/tests/test_dynamic_light_grounding.py`

- [x] **Step 1: Add candidate signal dataclasses**

Define `LightGroundingSignal` and `LightGroundingCandidate` with JSON helpers. Keep fields compatible with the design doc: lemma, scopes, source kind, meanings, POS, signals, optional structured group ids, and score.

- [x] **Step 2: Add query token and hint extraction**

Implement extraction for English tokens, prefix hints, suffix hints, fragment hints, and a tiny first-pass Chinese meaning keyword map.

- [x] **Step 3: Add scoring and merge logic**

Score only active-scope candidates. Rank exact user terms first, then multi-signal shape/prefix/fragment/meaning candidates, then curated group boosts.

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_dynamic_light_grounding.py
```

Expected: pass.

### Task 3: Wire Broad Summary Into Advanced Lookup

**Files:**
- Modify: `backend/app/answering/direct_compare.py`
- Modify: `backend/app/answering/advanced_lookup.py`
- Modify: `backend/tests/test_advanced_lookup.py`
- Modify: `backend/tests/test_direct_compare_answer.py`

- [x] **Step 1: Write failing service tests**

Add tests proving:
- `commend/comment/command` can return dynamic light grounding from direct-compare fallback when exact entries are missing.
- `re+con 的词根有什么词` can return a scoped light candidate answer when candidates exist instead of the old root no-match.
- ordinary exact lookup remains outside `AdvancedLookupService` and is not changed here.

- [x] **Step 2: Run advanced lookup tests and verify RED**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_advanced_lookup.py
```

Expected: fail on the new broad summary expectations.

- [x] **Step 3: Add broad grounding formatter and system prompt**

Build a grounding payload that keeps `queryMode` from the normalized query plus adds `broadQueryMode="broad_vocab"`, `answerStyle="broad_vocab_summary"`, `groundingStrength="light"`, `supportLabel`, `lightCandidates`, `selectedMainTerms`, and `containsCuratedGroup`.

- [x] **Step 4: Route advanced modes through dynamic candidates**

For `meaning_lookup`, `shape_neighbor_search`, and `root_family_summary`, attempt dynamic candidate grounding first. Keep old curated root/group behavior only as boost data and fallback where needed.

- [x] **Step 5: Run focused backend tests and verify GREEN**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_dynamic_light_grounding.py backend/tests/test_advanced_lookup.py
```

Expected: pass.

### Task 4: Update Docs And Regression Handles

**Files:**
- Modify: `docs/superpowers/plans/2026-05-12-dynamic-light-grounding.md`
- Modify: `progress.md`
- Modify: `docs/README.md`

- [x] **Step 1: Mark completed plan steps**

After each task passes, mark its checkboxes as complete in this file.

- [x] **Step 2: Update rolling handoff**

Add a short `progress.md` entry describing what the first implementation slice now does and what remains next.

- [x] **Step 3: Add plan to docs index**

List this plan in `docs/README.md` as the active implementation plan for the dynamic light grounding design.

- [x] **Step 4: Run final verification**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_dynamic_light_grounding.py backend/tests/test_advanced_lookup.py backend/tests/test_chat_contract.py
corepack pnpm lint
```

Expected: pytest focused backend tests pass; lint passes.
