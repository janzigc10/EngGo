# Conversational Learning Context V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first usable slice of EngGo's multi-turn learning context so a learner can ask follow-ups like `第二个是什么意思`、`这组怎么背`、`把这组都收藏` without the chat acting like a fresh one-off query.

**Architecture:** Add a small deterministic `ConversationalLearningContext` object to the chat contract. The backend captures it from grounded responses, resolves short follow-up text before normal routing, and returns either a rewritten query, a local action, or a clarification. The frontend stores the latest context in the chat transcript, sends it with the next request, renders a quiet context hint, and applies collection actions locally.

**Tech Stack:** Python 3.12 FastAPI backend, Pydantic chat schemas, existing `OrdinaryLookupService` / `DirectCompareService` / `AdvancedLookupService`, pytest, Next.js 16 / React 19 frontend, Vitest, localStorage collection store, TypeScript smoke runners, `corepack pnpm`.

---

## Product Contract

- V1 only tracks the most recent learnable topic in the current browser session. Do not add user accounts, DB persistence, cross-session long-term memory, or multi-topic stacks.
- Treat context as structured product state, not model prose. Candidate identity, index, scope, and collection targets must come from `grounding`, not from parsing rendered answer text.
- Use 1-based candidate indexes because user-facing references are ordinal: `第一个 -> index 1`, `第二个 -> index 2`.
- Resolver must be conservative. If context is absent, stale, empty, or ambiguous, return clarification instead of guessing.
- Existing deterministic retrieval boundaries stay intact:
  - Ordinary English lookup remains its own global path.
  - `meaning_lookup` scope-tag filtering from `2026-05-20-meaning-lookup-scope-tag-filter.md` must not be loosened.
  - ECDICT remains `external_dictionary_basic`, not `structured`.
  - Collection actions do not call provider.
- V1 accepts small helper modules and types, but no broad UI redesign, review cards, or learning-plan work.

## File Map

- Add: `backend/app/conversation/__init__.py`
- Add: `backend/app/conversation/learning_context.py`
  - Pydantic-friendly dataclasses or plain helpers for context capture, follow-up resolution, and response annotation.
- Add: `backend/tests/test_learning_context.py`
  - Pure unit tests for context capture and resolver behavior.
- Modify: `backend/app/schemas/chat.py`
  - Add optional request/response fields for `conversationContext` and `resolvedFollowUp`.
- Modify: `backend/app/api/chat.py`
  - Resolve follow-ups before service routing, return clarification/action responses, and attach new context to grounded responses.
- Modify: `backend/tests/test_chat_contract.py`
  - API-level contract tests proving second-turn rewrites, clarification, action, and context capture.
- Modify: `src/features/chat/types.ts`
  - Add frontend equivalents of context and resolver response types.
- Modify: `src/features/chat/use-chat-session.ts`
  - Persist latest context, send it in request body, and apply resolved collection actions.
- Add: `src/features/chat/conversation-context.ts`
  - Client-side helpers for latest context selection and collect-action application.
- Add: `src/features/chat/conversation-context.test.ts`
  - Focused frontend helper tests.
- Modify: `src/components/chat/chat-workspace.tsx`
  - Render the quiet current-context hint and clarification options.
- Modify: `src/components/chat/message-thread.tsx`
  - If needed, render resolver metadata on assistant messages without changing answer content.
- Modify: `src/components/chat/chat-workspace.test.tsx`
  - Cover second-turn request payload, hint rendering, clarification, and collection action behavior.
- Modify: `src/features/answering/build-grounding.ts`
  - Type optional backend grounding fields such as `learningIntentPlan` only if needed by context capture display.
- Add: `scripts/lib/conversational-learning-context-smoke.ts`
- Add: `scripts/lib/conversational-learning-context-smoke.test.ts`
- Add: `scripts/run-conversational-learning-context-smoke.ts`
  - Stateful two-turn smoke matrix against FastAPI or Next proxy.
- Modify: `package.json`
  - Add a script such as `eval:fastapi:conversation-context-smoke`.
- Update after implementation: `progress.md`, `docs/README.md`, and only if a confirmed residual appears, `bugs.md`.

---

### Task 1: Define The Context Contract And Capture Rules

**Files:**
- Add: `backend/app/conversation/__init__.py`
- Add: `backend/app/conversation/learning_context.py`
- Add: `backend/tests/test_learning_context.py`
- Modify: `backend/app/schemas/chat.py`

