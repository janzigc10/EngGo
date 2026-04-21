# EngGo Technical Architecture Design

Date: 2026-04-21

## Summary

This document fixes the first implementation architecture for EngGo.

The chosen direction is:

- a chat-first, exam-scoped English learning product
- a deployable full-stack web app, not just a local prototype
- a single Next.js codebase with clear server/client layering
- PostgreSQL as the system of record
- deterministic retrieval and scope control first, LLM generation second

This is intentionally not a classic “general agent product” architecture. EngGo's core advantage is structured exam knowledge, fuzzy recall, and confusion resolution. The model should explain and teach on top of retrieved structure, not replace the structure.

## Product Characterization

EngGo should currently be treated as:

- a vertical AI learning product
- chat-first in interaction model
- retrieval-heavy in core capability
- agent-enhanced later, but not agent-first in V1

This means the system architecture should optimize for:

- exam-scope correctness
- interpretable candidate retrieval
- explicit confusion-group modeling
- controllable response structure
- rapid product iteration toward launch

It should not optimize first for:

- autonomous tool-using workflows
- broad open-domain RAG
- multi-service orchestration complexity
- agent framework abstraction

## Primary Constraints

- Homepage must remain the chat workspace, not regress into a search-results-first product.
- The system must answer primarily inside the active exam scope.
- The system must support Chinese meaning lookup, incomplete English recall, and direct confused-word comparison.
- The project is currently at 0-to-1 stage and needs a deployable MVP before deeper platform splitting.
- The product will eventually launch, so architecture should avoid local-only prototype choices that block production evolution.

## Architecture Decision

### Chosen Architecture

Use a **modular full-stack monolith**:

- `Next.js App Router` for pages and server endpoints
- `Node.js runtime` for server work
- `PostgreSQL` for structured content and future user data
- `Prisma` for schema management, typed access, and migrations
- application-layer retrieval services for query understanding and ranking
- `OpenAI Responses API` for final teaching response generation

This means:

- no separate frontend repo and backend repo in V1
- no separate NestJS/Go/Java service in V1
- no local JSON files as the long-term production source of truth
- no vector-first retrieval architecture in V1

### Why This Is The Best Fit

EngGo's knowledge domain is highly structured:

- vocabulary entries
- aliases and forms
- exam-scope membership
- confusion groups
- teaching priority
- user collections and progress

That structure maps naturally to relational storage. The model should consume grounded, scoped candidates that are already filtered and ranked by the app. This reduces hallucination risk and keeps the product aligned with the exam-first promise.

## Technology Stack

### Application Layer

- `Next.js App Router`
- `React`
- `TypeScript`
- `Tailwind CSS`
- `pnpm`

### Server Layer

- `Next.js Route Handlers`
- Node.js runtime
- service modules for `content`, `retrieval`, `chat`, and later `user-progress`

### Data Layer

- `PostgreSQL`
- `Prisma ORM`
- `Prisma Migrate`

### Retrieval Layer

- relational retrieval over normalized vocabulary and confusion-group tables
- `pg_trgm` for English fuzzy matching and typo-tolerant recall
- deterministic ranking rules in application code
- optional `pgvector` only in later phases if semantic retrieval becomes necessary

### LLM Layer

- `OpenAI Responses API`
- a provider adapter inside the codebase so the app is not coupled to a raw SDK call path
- structured grounding passed into the model instead of open-ended retrieval prompts

### Quality Layer

- `Vitest`
- `React Testing Library`
- `Playwright`
- `Sentry`

## Data Strategy

### Source Of Truth

The production source of truth should be PostgreSQL, not static JSON files in the repo.

However, the first content import path can still begin from versioned seed files or curated scripts. The important distinction is:

- JSON may be an import artifact
- PostgreSQL is the runtime source of truth

### First Data Domains

The database should at least model:

- `exam_scope`
- `vocabulary_entry`
- `vocabulary_alias`
- `vocabulary_meaning`
- `vocabulary_collocation`
- `confusion_group`
- `confusion_group_member`

