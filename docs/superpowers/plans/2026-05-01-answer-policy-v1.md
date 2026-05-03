# Answer Policy v1 Loosening Spike Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This plan is intentionally a spike, not a full answer-policy framework.

**Goal:** Loosen the current over-rigid chat path in the smallest safe way, then observe what breaks before adding more rules.

**Architecture:** Keep the existing grounded RAG path intact. Add only two low-risk escape hatches: plain greetings skip retrieval, and clear English-learning questions that miss the current small vocabulary slice can be answered by the model without pretending to be grounded. High-risk low-confidence cases stay conservative.

**Tech Stack:** Next.js route handlers, existing TypeScript chat service/provider, Vitest, React Testing Library, manual browser/API smoke.

---

## Why This Is A Spike

The product problem is not that EngGo lacks enough rules. The current problem is that the rules are sitting in front of the model and blocking basic interaction.

This spike should **reduce stiffness**, not build a bigger policy machine.

Working boundary after the first smoke loop:
- RAG is an evidence system, not an answer-permission system.
- Retrieval should decide whether an answer can be marked `grounded`.
- Retrieval should not be the only gate for whether EngGo can answer a clear low-risk English-learning question.
- If retrieval is incomplete but the user intent is clear, use `plain` and do not show hit status, collection actions, or exam-scope claims.
- If the object is suspicious or high-risk, keep conservative clarification/no-match behavior.

Success means:
- `你好` no longer becomes a no-match retrieval failure.
- `complex 和 complicate 是一个意思吗` can get a natural English-learning answer even if the current `real-smoke` slice does not contain those words.
- Grounded answers such as `tion 结尾的词有哪些` and `access assess excess 怎么区分` keep their current RAG behavior.
- High-risk cases such as `re+con 的词根有什么词` still do not fabricate a word family.
- We collect real failure modes from smoke before deciding whether any extra constraints are needed.

Non-goal:
- Do not design a complete Agent.
- Do not add a broad mode taxonomy.
- Do not rewrite retrieval.
- Do not loosen fuzzy thresholds.
- Do not make every answer type carry new UI machinery.

---

## File Structure

- Modify `src/app/api/chat/route.ts`
  - Add a tiny pre-retrieval greeting short-circuit.
- Modify `src/features/answering/chat-service.ts`
  - Add a narrow fallback for clear English-learning questions after retrieval returns no-match.
  - Keep grounded resolved behavior unchanged.
- Modify `src/features/answering/chat-provider.ts` only if the existing provider input cannot support non-grounded fallback cleanly.
  - Prefer the smallest possible change.
- Modify `src/features/chat/types.ts` only if the UI needs a lightweight answer identity.
  - Prefer `answerKind?: "grounded" | "plain"` over a large enum.
- Modify `src/features/chat/use-chat-session.ts` only if `types.ts` changes.
- Modify `src/components/chat/message-thread.tsx`
  - Avoid showing hit/no-match support panels when the response is a plain non-grounded answer.
- Modify `src/components/chat/chat-workspace.test.tsx`
  - Cover the visible behavior for greeting and plain fallback.
- Modify `src/features/answering/chat-service.test.ts`
  - Cover provider-called versus provider-skipped behavior.
- Modify `progress.md`
  - Record that the plan was narrowed from a full policy framework to a lightening spike.

---

### Task 1: Greeting Escape Hatch