- [x] **Step 1: Write red tests for context capture from existing grounding**

Create `backend/tests/test_learning_context.py` with fixture payloads that mirror real response `grounding`.

Cover:

```python
def test_context_capture_from_direct_compare_uses_comparison_member_order():
    payload = ChatSuccessResponse(
        answer="access / assess / excess",
        answerKind="grounded",
        grounding={
            "activeExamTarget": "cet6",
            "queryMode": "direct_compare",
            "answerStyle": "confusion_untangle",
            "resolution": "resolved",
            "mainAnswer": [],
            "confusionBoundary": [],
            "comparisonView": {
                "id": "access-assess-excess",
                "members": [
                    {"entryId": "access", "lemma": "access", "meaningsZh": ["进入权"], "inScope": True},
                    {"entryId": "assess", "lemma": "assess", "meaningsZh": ["评估"], "inScope": True},
                    {"entryId": "excess", "lemma": "excess", "meaningsZh": ["过量"], "inScope": True},
                ],
            },
        },
        requestId="req_1",
    )

    context = build_conversation_context(
        payload=payload,
        active_exam_target="cet6",
        source_message_id="assistant_1",
    )

    assert context is not None
    assert context["topicKind"] == "direct_compare"
    assert [item["lemma"] for item in context["candidates"]] == ["access", "assess", "excess"]
    assert [item["index"] for item in context["candidates"]] == [1, 2, 3]
```

Also add capture tests for:

- ordinary lookup with one `mainAnswer` -> `topicKind="standard_lookup"`, `focus.lemma` set.
- broad word family from `mainAnswer` / `learningIntentPlan.task == "word_family"` -> candidates preserve returned order.
- no-match or plain response -> returns `None`.

- [x] **Step 2: Add schema models in `backend/app/schemas/chat.py`**

Add Pydantic models with minimal fields needed by V1:

```python
class LearningCandidateRef(BaseModel):
    index: int
    lemma: str
    label: str
    entryId: str | None = None
    sourceKind: str | None = None
    partOfSpeech: str | None = None
    meaningZh: str | None = None
    reviewStatus: str | None = None


class LearningFocus(BaseModel):
    kind: Literal["lemma", "phrase", "candidate_group", "meaning_candidate"]
    label: str
    lemma: str | None = None
    index: int | None = None


class ConversationalLearningContext(BaseModel):
    version: Literal[1] = 1
    activeExamTarget: ExamTarget
    sourceMessageId: str
    topicKind: str
    focus: LearningFocus | None = None
    candidates: list[LearningCandidateRef] = Field(default_factory=list)
    availableActions: list[str] = Field(default_factory=list)
    expiresAfterTurns: int = 2
```

Add optional fields:

```python
class ChatRequest(BaseModel):
    ...
    conversationContext: ConversationalLearningContext | None = None


class ChatSuccessResponse(BaseModel):
    ...
    conversationContext: ConversationalLearningContext | None = None
    resolvedFollowUp: dict[str, Any] | None = None
```

Do not make these fields required; old clients and existing tests must keep passing.

- [x] **Step 3: Implement `build_conversation_context()`**

Implement in `backend/app/conversation/learning_context.py`.

Capture candidates in this order:

1. `grounding.comparisonView.members` when present.
2. `grounding.rootFamilyView.members` when present.
3. `grounding.mainAnswer`.
4. `grounding.confusionBoundary` only as a fallback if no main candidates exist.

Normalize candidate refs:

- trim `lemma`, skip empty lemma,
- dedupe by lowercase lemma while preserving first occurrence,
- use 1-based `index`,
- include `entryId`, `partOfSpeech`, `sourceKind`, `reviewStatus`, and compact `meaningZh` when available.

Derive `topicKind` from:

- `direct_compare` when `queryMode == "direct_compare"` or `comparisonView` exists,
- `shape_neighbors` when `queryMode == "shape_neighbor_search"`,
- `word_family` when `learningIntentPlan.task == "word_family"` or `rootFamilyView` exists,
- `meaning_lookup` when `queryMode == "meaning_lookup"`,
- `broad_vocab` for other resolved broad/root/semantic/form results,
- `standard_lookup` for ordinary lookup.

- [x] **Step 4: Run focused backend tests**

Run:

