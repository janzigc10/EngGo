# FastAPI Backend Split Stage 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the deterministic ordinary lookup slice into FastAPI without migrating compare/root/provider behavior.

**Architecture:** FastAPI handles greeting, invalid request, exact structured ordinary lookup, source lemma + ECDICT ordinary lookup, exact ECDICT phrase fallback, and conservative no-match only inside the ordinary lookup slice. Compare/root/fragment/provider paths remain unsupported in FastAPI Stage 2 and must return `501` when routed to FastAPI. Next `/api/chat` remains an optional proxy controlled by `ENGGO_BACKEND_URL`.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, pytest, psycopg, python-dotenv, PostgreSQL `pg_trgm` schema as-is.

---

## File Structure

- Modify `backend/requirements.txt`: add `psycopg[binary]` and `python-dotenv`.
- Modify `backend/app/core/config.py`: load `.env`, expose `database_url`, source lemma path, and ECDICT path.
- Create `backend/app/retrieval/normalize_query.py`: minimal ordinary lookup mode detection.
- Create `backend/app/retrieval/types.py`: Python DTOs for retrieval candidates/results and grounding.
- Create `backend/app/content/source_lemmas.py`: source lemma membership lookup.
- Create `backend/app/content/ecdict.py`: ECDICT basic profile lookup.
- Create `backend/app/retrieval/repository.py`: exact structured entry lookup by lemma/alias.
- Create `backend/app/answering/ordinary_lookup.py`: deterministic answer formatting and grounding.
- Modify `backend/app/api/chat.py`: route ordinary lookup through the deterministic service.
- Add tests under `backend/tests/` for each migrated unit.
- Modify `progress.md` after every task.

## Task 1: Backend Config And Dependencies

- [x] **Step 1: Update dependency manifest**

Add `psycopg[binary]` and `python-dotenv` to `backend/requirements.txt`.

- [x] **Step 2: Install dependencies**

Run:

```powershell
& 'C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pip install -r backend\requirements.txt
```

- [x] **Step 3: Write failing config test**

Test that `.env` is loaded and `Settings.database_url` is populated when `DATABASE_URL` exists.

- [x] **Step 4: Implement config loading**

Use `python-dotenv` to load the repository `.env`; do not print secrets.

- [x] **Step 5: Run config tests**

Run:

```powershell
& 'C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pytest backend\tests\test_config.py -q
```

Expected after Step 3 before implementation: fails because `Settings.database_url` is missing.

Expected after Step 4: pass.

## Task 2: Minimal Ordinary Lookup Query Normalization

- [x] **Step 1: Write failing tests**

Cover:

- `accent` -> `direct_lookup`, english terms `["accent"]`
- `access 是什么意思` -> `fuzzy_recall`, english terms `["access"]`
- `make up` -> `direct_lookup`, english terms `["make", "up"]`
- comparison/root queries are marked unsupported for Stage 2

- [x] **Step 2: Implement minimal normalizer**

Port only the ordinary lookup subset. Do not port compare/root/expression behavior.

- [x] **Step 3: Run tests**

Run:

```powershell
& 'C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pytest backend\tests\test_normalize_query.py -q
```

Expected after Step 1 before implementation: fails because `backend.app.retrieval.normalize_query` is missing.

Expected after Step 2: pass.

## Task 3: Source Lemma And ECDICT Lookup

- [x] **Step 1: Write failing unit tests**

Cover source lemma aliases and ECDICT profiles:

- `accent` has CET-4 membership from source lemma files
- `according to` can resolve through `accordingto`
- ECDICT profile cleans domain-only noise and formats meanings
- missing ECDICT file returns `None`

- [x] **Step 2: Implement source lemma loader and ECDICT profile lookup**

Keep the same narrow boundaries as TypeScript: source lemma is scope gate, ECDICT is external basic definition only.

- [x] **Step 3: Run tests**

Run:

```powershell
& 'C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pytest backend\tests\test_source_lemmas.py backend\tests\test_ecdict.py -q
```

Expected after Step 1 before implementation: fails because content loaders are missing.

Expected after Step 2: pass.

## Task 4: Exact Structured Lookup Repository

- [x] **Step 1: Write failing repository tests**

Use a focused unit test against a fake psycopg connection/cursor first. Cover SQL parameters for exact lemma and alias lookup. Do not require provider.

If a live DB smoke is added, it must be read-only, use the existing `DATABASE_URL`, avoid migrations/seeds/schema changes, and be skipped or recorded as blocked when the local DB is unavailable.

- [x] **Step 2: Implement exact structured lookup**

Use PostgreSQL tables as-is:

- `vocabulary_entry`
- `vocabulary_alias`
- `vocabulary_meaning`
- `vocabulary_entry_scope`

Return only exact lemma/alias matches for Stage 2.

- [x] **Step 3: Run tests**

Run:

```powershell
& 'C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pytest backend\tests\test_repository.py -q
```

Expected after Step 1 before implementation: fails because `backend.app.retrieval.repository` is missing.

Expected after Step 2: pass.

## Task 5: Deterministic Ordinary Lookup Answer Service

- [x] **Step 1: Write failing service tests**

Cover:

- structured exact `access` returns `access\n\nn./v. 进入权；使用权；访问`
- source lemma + ECDICT `accent` returns ECDICT formatted answer and skips provider
- exact phrase fallback `make up` returns `phr.`
- unsupported compare/root still returns 501 at API layer
- ordinary no-match returns grounded no-match without provider
- compare/root/fragment queries are not converted into ordinary no-match; they stay unsupported at the API layer for Stage 2

- [x] **Step 2: Implement answer service**

Build `AnswerGrounding` compatible JSON for grounded answers. Preserve current fields even if UI only reads a subset.

- [x] **Step 3: Run tests**

Run:

```powershell
& 'C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pytest backend\tests\test_ordinary_lookup_answer.py -q
```

Expected after Step 1 before implementation: fails because `backend.app.answering.ordinary_lookup` is missing.

Expected after Step 2: pass.

## Task 6: API Integration And Proxy Smoke

- [x] **Step 1: Add API tests**

Use FastAPI TestClient with fake repository/lookups where possible.

- [x] **Step 2: Wire `/api/chat` to ordinary lookup service**

Greeting remains first. Ordinary lookup uses the deterministic service. Unsupported query modes return 501 until later stages.

- [x] **Step 3: Run Python tests**

Run:

```powershell
& 'C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pytest backend\tests -q
```

- [x] **Step 4: Run Next proxy smoke with FastAPI**

Start FastAPI, start Next with `ENGGO_BACKEND_URL`, and smoke:

- `accent`
- `access 是什么意思`
- `make up`
- `re+con 的词根有什么词`

Expected: first three are handled by FastAPI deterministic path; `re+con` remains 501 until root-family migration.

## Task 7: Default Path Regression And Docs

- [x] **Step 1: Restore default Next route**

Restart Next without `ENGGO_BACKEND_URL`.

- [x] **Step 2: Run existing default-path smoke**

Run:

```powershell
corepack pnpm eval:product-smoke
corepack pnpm eval:standard-lookup:provider
```

Expected: current TypeScript baseline remains green.

- [x] **Step 3: Update docs**

Update `progress.md` and this plan checkboxes. Update `bugs.md` only for new confirmed environment pitfalls.
