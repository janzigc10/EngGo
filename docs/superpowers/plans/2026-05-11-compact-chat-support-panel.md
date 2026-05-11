# Compact Chat Support Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce mobile vertical weight in ordinary lookup answers by turning the large support card into compact source and action rows.

**Architecture:** Keep retrieval, FastAPI, answer policy, and answer content unchanged. Only change chat UI rendering: `MessageThread` owns compact support metadata, and `AnswerActions` renders a lightweight collect row for one-answer ordinary lookup while preserving the expanded tool for broad multi-answer results.

**Tech Stack:** Next.js, React 19, TypeScript, Vitest + Testing Library, Tailwind CSS.

---

### Task 1: Lock Compact Source Behavior With Tests

**Files:**
- Modify: `src/components/chat/chat-workspace.test.tsx`
- Modify: `docs/superpowers/plans/2026-05-11-compact-chat-support-panel.md`

- [x] **Step 1: Add failing compact source-lemma test**

Assert that a `source_lemma_exact` answer renders a compact source line:

`来源词表命中 · 待补人工结构化词条`

and no longer renders the verbose `来源说明` heading by default.

- [x] **Step 2: Add failing compact external dictionary test**

Assert that an `external_dictionary_exact` answer renders:

`外部基础词典 · 不参与易混词/词根/考试优先级判断`

and no longer renders the verbose `来源说明` heading by default.

- [x] **Step 3: Run the focused chat workspace tests and verify red**

Run:

```powershell
corepack pnpm test src/components/chat/chat-workspace.test.tsx
```

Expected: fails because current UI still renders the large support panel and verbose source note.

### Task 2: Compact Collection Action Tests

**Files:**
- Modify: `src/components/chat/answer-actions.test.tsx`
- Modify: `docs/superpowers/plans/2026-05-11-compact-chat-support-panel.md`

- [x] **Step 1: Add failing single-answer source collection row test**

Assert that a single `source_lemma` candidate renders one compact line with `加入收藏` and `来源词表命中，待补结构化释义`, without the `收藏动作` heading.

- [x] **Step 2: Add failing single-answer external dictionary row test**

Assert that a single `external_dictionary_basic` candidate renders one compact line with `加入收藏` and `外部基础词典释义`, without the nested candidate card.

- [x] **Step 3: Run answer-action tests and verify red**

Run:

```powershell
corepack pnpm test src/components/chat/answer-actions.test.tsx
```

Expected: fails because current component renders a nested action card.

### Task 3: Implement Compact Support UI

**Files:**
- Modify: `src/components/chat/message-thread.tsx`
- Modify: `src/components/chat/answer-actions.tsx`
- Modify: `docs/superpowers/plans/2026-05-11-compact-chat-support-panel.md`

- [x] **Step 1: Replace verbose source note with compact source summary**

Add a helper that returns one compact source line for source-lemma and external dictionary answers. Keep structured answers on the existing hit summary.

- [x] **Step 2: Keep no-match and broad multi-answer tools unchanged**

Only compact resolved ordinary lookup support. Preserve no-match messaging and broad `mainAnswer.length > 5` collapsed collection behavior.

- [x] **Step 3: Render single-answer collection as a compact row**

For one visible candidate, render `加入收藏` plus learner-facing note on one compact row instead of the nested `收藏动作` block.

- [x] **Step 4: Run focused component tests and verify green**

Run:

```powershell
corepack pnpm test src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx
```

Expected: pass.

### Task 4: Verification And Handoff

**Files:**
- Modify: `progress.md`
- Modify: `docs/README.md`
- Modify: `docs/superpowers/plans/2026-05-11-compact-chat-support-panel.md`

- [x] **Step 1: Run focused lint**

Run:

```powershell
corepack pnpm lint src/components/chat/message-thread.tsx src/components/chat/answer-actions.tsx src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx
```

Expected: pass.

- [x] **Step 2: Update progress and docs index**

Record compact support-panel behavior, verification, and next step in `progress.md`; add this completed plan to `docs/README.md`.

- [x] **Step 3: Commit**

Commit the compact support-panel slice.