```powershell
$env:TMP='C:\tmp\enggo-pytest-tmp'; $env:TEMP='C:\tmp\enggo-pytest-tmp'; & 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests/test_learning_context.py backend/tests/test_chat_contract.py -p no:cacheprovider
```

Expected after implementation: all tests pass. If `test_chat_contract.py` fails only because new optional fields are serialized as `null`, adjust `response_json()` in Task 3 to prune `None` fields consistently.

- [x] **Step 5: Commit checkpoint**

Commit only Task 1 files after green tests:

```powershell
git add backend/app/conversation/__init__.py backend/app/conversation/learning_context.py backend/app/schemas/chat.py backend/tests/test_learning_context.py
git commit -m "feat: add chat learning context contract"
```

---

### Task 2: Implement The Deterministic Follow-up Resolver

**Files:**
- Modify: `backend/app/conversation/learning_context.py`
- Modify: `backend/tests/test_learning_context.py`

- [x] **Step 1: Add red resolver tests**

Add pure tests for these cases:

1. `第二个是什么意思` with context candidates `[access, assess, excess]` -> `resolved_query`, query `assess 是什么意思`, target `assess`.
2. `第二个怎么用` with shape-neighbor context `[evaluate, evacuate, escalate]` -> `resolved_query`, query `evacuate 怎么用`.
3. `这组怎么背` with direct compare context -> `resolved_query`, query `access assess excess 怎么背`, all three targets.
4. `收藏第二个` -> `resolved_action`, action `collect_one`, target `assess`.
5. `把这组都收藏` -> `resolved_action`, action `collect_group`, all candidates.
6. `第二个是什么意思` with `conversationContext=None` -> `clarification`.
7. `这个是什么意思` with multiple candidates and no focus lemma -> `clarification` options.
8. `access 是什么意思` with context -> `not_follow_up`.

- [x] **Step 2: Implement intent detection without provider**

In `learning_context.py`, add:

```python
def resolve_follow_up(
    query: str,
    context: ConversationalLearningContext | None,
    active_exam_target: ExamTarget,
) -> dict[str, Any]:
    ...
```

Use simple deterministic patterns:

- Ordinals: `第一个|第1个|第二个|第2个|第三个|第3个|最后一个`.
- Near references: `这个|它|刚才那个|刚才那个词`.
- Group references: `这组|这几个|上面那几个|刚才那组`.
- Actions:
  - collect: `收藏|加入收藏|收进生词本`.
  - meaning: `什么意思|是什么意思|啥意思|是什么`.
  - usage: `怎么用|用法|例句`.
  - compare: `区别|区分|辨析|差别`.
  - memory: `怎么背|怎么记|记忆`.

Keep the resolver small and explicit. Do not call `normalize_query()` inside it except possibly for a final safeguard; the resolver should only rewrite obvious follow-ups.

- [x] **Step 3: Rewrite to existing query shapes**

Use these V1 rewrites:

- `target + 意思` -> `{lemma} 是什么意思`
- `target + 用法` -> `{lemma} 怎么用`
- group compare -> `{lemma1} {lemma2} {lemma3} 怎么区分`
- group memory -> `{lemma1} {lemma2} {lemma3} 怎么背`

Return all rewrites as data, not direct answers:

```python
{
    "kind": "resolved_query",
    "query": "assess 是什么意思",
    "activeExamTarget": "cet6",
    "targetRefs": [...],
    "reason": "ordinal_target",
}
```

For clarification:

```python
{
    "kind": "clarification",
    "message": "我还不知道你说的是哪一个词。你可以点一个，或把那组词再发我一下。",
    "options": context.candidates[:5] if context else [],
}
```

- [x] **Step 4: Run resolver tests**

Run:

```powershell
$env:TMP='C:\tmp\enggo-pytest-tmp'; $env:TEMP='C:\tmp\enggo-pytest-tmp'; & 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests/test_learning_context.py -p no:cacheprovider
```

Expected: all resolver and capture tests pass.

- [x] **Step 5: Commit checkpoint**

```powershell
git add backend/app/conversation/learning_context.py backend/tests/test_learning_context.py
git commit -m "feat: resolve short chat follow-ups"
```

---

### Task 3: Wire Resolver Into FastAPI Chat Routing

**Files:**
- Modify: `backend/app/api/chat.py`
- Modify: `backend/tests/test_chat_contract.py`
- Modify if not already handled: `backend/app/schemas/chat.py`

- [x] **Step 1: Add API contract tests first**

