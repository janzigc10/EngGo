# FastAPI Backend Split Design

## Goal

Split EngGo from a Next.js full-stack monolith into a front-end plus Python FastAPI backend, while preserving the current chat product behavior and smoke-test baseline.

## Current Shape

The current application is a Next.js monolith:

- React / Next.js renders the chat workspace.
- `src/app/api/chat/route.ts` is also the backend entry.
- Retrieval, grounding, answer policy, ECDICT lookup, and provider calls are TypeScript modules under `src/features/`.
- PostgreSQL remains the durable vocabulary store, with Prisma owning migrations and seed data.

This is not strict front-end/back-end separation. The page and core backend logic live in the same TypeScript runtime.

## Target Shape

The target architecture is:

- Next.js remains the web front-end.
- Next `/api/chat` becomes a thin BFF/proxy during migration.
- Python FastAPI owns the chat backend contract.
- PostgreSQL remains the database.
- Prisma migrations and seed scripts remain in TypeScript for the first migration stage.
- Existing TypeScript smoke runners remain the behavioral oracle until the Python backend has equivalent tests.

The first version should optimize for behavioral parity, not for new product features.

## API Contract

FastAPI must accept the same chat request shape currently accepted by Next:

```json
{
  "activeExamTarget": "cet6",
  "query": "access assess excess 怎么区分",
  "history": [
    {
      "role": "user",
      "content": "previous question"
    },
    {
      "role": "assistant",
      "content": "previous answer"
    }
  ]
}
```

FastAPI must return the same success shape consumed by the front-end:

```json
{
  "answer": "...",
  "answerKind": "grounded",
  "grounding": {},
  "requestId": "...",
  "providerRequestId": null
}
```

`plain` answers may omit `grounding`, as they do today. Grounded answers must preserve the current `AnswerGrounding` fields so the UI can keep showing hit status, next-step hints, and collection actions.

The Next proxy must preserve:

- response status
- JSON body shape
- `x-request-id`
- `requestId`
- `providerRequestId`
- current generic front-end error behavior

During migration, `src/features/answering/build-grounding.ts` and `src/features/retrieval/types.ts` remain the authority for the TypeScript contract shape. Python DTOs must mirror those fields before the front-end imports are decoupled from backend modules.

## Python Backend Modules

The Python backend should be added under a focused backend package, not mixed into `src/`.

Recommended layout:

- `backend/app/main.py`: FastAPI app and router registration.
- `backend/app/api/chat.py`: `POST /api/chat` endpoint.
- `backend/app/core/config.py`: environment variables and paths.
- `backend/app/core/request_id.py`: request id generation.
- `backend/app/schemas/chat.py`: chat request/response Pydantic models.
- `backend/app/schemas/retrieval.py`: retrieval and grounding DTOs.
- `backend/app/content/source_lemmas.py`: source lemma membership lookup.
- `backend/app/content/ecdict.py`: ECDICT CSV parsing and profile lookup.
- `backend/app/retrieval/normalize_query.py`: query mode detection.
- `backend/app/retrieval/sql.py`: PostgreSQL `pg_trgm` queries.
- `backend/app/retrieval/service.py`: retrieval orchestration.
- `backend/app/answering/grounding.py`: grounding derivation.
- `backend/app/answering/service.py`: answer policy and deterministic templates.
- `backend/app/answering/prompts.py`: provider prompt construction.
- `backend/app/providers/openai_compatible.py`: OpenAI-compatible provider calls.

The first implementation should keep files small and testable. If a direct port from TypeScript creates a large file, split by responsibility before adding more behavior.

## Migration Strategy

### Stage 1: Contract and Proxy

Add a FastAPI backend with:

- health endpoint
- `POST /api/chat`
- Pydantic request/response validation
- request id propagation
- Next `/api/chat` proxy support via an environment variable such as `ENGGO_BACKEND_URL`

If `ENGGO_BACKEND_URL` is not configured, Next `/api/chat` must continue to use the existing TypeScript service. This keeps the current browser path and smoke baseline intact while the Python backend is incomplete.

