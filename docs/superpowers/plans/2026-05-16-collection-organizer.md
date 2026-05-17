# Collection Organizer 1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing local collection placeholder into a usable wordbook organizer with structured metadata, deletion, dedupe, and a return-to-chat action.

**Architecture:** Keep localStorage as the only persistence layer. Extend the collection repository contract first, then teach chat collection actions to save candidate metadata, then render the richer data in the existing collections panel. Do not touch backend retrieval, provider logic, Prisma, or FastAPI.

**Tech Stack:** Next.js App Router, React 19, TypeScript, localStorage, Vitest, Testing Library.

---

## Files

- Modify: `src/features/collections/collection-store.ts`
  - Extend collection types.
  - Normalize legacy data.
  - Add remove operation.
  - Keep listener notifications.
- Modify: `src/features/collections/collection-store.test.ts`
  - Add red tests for metadata persistence, dedupe update, and delete.
- Modify: `src/components/chat/answer-actions.tsx`
  - Pass candidate metadata into `addCollectedWord`.
- Modify: `src/components/chat/answer-actions.test.tsx`
  - Assert saved collection metadata from a source/external candidate.
- Modify: `src/features/collections/study-panels.tsx`
  - Render richer collection cards and live updates.
  - Add delete and continue-ask actions.
- Create: `src/features/collections/study-panels.test.tsx`
  - Cover collection organizer rendering and delete behavior.
- Optional modify: `src/components/chat/chat-workspace.tsx` / `src/features/chat/use-chat-session.ts`
  - Only if needed for query draft prefill from collection links.
- Modify: `docs/README.md`
  - Add this plan as current/completed once done.
- Modify: `progress.md`
  - Rewrite top handoff block after verification.

## Task 1: Collection Store Metadata and Delete

- [x] **Step 1: Add failing store tests**

Add tests showing:
- structured metadata is persisted and listed;
- adding the same lemma in the same exam target updates instead of duplicating;
- removing a lemma deletes only that target's copy;
- legacy `lemma + note` entries still list safely.

Run: `corepack pnpm test src/features/collections/collection-store.test.ts`

Expected: FAIL because metadata/delete APIs are missing.

- [x] **Step 2: Implement minimal store changes**

Extend `CollectedWordInput` / `CollectedWord`, normalize optional metadata, add `removeCollectedWord`.

- [x] **Step 3: Verify store tests pass**

Run: `corepack pnpm test src/features/collections/collection-store.test.ts`

Expected: PASS.

## Task 2: Chat Collection Writes Metadata

- [x] **Step 1: Add failing AnswerActions test**

Assert clicking `加入收藏` for a candidate with `sourceKind`, `meaningsZh`, `partOfSpeech`, and `reviewStatus` persists those fields.

Run: `corepack pnpm test src/components/chat/answer-actions.test.tsx`

Expected: FAIL because `AnswerActions` currently saves only `lemma + note`.

- [x] **Step 2: Implement metadata save**

Update `handleCollect` so it passes metadata from the selected candidate.

- [x] **Step 3: Verify AnswerActions tests pass**

Run: `corepack pnpm test src/components/chat/answer-actions.test.tsx`

Expected: PASS.

## Task 3: Collections Organizer UI

- [x] **Step 1: Add failing CollectionsPanel tests**

Use jsdom localStorage fixtures to assert:
- grouped cards display POS, short meaning, source label, and collected time;
- delete removes the item from localStorage and the page;
- continue-ask link points back to chat with a draft query.

Run: `corepack pnpm test src/features/collections/study-panels.test.tsx`

Expected: FAIL because the page lacks these controls.

- [x] **Step 2: Implement organizer UI**

Use `useSyncExternalStore` with `subscribeCollectionChanges` so the panel updates after delete. Keep layout dense and mobile-safe.

- [x] **Step 3: Verify CollectionsPanel tests pass**

Run: `corepack pnpm test src/features/collections/study-panels.test.tsx`

Expected: PASS.

## Task 4: Chat Draft Prefill

- [x] **Step 1: Add failing chat prefill test**

Assert `/ ?draft=...` or `/?draft=...` initializes the composer with the decoded draft text.

Run: `corepack pnpm test src/components/chat/chat-workspace.test.tsx`

Expected: FAIL if no prefill support exists.

- [x] **Step 2: Implement minimal prefill**

Read `draft` from `useSearchParams()` in `ChatWorkspace` and pass it into `useChatSession({ initialPrompt })`.

- [x] **Step 3: Verify chat workspace tests pass**

Run: `corepack pnpm test src/components/chat/chat-workspace.test.tsx`

Expected: PASS.

## Task 5: Docs and Focused Verification

- [x] **Step 1: Update docs**

Update `docs/README.md` and rewrite the top of `progress.md` to show collection organizer as the current completed slice and review cards as the next slice.

- [x] **Step 2: Run focused frontend tests**

Run:
- `corepack pnpm test src/features/collections/collection-store.test.ts src/components/chat/answer-actions.test.tsx src/features/collections/study-panels.test.tsx src/components/chat/chat-workspace.test.tsx`
- `corepack pnpm lint src/features/collections/collection-store.ts src/features/collections/collection-store.test.ts src/components/chat/answer-actions.tsx src/components/chat/answer-actions.test.tsx src/features/collections/study-panels.tsx src/features/collections/study-panels.test.tsx src/components/chat/chat-workspace.tsx src/features/chat/use-chat-session.ts`

Expected: PASS.

- [x] **Step 3: Review diff**

Run `git diff --stat` and inspect relevant changed files before reporting.
