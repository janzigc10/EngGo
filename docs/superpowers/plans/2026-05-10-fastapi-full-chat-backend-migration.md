# FastAPI Full Chat Backend Migration Plan

## Goal

Move the full `/api/chat` backend behavior from the current Next.js TypeScript route into the Python FastAPI backend while keeping the existing React/Next frontend stable.

The migrated backend must preserve the current learner-facing contract:

- existing request and response JSON shape
- grounded lookup behavior
- ordinary exact lookup and ECDICT fallback
- direct compare / confusion group answers
- expression, meaning, shape-neighbor, root-family, and root-fragment retrieval
- provider-backed answer generation where the TypeScript service currently uses it
- existing Next route proxy compatibility, with `ENGGO_BACKEND_URL` available as a backend URL override
- plain-answer branches and API envelope behavior
- provider unavailable / provider failure error contracts

## Safety Rules

- Keep the TypeScript chat service available as rollback/reference until FastAPI passes the full smoke set; after parity smoke passes, make Next `/api/chat` FastAPI-first.
- Do not change Prisma schema or dataset shape unless a migrated feature cannot work without it.
- Do not broaden product behavior while porting; parity first, cleanup later.
- Every completed task updates this plan and `progress.md`.
- Do not move to the next migration task while that task's focused tests are failing.

## Verification Baseline

Run these after each major migration slice:

```powershell
& 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests
corepack pnpm test <focused frontend/script test>
corepack pnpm lint <changed ts files>
corepack pnpm eval:fastapi:migrated-smoke
```

Run these before declaring the migration complete:

```powershell
& 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests
corepack pnpm test
corepack pnpm lint
corepack pnpm eval:fastapi:migrated-smoke
corepack pnpm eval:fastapi:migrated-smoke:proxy
corepack pnpm eval:product-smoke
corepack pnpm eval:standard-lookup:provider
```

After the final switch, Next `/api/chat` defaults to `http://127.0.0.1:8000/api/chat`.
Use `ENGGO_BACKEND_URL` only when the FastAPI backend is running on a non-default address.

## Tasks

- [x] Task 1: Port direct compare / confusion group retrieval.
  - Add Python repository queries for exact term resolution and confusion group hydration.
  - Build FastAPI response grounding with `answerKind: "grounded"`, `answerStyle: "confusion_untangle"`, `comparisonView`, `confusionBoundary`, and related candidates.
  - Extend migrated-slice smoke cases for representative compare prompts.
  - Keep unsupported modes returning 501 until their task lands.

- [x] Task 2: Port `/api/chat` envelope, plain branches, and error contracts.
  - Preserve greeting `plain` behavior.
  - Preserve invalid request `400 invalid_request` shape and `x-request-id`.
  - Preserve provider unavailable / provider failure error mapping before enabling provider-backed modes.
  - Add smoke coverage for plain response, validation failure, request-id/header consistency, and provider-error paths.

- [x] Task 3: Port provider-backed answer generation.
  - Add FastAPI provider abstraction matching the TypeScript route's environment behavior.
  - Preserve provider-skipped behavior for standard exact lookup.
  - Preserve request-id and provider request-id surfaces.
  - Add unit tests with a fake provider.
  - After this task, revisit Task 1 answers for answer-text parity, not just grounding parity.

- [x] Task 4: Port meaning and expression lookup modes.
  - Reproduce TypeScript routing for `meaning_lookup`, `expression_recall`, and related normalized query fields.
  - Port candidate ranking inputs needed by these modes.
  - Add smoke cases covering Chinese meaning lookup and expression recall.

- [x] Task 5: Port shape-neighbor and typo/fuzzy lookup modes.
  - Reproduce the existing source-backed shape-neighbor behavior.
  - Preserve the current typo-gap boundaries and no-match behavior.
  - Add smoke cases for the existing shape-neighbor / lookalike scenarios.

- [x] Task 6: Port root-family and root-fragment retrieval.
  - Port the existing root-family / fragment query paths without expanding the product boundary.
  - Preserve the documented `re+con` boundary.
  - Add smoke cases for accepted root-family examples and unsupported semantic-root prompts.

- [x] Task 7: Run full FastAPI parity smoke through direct FastAPI and Next proxy.
  - Expand `eval:fastapi:migrated-smoke` until it covers all migrated query modes.
  - Add answer-text required/forbidden checks for standard exact lookup so naked `confusion_group`, scope tail text, active expansion, Markdown bolding, and examples cannot leak back in.
  - Run direct FastAPI smoke.
  - Run Next proxy smoke through the default FastAPI route.
  - Run product and standard-lookup smoke against the Next proxy path, not the legacy TypeScript route.

- [x] Task 8: Final switch readiness and docs.
  - Decide the safest default route after smoke evidence: FastAPI-first with rollback, or opt-in proxy with documented switch.
  - Final decision: FastAPI-first. Next `/api/chat` now defaults to `http://127.0.0.1:8000`; `ENGGO_BACKEND_URL` is an override only.
  - Update `progress.md`, `bugs.md`, and docs index if needed.
  - Record exact verification commands and outcomes.