At this point, the proxy can be tested with fake FastAPI responses before the full retrieval port is complete. The default local development path should remain TypeScript until an explicit backend URL is provided.

### Stage 2: Deterministic Chat Parity

Port the minimum retrieval and answer slice required for deterministic chat behavior:

- greeting short-circuit
- query normalization for direct lookup and conservative no-match
- exact structured lookup by lemma or alias
- no-match answer text
- standard lookup deterministic formatting
- ECDICT basic profile lookup
- source lemma membership
- structured lookup answers that can skip provider

This stage should make ordinary exact lookup, source-lemma/ECDICT lookup, and conservative no-match cases work through FastAPI. It does not need to cover every comparison, expression recall, or root-family path yet.

### Stage 3: Retrieval Parity

Port the rest of the current retrieval chain:

- query normalization
- exact/fuzzy English lookup with `pg_trgm`
- meaning lookup
- direct compare
- shape-neighbor lookup
- root-family and root-fragment recall
- comparison view construction

The SQL must preserve current thresholds and ordering as closely as possible.

### Stage 4: Provider Parity

Port provider behavior:

- OpenAI Responses API and OpenAI-compatible chat-completions endpoint support
- `OPENAI_API_KEY`, base URL, model configuration
- provider request id extraction
- standard lookup grounding sanitization
- plain fallback and spelling assist prompts

### Stage 5: Smoke Routing

Update the smoke runners only after the FastAPI backend can satisfy the same contract. The initial smoke path should still be able to test through Next `/api/chat`, because that is what the browser uses.

## Data Ownership

First migration stage:

- Keep PostgreSQL schema unchanged.
- Keep Prisma migrations.
- Keep TypeScript seed scripts.
- Keep `data/exam-vocab/` as the source data directory.
- Let Python read existing source lemma files and ECDICT CSV directly.

Do not add a Python migration tool yet. That would combine a runtime migration with a database ownership migration and make failures harder to isolate.

## Product Boundaries To Preserve

The migration must not change these behaviors:

- ordinary exact lookup must not leak naked `confusion_group` data
- ordinary structured lookup should not call the provider when deterministic answer text is available
- ECDICT remains `external_dictionary_basic` and unreviewed
- source lemma fallback only covers ordinary exact lookup
- `re+con 的词根有什么词` remains conservative no-match
- `postgrad` remains out of `real-smoke` until a source-safe word list exists
- embedding remains auxiliary, not the main retrieval path

## Error Handling

FastAPI should map errors to the same user-facing categories:

- invalid request -> 400, `invalid_request`
- missing provider key -> 503, `openai_unavailable`
- provider or generation failure -> provider status if known, otherwise 500, `chat_generation_failed`

Internal errors should not leak stack traces or provider details into the front-end.

## Testing And Verification

Python tests should be added for new backend modules as they are ported. For every behavior migration, write the Python test first and verify it fails before implementing.

Required migration gates:

- focused Python unit tests for the ported module
- Next proxy contract tests
- front-end chat tests still pass
- `corepack pnpm eval:product-smoke`
- `corepack pnpm eval:standard-lookup:provider`

During migration, default smoke commands still exercise the Next `/api/chat` path. FastAPI proxy behavior should be tested only when `ENGGO_BACKEND_URL` is explicitly set, until the proxy becomes the default route.

Before declaring the backend migration complete, also run the broader smoke set:

- `corepack pnpm eval:answer-style:provider`
- `corepack pnpm eval:shape`
- `corepack pnpm eval:lookalike:real-smoke`
- `corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke --min-entries 500 --require-source-lemmas`

## Out Of Scope

Not part of this migration slice:

- replacing the React/Next front-end
- replacing Prisma migrations
- rewriting seed ingestion in Python
- introducing embeddings as the primary retrieval path
- changing answer policy or product wording
- expanding vocabulary data
- adding new study/review features
