# Legacy TypeScript Backend Cleanup V1

## Goal
Retire the legacy TypeScript retrieval / answering backend after the FastAPI migration. Keep Next.js as the frontend and thin `/api/chat` proxy. Keep ECDICT wordbook generation and FastAPI-first HTTP/provider smoke tooling.

## Scope
- [x] Move frontend-consumed grounding/route types out of legacy `answering` / `retrieval` modules.
- [x] Delete legacy TypeScript retrieval and answering runtime files and tests.
- [x] Delete old direct eval runners that called `retrieveCandidates` / `createChatService`.
- [x] Remove Prisma-backed TS retrieval integration from `package.json` verification gates.
- [x] Update current docs and progress handoff.
- [x] Verify with focused frontend tests, script tests, lint, and stale-reference search.

## Kept Deliberately
- Next.js app shell and `/api/chat` proxy.
- FastAPI backend and Python tests.
- ECDICT CSV parser used by `scripts/generate-ecdict-wordbook.ts`.
- Historical Prisma schema/seed path for structured overlay cleanup to be decided separately.