Add tests to `backend/tests/test_chat_contract.py`:

1. A first grounded direct-compare response includes `conversationContext.candidates = access/assess/excess`.
2. A second request with that context and query `第二个是什么意思` calls the ordinary lookup service with `query="assess 是什么意思"` and returns `resolvedFollowUp.kind == "resolved_query"`.
3. A request `第二个是什么意思` without context returns 200 plain clarification, no provider request, no grounding.
4. `把这组都收藏` with context returns `resolvedFollowUp.kind == "resolved_action"` and does not call lookup services.
5. A normal query with context, such as `make up 是什么意思`, still routes as normal and does not get rewritten.

Use fake services with `calls` arrays so assertions prove the rewritten query actually enters the existing service cascade.

- [x] **Step 2: Extract a small routing helper to avoid duplicated service cascade**

In `backend/app/api/chat.py`, extract the existing ordinary -> direct compare -> advanced sequence into a helper:

```python
def answer_with_services(*, request, payload, request_id, query: str) -> JSONResponse | None:
    ...
```

or a helper that returns `(ChatSuccessResponse | ChatErrorResponse, status_code)`.

Keep behavior identical for non-follow-up requests.

- [x] **Step 3: Resolve before routing**

In `post_chat()`:

1. Keep greeting behavior as a top-level plain response.
2. Call `resolve_follow_up(payload.query, payload.conversationContext, payload.activeExamTarget)`.
3. If `kind == "clarification"`, return a `ChatSuccessResponse` with:
   - `answer` equal to the clarification message,
   - `answerKind="plain"`,
   - `resolvedFollowUp` set,
   - `providerRequestId=None`.
4. If `kind == "resolved_action"`, return a plain action acknowledgment with `resolvedFollowUp` set; do not call provider or retrieval.
5. If `kind == "resolved_query"`, route `resolved["query"]` through existing services.
6. If `kind == "not_follow_up"`, route the original query.

- [x] **Step 4: Attach response context after successful grounded answers**

After a service returns `ChatSuccessResponse`, call `build_conversation_context()` and attach:

```python
result.payload.conversationContext = context
result.payload.resolvedFollowUp = resolved if resolved["kind"] != "not_follow_up" else None
```

Use a stable backend `sourceMessageId` until the frontend overwrites with its local message id. Suggested format:

```python
source_message_id = f"{request_id}:assistant"
```

If the answer is plain or no-match with no candidates, leave `conversationContext` absent.

- [x] **Step 5: Prune optional null fields from JSON**

Update `response_json()` so it removes optional `None` fields:

```python
for key in ("grounding", "conversationContext", "resolvedFollowUp"):
    if content.get(key) is None:
        content.pop(key, None)
```

Do not remove `providerRequestId`; clients rely on explicit `null`.

- [x] **Step 6: Run backend contract verification**

Run:

```powershell
$env:TMP='C:\tmp\enggo-pytest-tmp'; $env:TEMP='C:\tmp\enggo-pytest-tmp'; & 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests/test_learning_context.py backend/tests/test_chat_contract.py backend/tests/test_ordinary_lookup_answer.py backend/tests/test_direct_compare_answer.py backend/tests/test_advanced_lookup.py -p no:cacheprovider
```

Expected: all pass. Pay attention to ordinary exact lookup and meaning lookup tests; failures there usually mean the resolver is too eager.

- [x] **Step 7: Commit checkpoint**

```powershell
git add backend/app/api/chat.py backend/app/schemas/chat.py backend/app/conversation/learning_context.py backend/tests/test_chat_contract.py backend/tests/test_learning_context.py
git commit -m "feat: route chat follow-ups through context resolver"
```

---

### Task 4: Store And Send Context In The Frontend Session

**Files:**
- Modify: `src/features/chat/types.ts`
- Add: `src/features/chat/conversation-context.ts`
- Add: `src/features/chat/conversation-context.test.ts`
- Modify: `src/features/chat/use-chat-session.ts`
- Modify: `src/components/chat/chat-workspace.test.tsx`
- Modify if needed: `src/features/collections/collection-store.ts`

- [x] **Step 1: Add frontend types**

In `src/features/chat/types.ts`, add:

