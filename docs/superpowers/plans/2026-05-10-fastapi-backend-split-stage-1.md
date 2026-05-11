# FastAPI Backend Split Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Python FastAPI backend slice and optional Next proxy without breaking the current Next.js chat path.

**Architecture:** Next.js remains the front-end. `src/app/api/chat/route.ts` keeps the current TypeScript service as the default path, and proxies to FastAPI only when `ENGGO_BACKEND_URL` is configured. This stage proves the Python chat contract and optional proxy only; deterministic ordinary lookup moves to the next migration stage.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, pytest, PostgreSQL, Next.js API Route, Vitest.

---

## File Structure

- Create `backend/requirements.txt`: Python runtime/test dependencies.
- Create `backend/app/main.py`: FastAPI app factory and health route registration.
- Create `backend/app/api/chat.py`: `POST /api/chat` route.
- Create `backend/app/core/config.py`: environment and path configuration.
- Create `backend/app/core/request_id.py`: request id generation.
- Create `backend/app/schemas/chat.py`: Pydantic chat request/response models.
- Create `backend/tests/test_health.py`: health endpoint test.
- Create `backend/tests/test_chat_contract.py`: chat contract tests for greeting and validation.
- Modify `src/lib/env.ts`: parse optional `ENGGO_BACKEND_URL`.
- Modify `src/app/api/chat/route.ts`: proxy to FastAPI only when `ENGGO_BACKEND_URL` exists; otherwise keep existing TypeScript route.
- Create `src/app/api/chat/route.test.ts`: proxy fallback/forwarding tests.
- Modify `package.json`: add backend helper scripts only if they are stable on this Windows workspace.
- Modify `progress.md`: record the migration slice and verification.

## Task 1: Python FastAPI Scaffold

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/main.py`
- Create: `backend/app/core/config.py`
- Test: `backend/tests/test_health.py`

- [x] **Step 1: Add Python dependency manifest**

Create `backend/requirements.txt` with FastAPI, Uvicorn, Pydantic, pytest, and HTTPX/TestClient dependencies.

- [x] **Step 2: Install dependencies for local verification**

Run with the available Python executable:

```powershell
& 'C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pip install -r backend\requirements.txt
```

Expected: dependencies installed or already satisfied.

- [x] **Step 3: Write failing health test**

Add a pytest that imports `create_app()` from `backend.app.main`, calls `GET /health`, and expects:

```json
{"status": "ok", "service": "enggo-fastapi"}
```

- [x] **Step 4: Run health test and verify RED**

Run:

```powershell
& 'C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pytest backend\tests\test_health.py -q
```

Expected: fail because `backend.app.main` or `create_app` is not implemented yet.

- [x] **Step 5: Implement minimal FastAPI app**

Create `create_app()` and `/health`.

- [x] **Step 6: Run health test and verify GREEN**

Run the same pytest command.

Expected: pass.

## Task 2: Python Chat Contract

**Files:**
- Create: `backend/app/schemas/chat.py`
- Create: `backend/app/core/request_id.py`
- Create: `backend/app/api/chat.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_chat_contract.py`

- [x] **Step 1: Write failing chat validation tests**

Tests should cover:

- invalid body returns 400 with `error.code = "invalid_request"`
- greeting query returns `answerKind = "plain"`, no `grounding`, and `providerRequestId = null`
- non-greeting query returns 501 `not_implemented` with request id, because retrieval is Stage 2
- response includes `requestId` and `x-request-id`

- [x] **Step 2: Run chat contract tests and verify RED**

Run:

```powershell
& 'C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pytest backend\tests\test_chat_contract.py -q
```

Expected: fail because chat schema/router does not exist.

- [x] **Step 3: Implement Pydantic models and chat router**

Implement only:

- `ChatHistoryMessage`
- `ChatRequest`
- `ChatSuccessResponse`
- `ChatErrorResponse`
- greeting short-circuit
- explicit `not_implemented` response for unsupported non-greeting queries

Do not add retrieval, grounding DTOs, ECDICT, or provider calls in this task.

- [x] **Step 4: Run chat contract tests and verify GREEN**

Run the same pytest command.

Expected: pass.

## Task 3: Optional Next Proxy Without Breaking Default Path

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `src/app/api/chat/route.ts`
- Create: `src/app/api/chat/route.test.ts`

- [x] **Step 1: Write failing Vitest tests for routing behavior**

Tests should prove:

- when `ENGGO_BACKEND_URL` is unset, a non-greeting `POST()` still uses the existing TypeScript retrieval/service path and does not call `fetch`
- when `ENGGO_BACKEND_URL` is set, `POST()` forwards request JSON to `${ENGGO_BACKEND_URL}/api/chat`
- proxy response preserves status, body, and `x-request-id`
- proxy network failure maps to `chat_generation_failed`

Use module/env isolation for this test, such as resetting modules before dynamic import, stubbing `process.env.ENGGO_BACKEND_URL`, mocking retrieval/service for the default path, and mocking global `fetch` for the proxy path.

- [x] **Step 2: Run route tests and verify RED**

Run:

```powershell
corepack pnpm test src/app/api/chat/route.test.ts
```

Expected: fail because optional proxy is not implemented.

- [x] **Step 3: Implement optional proxy helper**

Add `ENGGO_BACKEND_URL` to `src/lib/env.ts`. In `src/app/api/chat/route.ts`, if configured, forward the original JSON payload to FastAPI and return the FastAPI response. If not configured, keep the existing code path unchanged.

- [x] **Step 4: Run route tests and verify GREEN**

Run the same Vitest command.

Expected: pass.

## Task 4: Local FastAPI Run Script And Proxy Smoke

**Files:**
- Modify: `package.json` if a stable script can be added without hard-coding a machine-local Python path.
- Test: existing route tests and manual local smoke.

- [x] **Step 1: Decide script shape**

If `python` is not on PATH in this workspace, do not add a brittle `backend:dev` package script. Prefer documenting the exact local command in `progress.md`.

- [x] **Step 2: Run FastAPI locally**

Run:

```powershell
& 'C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m uvicorn backend.app.main:create_app --factory --host 127.0.0.1 --port 8000
```

Expected: service listens at `http://127.0.0.1:8000`.