Later phases can add:

- `user`
- `user_exam_target`
- `user_collection`
- `user_progress_snapshot`
- `chat_session`
- `chat_message`

## Retrieval Strategy

### Principle

EngGo should be **retrieval-first, generation-second**.

The server should first:

1. detect query mode
2. normalize the query
3. retrieve in-scope candidates
4. expand nearby confusion terms when useful
5. rank and explain why these candidates were selected

Only then should the LLM generate the final answer.

### Why Not Vector-First

For this product, the highest-value cases are:

- exact or near-exact Chinese meaning recall
- incomplete English spelling
- explicit confusion between a known small word group

These are better handled first by:

- structured lexical search
- trigram similarity
- explicit relationship tables

Vector search may become useful later for:

- natural-language half-remembered descriptions at larger scale
- note search
- uploaded document retrieval
- broader semantic learning workflows

But it should not be the foundation of V1.

## Deployment Strategy

### Chosen Direction

Keep the codebase monolithic, but keep deployment flexible:

- start with standard Node.js deployment or Docker deployment
- do not hard-bind the architecture to one platform feature set
- keep environment configuration portable

Possible hosting combinations:

- Next.js app on Vercel + hosted Postgres
- Next.js app on Railway/Render/Fly + hosted Postgres
- Dockerized deployment later if infrastructure requirements become stricter

### Why Not Immediate Frontend/Backend Separation

At this stage, splitting into separate frontend and backend services would increase:

- deployment complexity
- schema coordination cost
- interface churn
- product iteration friction

The product is still validating the core retrieval + explanation loop. The boundary that matters today is **module boundary**, not **service boundary**.

So the rule is:

- single deployable app
- explicit internal layering
- split services later only if scale or team structure demands it

## Authentication Decision

Authentication is not the differentiator of V1.

Recommended approach:

- V1 beta can launch without mandatory account creation if needed
- if cross-device collections/progress are required before launch, add auth as the next vertical slice
- when auth is added, prefer a solution that integrates cleanly with Postgres-backed user data

This document does not force auth into the first implementation slice, but it keeps the schema and service layout ready for it.

## Error Handling And Observability

The first deployable version should include:

- validated server env loading
- explicit 4xx/5xx API error contracts
- request correlation IDs for model calls
- logging of model request IDs when available
- Sentry error reporting for client and server failures

This matters because LLM calls and retrieval mistakes are production concerns, not polish work.

## Rejected Alternatives

### Option A: Local JSON + Fuse.js Prototype Stack

Rejected as the main path because:

- it is fast for prototyping but weak as a production source of truth
- user data evolution becomes awkward
- content operations and migrations become harder over time
- production retrieval logic ends up duplicated when moving to a database

### Option B: Full Frontend/Backend Separation Now

Rejected for V1 because:

- it adds infrastructure before the product loop is stable
- API contracts will churn while retrieval logic is still evolving
- it creates more process overhead than product value at this stage

### Option C: Vector-First RAG Architecture

Rejected for V1 because:

- EngGo's value is not document retrieval over unstructured corpora
- explicit exam boundaries and confusion groups matter more than semantic similarity alone
- it makes retrieval less interpretable in the most important product flows

## Final Recommendation

EngGo should be built first as:

- a deployable Next.js full-stack monolith
- backed by PostgreSQL and Prisma
- using deterministic retrieval over structured exam vocabulary data
- with OpenAI generating the final teaching response from grounded candidates

This is the best balance of:

- speed to launch
- correctness for the product thesis
- low complexity at 0-to-1 stage
- clean upgrade path toward future service splitting or agent features

## Immediate Planning Consequence

The current implementation plan should be updated in these ways:

- replace local JSON as runtime source of truth with PostgreSQL + seed/import flow
- replace pure in-memory retrieval assumptions with database-backed retrieval
- keep Next.js as the single deployable application
- defer service separation
- treat auth as a follow-up slice, not a prerequisite for first core-loop validation