```ts
export type LearningCandidateRef = {
  index: number;
  lemma: string;
  label: string;
  entryId?: string | null;
  sourceKind?: "structured" | "source_lemma" | "external_dictionary_basic" | string | null;
  partOfSpeech?: string | null;
  meaningZh?: string | null;
  reviewStatus?: "unreviewed" | string | null;
};

export type ConversationalLearningContext = {
  version: 1;
  activeExamTarget: ExamTargetCode;
  sourceMessageId: string;
  topicKind: string;
  focus?: { kind: string; label: string; lemma?: string | null; index?: number | null } | null;
  candidates: LearningCandidateRef[];
  availableActions: string[];
  expiresAfterTurns: number;
};

export type ResolvedFollowUp =
  | { kind: "resolved_query"; query: string; activeExamTarget: ExamTargetCode; targetRefs: LearningCandidateRef[]; reason: string }
  | { kind: "resolved_action"; action: "collect_one" | "collect_group" | string; activeExamTarget: ExamTargetCode; targetRefs: LearningCandidateRef[] }
  | { kind: "clarification"; message: string; options: LearningCandidateRef[] };
```

Add `conversationContext?: ConversationalLearningContext` and `resolvedFollowUp?: ResolvedFollowUp` to both `ChatMessage` and `ChatApiSuccessResponse`.

- [x] **Step 2: Add client helpers and tests**

Create `src/features/chat/conversation-context.ts` with:

- `latestConversationContext(messages: ChatMessage[]): ConversationalLearningContext | null`
  - returns the latest assistant message context,
  - ignores contexts whose `expiresAfterTurns` has been exceeded by later user turns.
- `applyResolvedFollowUpAction(resolvedFollowUp, activeExamTarget)`
  - for `collect_one` / `collect_group`, calls `addCollectedWord()` for each target,
  - converts `LearningCandidateRef` metadata into the existing `CollectedWordInput`,
  - returns a short status string for the assistant message or UI feedback.

Test:

- latest context survives one user follow-up but expires after the configured number of user turns.
- collect group writes all target lemmas to `enggo.collectedWords`.
- source metadata is preserved (`partOfSpeech`, `meaningZh`, `sourceKind`, `reviewStatus`).

- [x] **Step 3: Send latest context in `useChatSession()`**

In `submitPrompt()`:

```ts
const conversationContext = latestConversationContext(messages);
...
body: JSON.stringify({
  activeExamTarget: activeExamTarget ?? fallbackExamTarget,
  query: prompt,
  history: toHistory(messages),
  conversationContext,
}),
```

If no context exists, omit the field rather than sending `null`.

Persist assistant messages with:

```ts
conversationContext: payload.conversationContext,
resolvedFollowUp: payload.resolvedFollowUp,
```

Keep `sessionStorage` transcript normalization tolerant of missing new fields.

- [x] **Step 4: Apply resolved collection actions**

When a successful payload has `resolvedFollowUp.kind === "resolved_action"`:

1. Apply `applyResolvedFollowUpAction()`.
2. Keep the backend answer text as the assistant message content.
3. Store `resolvedFollowUp` on that assistant message so UI/tests can show what happened.

Do not run collection logic for `resolved_query` or `clarification`.

- [x] **Step 5: Add ChatWorkspace tests**

In `src/components/chat/chat-workspace.test.tsx`, add cases:

- First mocked assistant payload includes `conversationContext`; second user prompt `第二个是什么意思` sends that object in the next request body.
- A `resolved_action collect_group` response writes all target lemmas to localStorage.
- Old stored transcripts without context still restore correctly.

- [x] **Step 6: Run frontend verification**

Run:

```powershell
corepack pnpm test src/features/chat/conversation-context.test.ts src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx src/features/collections/collection-store.test.ts
```

Expected: all pass.

- [x] **Step 7: Commit checkpoint**

```powershell
git add src/features/chat/types.ts src/features/chat/conversation-context.ts src/features/chat/conversation-context.test.ts src/features/chat/use-chat-session.ts src/components/chat/chat-workspace.test.tsx src/features/collections/collection-store.ts
git commit -m "feat: persist and send chat learning context"
```

Only include `collection-store.ts` if it was actually changed.

---

### Task 5: Add Minimal Context-Aware UI

**Files:**
- Modify: `src/components/chat/chat-workspace.tsx`
- Modify if needed: `src/components/chat/message-thread.tsx`
- Modify: `src/components/chat/chat-workspace.test.tsx`

- [x] **Step 1: Add a quiet context hint**

In `ChatWorkspace`, derive the latest context from `messages` and render a compact line near the input, for example:

