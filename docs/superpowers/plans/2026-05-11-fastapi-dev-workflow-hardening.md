# FastAPI Dev Workflow Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the migrated FastAPI-first `/api/chat` path easy to start, verify, and distinguish from the legacy TypeScript backend.

**Architecture:** Add a small TypeScript dev-stack helper for deterministic command construction, a long-running startup script that starts FastAPI before Next, and a smoke aggregator that verifies the default Next route through FastAPI. Keep the legacy TypeScript chat modules in place, but document that they are no longer the runtime fallback for Next `/api/chat`.

**Tech Stack:** TypeScript scripts, Vitest, Next.js, FastAPI/Uvicorn, existing smoke runners.

---

### Task 1: Plan And Helper Tests

**Files:**
- Create: `scripts/lib/dev-fastapi-stack.ts`
- Test: `scripts/lib/dev-fastapi-stack.test.ts`
- Modify: `docs/superpowers/plans/2026-05-11-fastapi-dev-workflow-hardening.md`

- [x] **Step 1: Write failing helper tests**
- [x] **Step 2: Run helper tests and confirm they fail**
- [x] **Step 3: Implement minimal helper functions**
- [x] **Step 4: Run helper tests and confirm they pass**
- [x] **Step 5: Update this plan task status**

### Task 2: One-Command Dev Stack

**Files:**
- Create: `scripts/dev-fastapi-stack.ts`
- Modify: `package.json`
- Modify: `docs/superpowers/plans/2026-05-11-fastapi-dev-workflow-hardening.md`

- [x] **Step 1: Add `dev:fastapi` script**
- [x] **Step 2: Implement startup script using the tested helper**
- [x] **Step 3: Run focused tests and lint for changed scripts**
- [x] **Step 4: Update this plan task status**

### Task 3: Default FastAPI Smoke Entry

**Files:**
- Create: `scripts/run-default-fastapi-smoke.ts`
- Test: `scripts/run-default-fastapi-smoke.test.ts`
- Modify: `package.json`
- Modify: `docs/superpowers/plans/2026-05-11-fastapi-dev-workflow-hardening.md`

- [x] **Step 1: Write failing smoke command tests**
- [x] **Step 2: Run smoke command tests and confirm they fail**
- [x] **Step 3: Implement the smoke aggregator**
- [x] **Step 4: Run smoke command tests and confirm they pass**
- [x] **Step 5: Update this plan task status**

### Task 4: Legacy Boundary Docs

**Files:**
- Modify: `progress.md`
- Modify: `bugs.md`
- Modify: `docs/README.md`
- Modify: `docs/superpowers/specs/2026-05-10-fastapi-backend-split-design.md`
- Modify: `docs/superpowers/plans/2026-05-11-fastapi-dev-workflow-hardening.md`

- [x] **Step 1: Document the new commands and legacy TypeScript boundary**
- [x] **Step 2: Search for stale default-TypeScript wording**
- [x] **Step 3: Update this plan task status**

### Task 5: Final Verification

**Files:**
- Modify: `progress.md`
- Modify: `docs/superpowers/plans/2026-05-11-fastapi-dev-workflow-hardening.md`

- [x] **Step 1: Run focused script tests**
- [x] **Step 2: Run focused lint**
- [x] **Step 3: Run build**
- [x] **Step 4: Run backend tests**
- [x] **Step 5: If servers are available, run the default FastAPI smoke command**
- [x] **Step 6: Record outcomes in `progress.md` and this plan**

**Verification results:**
- `corepack pnpm test scripts/lib/dev-fastapi-stack.test.ts scripts/run-default-fastapi-smoke.test.ts` -> 2 files / 10 tests passed.
- `corepack pnpm lint scripts/lib/dev-fastapi-stack.ts scripts/lib/dev-fastapi-stack.test.ts scripts/dev-fastapi-stack.ts scripts/run-default-fastapi-smoke.ts scripts/run-default-fastapi-smoke.test.ts` -> passed.
- `corepack pnpm test` -> 28 files / 241 tests passed.
- `corepack pnpm lint` -> passed.
- `corepack pnpm run build` -> passed.
- `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests` with `TMP/TEMP=C:\tmp\enggo-pytest-tmp` and `cache_dir=C:\tmp\enggo-pytest-cache` -> 66 passed.
- `corepack pnpm dev:fastapi` cold-started FastAPI and Next; FastAPI `/health` passed before Next started.
- `corepack pnpm eval:default-fastapi-smoke` -> migrated proxy smoke 13/13 passed and HTTP product proxy smoke 38/38 passed.
- Final cleanup confirmed `.env.local` absent and no local 3000/8000 listener left from this run.

**Environment notes:**
- Windows cannot reliably `spawn()` `corepack.cmd` directly from Node. The helper wraps Corepack as `cmd.exe /d /s /c corepack ...` instead of using `shell: true`.
- The first default smoke run timed out at roughly 3 minutes while requests were still returning 200; the successful run took about 209 seconds. Use a longer timeout for the full default smoke because provider-backed cases are intentionally included.
- `C:\Users\Chen\AppData\Local\Temp\pytest-of-Chen` and local `.pytest_cache` hit `WinError 5` during one backend pytest run; rerunning with temp/cache under `C:\tmp` passed.