- [x] **Step 3: Smoke FastAPI directly**

Call `POST http://127.0.0.1:8000/api/chat` with a greeting body.

Expected: plain greeting response with request id.

- [x] **Step 4: Smoke Next proxy explicitly**

Run Next with `ENGGO_BACKEND_URL=http://127.0.0.1:8000` and call `POST /api/chat`.

Expected: Next returns the FastAPI greeting response and `x-request-id`.

- [x] **Step 5: Restore default route environment**

Stop or restart Next with `ENGGO_BACKEND_URL` unset before running existing TypeScript smoke. Confirm the default path no longer proxies to FastAPI.

## Task 5: Stage 1 Regression Verification And Docs

**Files:**
- Modify: `progress.md`
- Optionally modify: `bugs.md` only if a new confirmed environment pitfall appears.

- [x] **Step 1: Run Python backend tests**

Run:

```powershell
& 'C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pytest backend\tests -q
```

Expected: all backend tests pass.

- [x] **Step 2: Run focused TypeScript tests**

Run:

```powershell
corepack pnpm test src/app/api/chat/route.test.ts src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx src/components/chat/answer-content.test.tsx
```

Expected: all focused front-end/proxy tests pass.

- [x] **Step 3: Run existing smoke through default Next path**

Run:

```powershell
corepack pnpm eval:product-smoke
corepack pnpm eval:standard-lookup:provider
```

Expected: existing TypeScript default path remains green because `ENGGO_BACKEND_URL` is unset. Ensure the Next dev server used by these commands was started without `ENGGO_BACKEND_URL`.

- [x] **Step 4: Update progress**

Record:

- FastAPI scaffold status
- proxy default/fallback behavior
- direct FastAPI smoke result
- tests/smoke run
- next migration stage: deterministic ordinary-lookup retrieval slice