```tsx
{currentContext ? (
  <p className="text-xs text-slate-500">
    正在追问：{currentContext.focus?.label ?? currentContext.candidates.slice(0, 3).map((item) => item.lemma).join(" / ")}
  </p>
) : null}
```

Keep it small. Do not introduce a new large card or sidebar redesign.

- [x] **Step 2: Render clarification options**

When the latest assistant message has `resolvedFollowUp.kind === "clarification"` and options:

- show up to 5 option buttons,
- clicking an option should put a concrete prompt into the composer, such as `{lemma} 是什么意思`,
- do not auto-submit.

This keeps the failure path useful without guessing.

- [x] **Step 3: Keep plain answers clean**

Add assertions that greeting/general plain answers without `resolvedFollowUp` do not show the context hint or option buttons.

- [x] **Step 4: Run focused UI tests and lint**

Run:

```powershell
corepack pnpm test src/components/chat/chat-workspace.test.tsx src/features/chat/conversation-context.test.ts
corepack pnpm lint src/components/chat/chat-workspace.tsx src/components/chat/message-thread.tsx src/features/chat/use-chat-session.ts src/features/chat/types.ts src/features/chat/conversation-context.ts
```

Expected: pass. If lint includes unchanged files and flags unrelated existing debt, document it in `progress.md` instead of widening the task.

- [x] **Step 5: Commit checkpoint**

```powershell
git add src/components/chat/chat-workspace.tsx src/components/chat/message-thread.tsx src/components/chat/chat-workspace.test.tsx src/features/chat/conversation-context.ts src/features/chat/conversation-context.test.ts
git commit -m "feat: show chat follow-up context"
```

Only stage files actually changed.

---

### Task 6: Add Stateful Multi-turn Smoke Coverage

**Files:**
- Add: `scripts/lib/conversational-learning-context-smoke.ts`
- Add: `scripts/lib/conversational-learning-context-smoke.test.ts`
- Add: `scripts/run-conversational-learning-context-smoke.ts`
- Modify: `package.json`

- [x] **Step 1: Implement a pure smoke evaluator test first**

The smoke library should support stateful cases:

```ts
type ConversationContextSmokeCase = {
  name: string;
  turns: Array<{
    query: string;
    activeExamTarget: ExamScopeCode;
    expectedStatus: number;
    expectedAnswerKind?: "grounded" | "plain";
    expectedResolvedKind?: "resolved_query" | "resolved_action" | "clarification";
    expectedResolvedQuery?: string;
    expectedTargetLemmas?: string[];
    expectedContextLemmas?: string[];
    expectedProviderRequest?: "absent" | "allowed";
  }>;
};
```

Add tests proving the evaluator catches:

- missing context after turn 1,
- wrong resolved query on turn 2,
- accidental provider call for collection action.

- [x] **Step 2: Add the V1 smoke matrix**

Add cases:

1. `access assess excess 怎么区分` -> `第二个是什么意思`
   - turn 1 expects context lemmas `access/assess/excess`,
   - turn 2 expects `resolved_query`, `assess 是什么意思`, target `assess`.
2. `access assess excess 怎么区分` -> `这组怎么背`
   - turn 2 expects `resolved_query`, target all three.
3. `给我几个跟 evaluate 易混的单词` -> `第二个怎么用`
   - turn 2 expects target `evacuate` if the fixture/smoke data currently returns it as the second candidate. If order is not stable locally, assert only `resolved_query` and a target lemma from the returned context.
4. `response 的派生词` -> `把这组都收藏`
   - turn 2 expects `resolved_action`, `collect_group`, provider absent.
5. `遵循的英文是什么` -> `还有更适合作文的吗`
   - if V1 resolver cannot safely support this semantic follow-up, mark it as documented deferred in the smoke comments and do not add a failing smoke yet. Do not fake support.
6. No context `第二个是什么意思`
   - expects `plain` clarification, no grounding, provider absent.

- [x] **Step 3: Implement runner**

The runner should:

1. POST turn 1 to `${baseUrl}/api/chat`.
2. Save returned `conversationContext`.
3. POST turn 2 with:

```json
{
  "activeExamTarget": "...",
  "query": "...",
  "history": [...],
  "conversationContext": { ... }
}
```

4. Validate each turn and print a compact pass/fail summary.

- [x] **Step 4: Add package script**

Add:

```json
"eval:fastapi:conversation-context-smoke": "tsx scripts/run-conversational-learning-context-smoke.ts"
```

