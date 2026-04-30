# Chat Answer Display Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make resolved chat answer support panels compact, so broad root-family table answers are not followed by duplicate main-answer and collection lists.

**Architecture:** Keep `AnswerContent` as the answer renderer. Add a focused support-panel layer in `message-thread.tsx` or a small extracted component so grounding metadata displays as status plus next-step tools. Update `AnswerActions` so broad answers show a compact collection-tool entry first and only render individual collection rows after expansion.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest + Testing Library, existing localStorage collection store.

---

## File Structure

- Modify: `src/components/chat/message-thread.tsx`
  - Replace the long resolved `主答案` display with a compact hit summary.
  - Keep no-match behavior unchanged.
- Modify: `src/components/chat/answer-actions.tsx`
  - Add compact default state for broad candidate lists.
  - Preserve direct buttons for 1-5 candidates.
- Modify: `src/components/chat/answer-actions.test.tsx`
  - Cover broad list hidden-by-default behavior and expand behavior.
- Modify: `src/components/chat/chat-workspace.test.tsx`
  - Cover resolved support panel summary without duplicated long main-answer text.
- Modify: `progress.md`
  - Record implementation and verification after completion.

## Task 1: Lock Broad Collection Tools Behavior

**Files:**
- Modify: `src/components/chat/answer-actions.test.tsx`
- Modify: `src/components/chat/answer-actions.tsx`

- [x] **Step 1: Write failing broad-list test**

Add a test that renders `AnswerActions` with 8 candidates and asserts:

```ts
expect(screen.getByRole("button", { name: "展开收藏工具" })).toBeInTheDocument();
expect(screen.queryByText("word1")).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "加入收藏" })).not.toBeInTheDocument();
```

Then click `展开收藏工具` and assert the first 5 `加入收藏` buttons appear.

- [x] **Step 2: Run test and confirm RED**

Run:

```powershell
corepack pnpm test src/components/chat/answer-actions.test.tsx
```

Expected: fails because broad candidates are currently visible immediately.

- [x] **Step 3: Implement compact broad state**

In `AnswerActions`:

- add `isToolsOpen` or reuse `isExpanded` with a separate meaning
- when `grounding.mainAnswer.length > 5` and tools are closed, render only:
  - a short label such as `收藏工具`
  - copy like `这次命中 N 个词，展开后可以逐个收藏。`
  - button `展开收藏工具`
- after tools open, render current list behavior with first 5 visible and `展开全部 N 个`
- keep 1-5 candidate behavior unchanged

- [x] **Step 4: Run test and confirm GREEN**

Run:

```powershell
corepack pnpm test src/components/chat/answer-actions.test.tsx
```

Expected: all tests pass.

- [x] **Step 5: Commit**

```powershell
git add src/components/chat/answer-actions.tsx src/components/chat/answer-actions.test.tsx
git commit -m "feat: compact broad answer collection tools"
```

## Task 2: Compact Resolved Support Panel

**Files:**
- Modify: `src/components/chat/message-thread.tsx`
- Modify: `src/components/chat/chat-workspace.test.tsx`

- [x] **Step 1: Write failing support-panel test**

Add or update a chat workspace test with a broad resolved grounding. Assert:

```ts
expect(screen.getByText("已命中 8 个当前范围词")).toBeInTheDocument();
expect(screen.queryByText("word1 / word2 / word3 / word4 / word5 / word6 / word7 / word8")).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "展开收藏工具" })).toBeInTheDocument();
```

- [x] **Step 2: Run test and confirm RED**

Run:

```powershell
corepack pnpm test src/components/chat/chat-workspace.test.tsx
```

Expected: fails because `message-thread.tsx` currently renders the long `主答案` string.

- [x] **Step 3: Implement hit summary**

In `message-thread.tsx` resolved panel:

- Replace `主答案` label and lemma join string with compact hit summary.
- Suggested function:

```ts
function buildHitSummary(count: number, firstLemma?: string) {
  if (count === 1 && firstLemma) return `已命中 1 个当前范围词：${firstLemma}`;
  return `已命中 ${count} 个当前范围词`;
}
```

- Keep `confusionBoundary` only when it is short and useful; if it would duplicate a broad root-family answer, omit it.
- Keep `下一步`.
- Keep no-match branch unchanged.

- [x] **Step 4: Run test and confirm GREEN**

Run:

```powershell
corepack pnpm test src/components/chat/chat-workspace.test.tsx
```

Expected: all tests pass.

- [x] **Step 5: Commit**

```powershell
git add src/components/chat/message-thread.tsx src/components/chat/chat-workspace.test.tsx
git commit -m "feat: summarize resolved answer support panel"
```

## Task 3: Focused Verification and Handoff

**Files:**
- Modify: `progress.md`

- [x] **Step 1: Run focused component tests**

Run:

```powershell
corepack pnpm test src/components/chat/answer-content.test.tsx src/components/chat/answer-actions.test.tsx src/components/chat/chat-workspace.test.tsx
```

Expected: all pass.

- [x] **Step 2: Run focused lint**

Run:

```powershell
corepack pnpm exec eslint src/components/chat/answer-content.tsx src/components/chat/answer-actions.tsx src/components/chat/message-thread.tsx src/components/chat/answer-content.test.tsx src/components/chat/answer-actions.test.tsx src/components/chat/chat-workspace.test.tsx
```

Expected: pass.

- [x] **Step 3: Browser smoke**

Start or reuse local dev server, then check at mobile width with a broad answer such as `tion 结尾的词有哪些`.

Verify:

- table renders in answer body
- support panel shows hit summary, not long duplicate lemma string
- no individual collection rows before opening collection tools
- expanding collection tools reveals collection buttons
- page has no horizontal overflow

- [x] **Step 4: Update progress**

Record:

- files changed
- tests/lint/browser smoke result
- any remaining UI follow-up

- [x] **Step 5: Commit docs**

```powershell
git add progress.md docs/superpowers/specs/2026-04-30-chat-answer-display-tools.md docs/superpowers/plans/2026-04-30-chat-answer-display-tools.md
git commit -m "docs: plan chat answer display tools"
```