**Intent:** Remove the lowest-risk stiffness first. Greetings should feel like chat, not failed retrieval.

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/components/chat/chat-workspace.test.tsx`
- Modify: `src/features/chat/types.ts` only if needed
- Modify: `src/features/chat/use-chat-session.ts` only if needed
- Modify: `src/components/chat/message-thread.tsx` only if needed

- [x] **Step 1: Write the failing UI test**

Add a test where `/api/chat` returns:

```ts
{
  answer: "你好。你可以直接问一个单词、两个易混词，或者给我一个中文意思，我会先帮你缩小备考范围。",
  answerKind: "plain",
  requestId: "req_greeting",
  providerRequestId: null
}
```

Assert:
- the greeting answer renders;
- no `命中状态`;
- no `暂未稳定命中`;
- no `收藏工具`;
- no `加入收藏`.

- [x] **Step 2: Run the focused UI test and confirm it fails**

Run:

```bash
corepack pnpm test src/components/chat/chat-workspace.test.tsx
```

Expected: fail because the current UI/API type assumes grounded-style responses.

Actual: the new UI assertion passed immediately because `MessageThread` already renders assistant messages without `grounding` as plain answer-only content. Kept the test as regression coverage.

- [x] **Step 3: Implement the smallest response identity**

Preferred shape:

```ts
type ChatAnswerKind = "grounded" | "plain";
```

Rules:
- Existing resolved/no-match retrieval responses can be `grounded`.
- Greeting is `plain` and has no `grounding`.
- If omitting `answerKind` is less invasive, the UI can treat `!grounding` as plain. Do that only if it stays readable and testable.

- [x] **Step 4: Short-circuit greetings before retrieval**

In `src/app/api/chat/route.ts`, before `retrieveCandidates`, detect only obvious greetings:
- `你好`
- `您好`
- `hi`
- `hello`
- `hey`

Return a local short answer. Do not call provider. Do not call retrieval.

- [x] **Step 5: Verify the focused UI test passes**

Run:

```bash
corepack pnpm test src/components/chat/chat-workspace.test.tsx
```

Expected: pass.

---

### Task 2: Narrow Plain LLM Fallback

**Intent:** Let the model answer clear English-learning questions when the current small vocabulary slice misses, without pretending the answer is RAG-grounded.

**Files:**
- Modify: `src/features/answering/chat-service.ts`
- Modify: `src/features/answering/chat-service.test.ts`
- Modify: `src/features/answering/chat-provider.ts` only if needed
- Modify: `src/components/chat/chat-workspace.test.tsx`

- [x] **Step 1: Write failing service tests**

Add one no-match case that should call the provider:

```ts
query: "complex 和 complicate 是一个意思吗"
retrievalResult.resolution: "no_match"
```

Assert:
- provider is called once;
- response is plain/non-grounded;
- returned `grounding` is absent or not rendered as hit status;
- provider prompt says not to claim current vocabulary/exam-scope grounding.

Add one no-match case that should not call the provider:

```ts
query: "re+con 的词根有什么词"
retrievalResult.queryMode: "root_family_summary"
retrievalResult.noMatchReason: "low_confidence"
```

Assert:
- provider is not called;
- answer stays conservative;
- no fabricated word family.

- [x] **Step 2: Run focused service tests and confirm failure**

Run:

```bash
corepack pnpm test src/features/answering/chat-service.test.ts
```

Expected: fail because all no-match cases currently short-circuit provider calls.

Actual: failed as expected with `providerCalls` length `0` for the general-learning fallback case.

- [x] **Step 3: Add the narrow fallback heuristic**

Only allow fallback when all are true:
- retrieval is `no_match`;
- query contains at least one English token;
- query clearly asks an English-learning question, such as `意思`, `区别`, `区分`, `一样`, `怎么用`, `用法`, `造句`, `mean`, `difference`, or `use`;
- query is not a low-confidence root/fragment theory combination.

Do not create a large classifier file unless the code becomes hard to read.

Actual: fallback started narrow, then real API smoke exposed two boundary fixes:
- `complex 和 complicate 是一个意思吗` can surface as `low_confidence` when only part of the comparison resolves; because the user intent is clear, this should still be allowed as `plain` without exam-scope claims.
- `reqxust 是什么意思` can surface as `out_of_kb`; because the object looks spelling-uncertain, this should not be sent to plain fallback where the model may confidently guess the intended word.

- [x] **Step 4: Add the non-grounded provider prompt**

The provider prompt should say:
- answer as a general English-learning question;
- do not claim the answer comes from current exam scope;
- do not show hit status;
- keep the answer short and useful.

Use the existing provider abstraction. Do not add tool loops, memory, or Agent behavior.

- [x] **Step 5: Verify focused service tests pass**

Run:

```bash
corepack pnpm test src/features/answering/chat-service.test.ts
```

Expected: pass.

---

### Task 3: UI Separation For Plain Answers

**Intent:** Make plain answers feel natural while preventing evidence confusion.

**Files:**
- Modify: `src/components/chat/message-thread.tsx`
- Modify: `src/components/chat/chat-workspace.test.tsx`

- [x] **Step 1: Write failing UI tests**

Add tests for:
- greeting/plain answer renders without support panel;
- general fallback/plain answer renders without `命中状态`, `暂未稳定命中`, `收藏工具`, or `加入收藏`;
- grounded fixture still renders `命中状态` and collection tools.

- [x] **Step 2: Run focused UI tests and confirm failure**

Run:

```bash
corepack pnpm test src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx
```

Expected: fail until UI branches plain versus grounded.

Actual: the plain-answer UI tests passed immediately because the existing `!grounding` branch already rendered answer-only assistant messages. The no-match wording still needed the planned product-language cleanup.

- [x] **Step 3: Implement the smallest UI branch**

Preferred behavior:
- If an assistant message has no `grounding`, render only the answer body.
- If it has grounded `resolution: "resolved"`, keep current support panel and collection behavior.
- If it has grounded `resolution: "no_match"`, keep conservative support panel but update wording to say `当前词库暂未稳定定位`, not `当前考试范围内`.

- [x] **Step 4: Verify focused UI tests pass**

Run:

```bash
corepack pnpm test src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx
```

Expected: pass.

---

### Task 4: Smoke The Loosened Behavior

**Intent:** Observe real failure modes before adding more constraints.

**Files:**
- Modify: `progress.md`
- Modify: `bugs.md` only if a confirmed new problem appears

- [x] **Step 1: Run focused regression tests**

Run:

```bash
corepack pnpm test src/features/answering/chat-service.test.ts src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx
```

Expected: pass.

Actual: `corepack pnpm test src/features/answering/chat-service.test.ts src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx` -> 3 files / 20 tests passed.

- [x] **Step 2: Run existing product smoke**

Run:

```bash
corepack pnpm eval:product-smoke
```

Expected: existing grounded cases still pass. If Prisma dev is unhealthy, recover using `bugs.md` before judging logic.

Actual: first run failed before business assertions because Prisma dev `enggo` was `not_running / ECONNREFUSED`; recovered with the existing `bugs.md` path (`prisma.CMD dev`, `db:migrate`, `db:seed:real-smoke`). Final `corepack pnpm eval:product-smoke` -> 37 total / 37 pass / 0 fail.

- [x] **Step 3: Browser/API smoke the spike cases**

Verify:
- `你好`: natural plain answer, no hit status, no no-match card.
- `complex 和 complicate 是一个意思吗`: plain model answer, no hit status, no collection tool, no claim of current exam-scope hit.
- `tion 结尾的词有哪些`: unchanged grounded answer.
- `access assess excess 怎么区分`: unchanged grounded answer.
- `re+con 的词根有什么词`: conservative, no fabricated family.

Actual:
- `你好`: `answerKind=plain`, no grounding/provider, UI shows no hit/no-match/collection panel.
- `complex 和 complicate 是一个意思吗`: `answerKind=plain`, provider called, no grounding, UI shows no hit/no-match/collection panel.
- `tion 结尾的词有哪些`: grounded resolved, 15 main answers, UI keeps hit status and collection tools.
- `access assess excess 怎么区分`: grounded resolved, 3 main answers, UI keeps hit status and collection tools.
- `re+con 的词根有什么词`: grounded no-match, no provider, no fabricated family.

- [x] **Step 4: Record what actually broke**

Update `progress.md` with:
- exact commands and pass/fail status;
- exact smoke outputs or concise observations;
- any model drift observed after loosening.

Update `bugs.md` only for confirmed issues, such as:
- plain fallback claiming exam-scope evidence;
- plain fallback over-expanding into long examples;
- UI showing grounded tools for non-grounded answers.

Actual: recorded in `progress.md`. No new `bugs.md` entry was needed; the only failure was the already-known local Prisma dev not-running state.

---

## Decision Rule After The Spike

Do not add more policy unless smoke shows a real problem.

If the spike works:
- keep the system light;
- avoid adding mode taxonomy;
- preserve the mental model: RAG manages evidence, LLM manages expression.

If the spike fails:
- add the smallest boundary that addresses the observed failure;
- prefer prompt boundaries and UI labeling over large routing trees;
- keep no-match as a last-resort safety path, not the default face of the product.