Keep default base URL as `http://127.0.0.1:8000`, matching migrated FastAPI smoke conventions.

- [x] **Step 5: Run smoke library tests**

Run:

```powershell
corepack pnpm test scripts/lib/conversational-learning-context-smoke.test.ts
```

Expected: pass.

- [x] **Step 6: Commit checkpoint**

```powershell
git add package.json scripts/lib/conversational-learning-context-smoke.ts scripts/lib/conversational-learning-context-smoke.test.ts scripts/run-conversational-learning-context-smoke.ts
git commit -m "test: add conversational context smoke matrix"
```

---

### Task 7: Final Verification And Handoff

**Files:**
- Modify: `progress.md`
- Modify: `docs/README.md`
- Modify only if needed: `bugs.md`

- [x] **Step 1: Run focused backend verification**

Run:

```powershell
$env:TMP='C:\tmp\enggo-pytest-tmp'; $env:TEMP='C:\tmp\enggo-pytest-tmp'; & 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests/test_learning_context.py backend/tests/test_chat_contract.py backend/tests/test_ordinary_lookup_answer.py backend/tests/test_direct_compare_answer.py backend/tests/test_advanced_lookup.py backend/tests/test_broad_vocab_answer.py -p no:cacheprovider
```

Expected: pass.

- [x] **Step 2: Run focused frontend verification**

Run:

```powershell
corepack pnpm test src/features/chat/conversation-context.test.ts src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx src/features/collections/collection-store.test.ts scripts/lib/conversational-learning-context-smoke.test.ts
```

Expected: pass.

- [x] **Step 3: Run lint on changed files**

Run:

```powershell
corepack pnpm lint src/features/chat/types.ts src/features/chat/use-chat-session.ts src/features/chat/conversation-context.ts src/components/chat/chat-workspace.tsx src/components/chat/message-thread.tsx scripts/lib/conversational-learning-context-smoke.ts scripts/run-conversational-learning-context-smoke.ts
```

Python files are covered here by focused pytest/import execution; do not add a new formatter requirement unless the repo already has one.

- [x] **Step 4: Run live smoke when FastAPI is available**

Start the existing dev stack if needed, then run:

```powershell
corepack pnpm eval:fastapi:conversation-context-smoke
```

Expected: all V1 cases pass. If local FastAPI cannot be started because of known Windows/Prisma instability, run the pure test matrix and record the live-smoke skip reason in `progress.md`.

- [x] **Step 5: Update docs**

Update `progress.md`:

- note the branch and commit range,
- summarize the implemented V1 behavior,
- list exact verification commands and results,
- list residual unsupported follow-ups, especially if `还有更适合作文的吗` stays deferred.

Update `docs/README.md`:

- move this plan from current active to completed/history,
- keep the 2026-05-24 context design spec under current effective designs.

Update `bugs.md` only for confirmed bugs or deferred risk, not for generic future ideas.

- [x] **Step 6: Final diff checks**

Run:

```powershell
git diff --check
git status --short --branch
```

Expected: no whitespace errors; only intentional files changed before final commit.

- [x] **Step 7: Final commit**

```powershell
git add progress.md docs/README.md bugs.md
git commit -m "docs: update conversational context v1 handoff"
```

Only include `bugs.md` if it changed.

---

## Completion Criteria

- Backend responses for grounded learnable answers include a `conversationContext` with stable candidate refs.
- A second-turn request can carry that context and resolve at least:
  - `第二个是什么意思`
  - `第二个怎么用`
  - `这组怎么背`
  - `收藏第二个`
  - `把这组都收藏`
- No-context follow-ups return clarification instead of 501, provider fallback, or hallucinated targets.
- Frontend sends latest context, stores it in the transcript, shows a quiet current-context hint, and can apply collection actions from `resolvedFollowUp`.
- Multi-turn smoke exists and protects the V1 examples.
- Existing ordinary lookup, direct compare, broad vocab, meaning lookup scope-tag filtering, and collection tests remain green.

## Explicitly Deferred After V1

- Cross-session personal long-term memory.
- Multiple concurrent learning topics.
- Scope-switch follow-ups such as `换成考研范围`.
- Semantic style follow-ups such as `还有更适合作文的吗`, unless Task 6 proves the resolver can support it without guessing.
- Review cards and spaced repetition.
- Account/cloud sync for collections.
