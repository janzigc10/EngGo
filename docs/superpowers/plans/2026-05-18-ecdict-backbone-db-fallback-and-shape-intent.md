# ECDICT Backbone DB Fallback And Shape Intent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining 2026-05-18 ECDICT-backbone gaps so ordinary lookup and student-style shape wording keep working when the structured DB is unavailable.

**Architecture:** Treat ECDICT as the runtime vocabulary base and the structured DB as an optional overlay. Catch only `StructuredLookupUnavailable` at the service boundary, continue through existing source/ECDICT fallback, and route "像 X 的词" wording into shape-neighbor grounding before ordinary lookup can claim it.

**Tech Stack:** Python 3.12, FastAPI backend, pytest, existing `OrdinaryLookupService`, `normalize_query`, `LearningIntentPlan`, dynamic light grounding, ECDICT profile lookup, and TypeScript smoke runners.

---

## Product Contract

- ECDICT remains `external_dictionary_basic` / `external_dictionary_exact`; do not rename it to `structured`.
- Structured data is an optional overlay. DB unavailable must not make ordinary lookup, direct compare, or broad fragment queries return 500 when ECDICT/source can answer.
- Catch only `StructuredLookupUnavailable`. Do not swallow SQL/query/schema errors.
- Ordinary exact lookup stays clean: no naked `confusion_group`, no scope tail, no proactive broad expansion.
- `有个像 institute 的词` and `有个和 institute 很像的词` should route to `shape_neighbor_search` / `shape_neighbors`, not `standard_lookup`.
- `institute 是什么意思` and `mitigate 是什么意思` remain ordinary lookup.
- Direct compare and broad fragment DB-unavailable behavior are already repaired; this plan keeps them as regression coverage rather than rebuilding them.

## File Structure

- Modify: `backend/app/answering/ordinary_lookup.py`
  - Owns ordinary exact/source/ECDICT fallback and must degrade gracefully when structured exact lookup is unavailable.
- Modify: `backend/tests/test_ordinary_lookup_answer.py`
  - Adds red tests for ordinary lookup with `StructuredLookupUnavailable`.
- Modify: `backend/app/retrieval/normalize_query.py`
  - Owns "像 X 的词" routing into shape-neighbor recall.
- Modify: `backend/tests/test_normalize_query.py`
  - Adds query-mode and intent-plan regressions.
- Modify: `backend/tests/test_student_intent_matrix.py`
  - Adds the student wording contract case if it remains the best shared matrix.
- Create: `scripts/lib/fastapi-db-unavailable-smoke.ts`
  - Focused smoke definitions for running against a FastAPI process pointed at a bad DB URL.
- Create: `scripts/lib/fastapi-db-unavailable-smoke.test.ts`
  - Unit tests for the focused no-DB smoke matrix.
- Create: `scripts/run-fastapi-db-unavailable-smoke.ts`
  - CLI runner that posts the focused matrix to a provided base URL.
- Modify: `package.json`
  - Adds a script for the focused no-DB smoke runner if the runner is created.
- Modify: `docs/README.md`
  - Registers this as the current active plan.
- Modify: `progress.md`
  - Keeps the next handoff pointed at this plan and its task status.
- Modify: `bugs.md`
  - Only after implementation, mark the ordinary lookup DB-unavailable issue as fixed and keep any newly confirmed residuals.

---

### Task 1: Ordinary Lookup DB-Unavailable Fallback

**Files:**
- Modify: `backend/app/answering/ordinary_lookup.py`
- Modify: `backend/tests/test_ordinary_lookup_answer.py`
- Optionally modify: `bugs.md` only after verification

- [x] **Step 1: Add a failing ordinary exact fallback test**

In `backend/tests/test_ordinary_lookup_answer.py`, import `StructuredLookupUnavailable` and extend the fake repository so `find_exact_entry()` can raise it:

```python
from backend.app.retrieval.repository import StructuredLookupUnavailable


class FakeRepository:
    def __init__(self, candidates, fuzzy_candidates=None, exact_error=None, fuzzy_error=None):
        self.candidates = candidates
        self.fuzzy_candidates = fuzzy_candidates or []
        self.exact_error = exact_error
        self.fuzzy_error = fuzzy_error
        self.lookups = []
        self.fuzzy_lookups = []

    def find_exact_entry(self, active_exam_target, lookup):
        self.lookups.append((active_exam_target, lookup))
        if self.exact_error:
            raise self.exact_error
        return self.candidates.get(lookup)

    def find_english_candidates(self, active_exam_target, needle):
        self.fuzzy_lookups.append((active_exam_target, needle))
        if self.fuzzy_error:
            raise self.fuzzy_error
        return self.fuzzy_candidates
```

Add:

```python
def test_postgrad_ecdict_lookup_survives_structured_exact_unavailable(tmp_path):
    service = OrdinaryLookupService(
        repository=FakeRepository(
            {},
            exact_error=StructuredLookupUnavailable("connection timeout expired"),
        ),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda query: profile(
            "substitute",
            ["v. 代替；替换；n. 替代者"],
            entry_kind="word",
            tag="ky",
        )
        if query == "substitute"
        else None,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="substitute 是什么意思",
        request_id="req_postgrad_substitute_no_db",
    )

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert result.payload.grounding["matchType"] == "external_dictionary_exact"
    assert result.payload.grounding["mainAnswer"][0]["lemma"] == "substitute"
    assert result.payload.grounding["mainAnswer"][0]["sourceKind"] == (
        "external_dictionary_basic"
    )
    assert result.payload.grounding["mainAnswer"][0]["scopeCodes"] == ["postgrad"]
```

- [x] **Step 2: Add a failing usage-wording fallback test**

Add a second test for the user-observed wording:

```python
def test_postgrad_usage_lookup_does_not_touch_structured_fuzzy_when_db_unavailable(tmp_path):
    repository = FakeRepository(
        {},
        exact_error=StructuredLookupUnavailable("connection timeout expired"),
        fuzzy_error=StructuredLookupUnavailable("connection timeout expired"),
    )
    service = OrdinaryLookupService(
        repository=repository,
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda query: profile(
            "substitute",
            ["v. 代替；替换；n. 替代者"],
            entry_kind="word",
            tag="ky",
        )
        if query == "substitute"
        else None,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="substitute 怎么用",
        request_id="req_postgrad_substitute_usage_no_db",
    )

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert result.payload.grounding["matchType"] == "external_dictionary_exact"
    assert result.payload.grounding["mainAnswer"][0]["lemma"] == "substitute"
    assert repository.fuzzy_lookups == []
```

The point of this test is not to add usage examples. It prevents the existing lookup/use wording from becoming a DB-dependent 500 before ECDICT can answer the basic entry.

- [x] **Step 3: Run the tests and verify RED**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_ordinary_lookup_answer.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: fail because `StructuredLookupUnavailable` bubbles out of `find_exact_entry()` or because `substitute 怎么用` continues into structured fuzzy lookup.

- [x] **Step 4: Catch only `StructuredLookupUnavailable` around structured exact lookup**

In `backend/app/answering/ordinary_lookup.py`, import the exception:

```python
from backend.app.retrieval.repository import StructuredLookupUnavailable
```

Then in `OrdinaryLookupService.answer()`:

```python
structured_lookup_unavailable = False
try:
    structured_candidate = self.repository.find_exact_entry(active_exam_target, needle)
except StructuredLookupUnavailable:
    structured_candidate = None
    structured_lookup_unavailable = True
```

Do not catch `Exception`, `psycopg.Error`, or SQL execution errors here.

- [x] **Step 5: Let single-term lookup/use wording use ECDICT before structured fuzzy**

Extend `should_use_ecdict_exact_fallback()` conservatively:

```python
def has_single_term_lookup_or_usage_cue(normalized_query: NormalizedQuery) -> bool:
    if len(normalized_query.english_terms) != 1:
        return False

    return re.search(
        r"(是什么意思|什么意思|是什么|啥意思|怎么用|用法)",
        normalized_query.normalized_text,
    ) is not None
```

Then allow:

```python
return (
    normalized_query.query_mode == "fuzzy_recall"
    and len(normalized_query.english_terms) == 1
    and (
        normalized_query.meaning_hint == normalized_query.english_terms[0]
        or has_single_term_lookup_or_usage_cue(normalized_query)
    )
)
```

This must not make "像 X 的词" ordinary lookup; Task 2 moves that route earlier.

- [x] **Step 6: Skip structured fuzzy lookup when DB is known unavailable**

Before calling `find_english_candidates`, guard:

```python
if structured_lookup_unavailable:
    return self.no_match(
        active_exam_target=active_exam_target,
        query=query,
        request_id=request_id,
        normalized_query=normalized_query,
        history=history,
    )
```

This line should only be reached when source/ECDICT fallback already missed. It prevents a second DB call from turning the graceful fallback into another 500.

- [x] **Step 7: Run focused tests and verify GREEN**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_ordinary_lookup_answer.py backend/tests/test_repository.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: pass; existing repository tests still prove SQL errors are not broadly swallowed.

- [x] **Step 8: Commit**

```powershell
git add backend/app/answering/ordinary_lookup.py backend/tests/test_ordinary_lookup_answer.py
git commit -m "Handle ordinary lookup when structured DB is unavailable"
```

- [x] **Step 9: Update this plan and `progress.md`**

Mark Task 1 completed and record the focused test result.

---

### Task 2: Route Plain "像 X 的词" Wording To Shape Neighbor

**Files:**
- Modify: `backend/app/retrieval/normalize_query.py`
- Modify: `backend/tests/test_normalize_query.py`
- Modify: `backend/tests/test_student_intent_matrix.py`

- [x] **Step 1: Add failing normalization tests**

In `backend/tests/test_normalize_query.py`, add:

```python
def test_plain_like_wording_routes_to_shape_neighbors():
    for query in ["有个像 institute 的词", "有个和 institute 很像的词"]:
        result = normalize_query(query)

        assert result.query_mode == "shape_neighbor_search"
        assert result.english_terms == ["institute"]
        assert result.intent_plan.task == "shape_neighbors"
        assert result.is_supported_ordinary_lookup is False
```

Also protect ordinary exact lookup:

```python
def test_plain_lookup_for_institute_stays_standard_lookup():
    result = normalize_query("institute 是什么意思")

    assert result.query_mode in {"direct_lookup", "fuzzy_recall"}
    assert result.intent_plan.task == "standard_lookup"
    assert result.is_supported_ordinary_lookup is True
```

- [x] **Step 2: Add the matrix case**

In `backend/tests/test_student_intent_matrix.py`, add:

```python
(
    "有个像 institute 的词",
    "shape_neighbor_search",
    "shape_neighbors",
    {},
),
```

- [x] **Step 3: Run tests and verify RED**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_normalize_query.py backend/tests/test_student_intent_matrix.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: fail because the plain `有个像 X 的词` wording currently becomes `fuzzy_recall` / `standard_lookup`.

- [x] **Step 4: Extend shape-neighbor cue recognition narrowly**

In `backend/app/retrieval/normalize_query.py`, extend shape cue handling to include plain "像" only when the wording is clearly asking for a word candidate:

```python
plain_like_word_pattern = re.compile(
    r"(有个|找|找一下|帮我找|哪些|什么|哪几个).{0,8}(像|相似|类似).{0,12}(词|单词)",
    re.IGNORECASE,
)
```

Update `contains_shape_neighbor_cue()`:

```python
if plain_like_word_pattern.search(normalized_text) is not None:
    return True
```

Keep direct compare before shape-neighbor routing, so `desert和dessert怎么区分` remains `direct_compare`.

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_normalize_query.py backend/tests/test_student_intent_matrix.py backend/tests/test_advanced_lookup.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: pass; existing root-family examples such as `跟 institute 一样那几个词怎么记` should keep their current route.

- [x] **Step 6: Commit**

```powershell
git add backend/app/retrieval/normalize_query.py backend/tests/test_normalize_query.py backend/tests/test_student_intent_matrix.py
git commit -m "Route plain similar-word wording to shape neighbors"
```

- [x] **Step 7: Update this plan and `progress.md`**

Mark Task 2 completed and record the focused test result.

---

### Task 3: Add Focused DB-Unavailable Smoke

**Files:**
- Create: `scripts/lib/fastapi-db-unavailable-smoke.ts`
- Create: `scripts/lib/fastapi-db-unavailable-smoke.test.ts`
- Create: `scripts/run-fastapi-db-unavailable-smoke.ts`
- Modify: `package.json`
- Modify: `progress.md`

- [ ] **Step 1: Create the focused smoke matrix**

Create `scripts/lib/fastapi-db-unavailable-smoke.ts` with cases that are expected to work when FastAPI is pointed at an unreachable DB:

```typescript
export function buildFastApiDbUnavailableSmokeCases() {
  return [
    {
      name: "ordinary ecdict substitute meaning",
      query: "substitute 是什么意思",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedMatchType: "external_dictionary_exact",
      expectedGroundingIncludes: ["substitute"],
      expectedProviderRequest: "absent",
    },
    {
      name: "ordinary ecdict substitute usage wording",
      query: "substitute 怎么用",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedMatchType: "external_dictionary_exact",
      expectedGroundingIncludes: ["substitute"],
      expectedProviderRequest: "absent",
    },
    {
      name: "direct compare ecdict fallback",
      query: "restrain和constrain的区别",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerStyle: "confusion_untangle",
      expectedGroundingIncludes: ["restrain", "constrain"],
      expectedProviderRequest: "absent",
    },
    {
      name: "broad fragment ecdict fallback",
      query: "re开头cile结尾的单词",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedLearningIntentTask: "form_filter",
      expectedGroundingIncludes: ["reconcile"],
      expectedProviderRequest: "absent",
    },
    {
      name: "plain similar-word wording routes broad",
      query: "有个像 institute 的词",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedLearningIntentTask: "shape_neighbors",
      expectedProviderRequest: "absent",
    },
  ];
}
```

Reuse the observation/evaluation shape from `scripts/lib/fastapi-migrated-slice-smoke.ts` instead of inventing a second assertion style.

- [ ] **Step 2: Add unit tests for the smoke definitions**

Create `scripts/lib/fastapi-db-unavailable-smoke.test.ts` and assert:

- all five cases are present,
- every case expects `200`,
- every case fails on `answer` containing `当前回答服务暂时不可用`,
- provider request is absent unless a future case explicitly requires it.

- [ ] **Step 3: Add a runner and package script**

Create `scripts/run-fastapi-db-unavailable-smoke.ts` as a small wrapper around the shared evaluator. It should accept:

```text
--base-url http://127.0.0.1:8015
--label fastapi-no-db
```

Add to `package.json`:

```json
"eval:fastapi:db-unavailable-smoke": "tsx scripts/run-fastapi-db-unavailable-smoke.ts"
```

- [ ] **Step 4: Run runner tests**

Run:

```powershell
corepack pnpm test scripts/lib/fastapi-db-unavailable-smoke.test.ts scripts/lib/fastapi-migrated-slice-smoke.test.ts
```

Expected: pass.

- [ ] **Step 5: Run focused backend suite**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_repository.py backend/tests/test_ecdict.py backend/tests/test_normalize_query.py backend/tests/test_ordinary_lookup_answer.py backend/tests/test_direct_compare_answer.py backend/tests/test_advanced_lookup.py backend/tests/test_broad_vocab_answer.py backend/tests/test_dynamic_light_grounding.py backend/tests/test_chat_contract.py backend/tests/test_student_intent_matrix.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: pass.

- [ ] **Step 6: Run live no-DB FastAPI smoke**

Start a temporary FastAPI process with an unreachable DB URL. Use a port that is free at runtime:

```powershell
$env:DATABASE_URL = 'postgresql://user:pass@127.0.0.1:59999/enggo?connect_timeout=0'
$env:ENGGO_ECDICT_PATH = 'C:\Users\Chen\Desktop\EngGo\output\external-dictionaries\ecdict.csv'
C:\Users\Chen\anaconda3\python.exe -m uvicorn backend.app.main:create_app --factory --host 127.0.0.1 --port 8015
```

In another shell, run:

```powershell
corepack pnpm eval:fastapi:db-unavailable-smoke -- --base-url http://127.0.0.1:8015 --label fastapi-no-db
```

Expected: all no-DB smoke cases pass. Stop the temporary FastAPI process after the smoke finishes.

- [ ] **Step 7: Commit**

```powershell
git add scripts/lib/fastapi-db-unavailable-smoke.ts scripts/lib/fastapi-db-unavailable-smoke.test.ts scripts/run-fastapi-db-unavailable-smoke.ts package.json
git commit -m "Add FastAPI DB-unavailable smoke coverage"
```

- [ ] **Step 8: Update this plan and `progress.md`**

Record the focused backend suite and live no-DB smoke result.

---

### Task 4: Docs And Handoff

**Files:**
- Modify: `docs/README.md`
- Modify: `progress.md`
- Modify: `bugs.md`
- Modify: `docs/superpowers/plans/2026-05-18-ecdict-backbone-db-fallback-and-shape-intent.md`

- [ ] **Step 1: Mark plan checkboxes as work lands**

After each task passes verification, change completed `- [ ]` boxes to `- [x]`. Do not batch all checkbox updates at the end.

- [ ] **Step 2: Update `bugs.md`**

Move `2026-05-18 ordinary lookup 未处理 DB 不可用导致 500` from pending to fixed only after Task 3 live no-DB smoke passes. Keep the warning that only `StructuredLookupUnavailable` should be caught.

- [ ] **Step 3: Re-audit `progress.md`**

Rewrite the top section so the next session sees only:

- current ECDICT-backbone design conclusion,
- completed Task status and exact verification results,
- remaining unchecked task, if any,
- next recommended step.

- [ ] **Step 4: Update docs index**

In `docs/README.md`, move this plan from active to completed only after all tasks and smoke checks pass.

- [ ] **Step 5: Run doc sanity checks**

Run:

```powershell
git diff --check
git status --short --branch
```

Expected: `git diff --check` exits 0, ignoring CRLF warnings if present.

- [ ] **Step 6: Commit**

```powershell
git add docs/README.md progress.md bugs.md docs/superpowers/plans/2026-05-18-ecdict-backbone-db-fallback-and-shape-intent.md
git commit -m "Document ECDICT backbone DB fallback plan progress"
```

---

## Guardrails For Implementers

- Do not revive old `confusion_group` as an admission gate for broad answers.
- Do not add a broad catch-all around repository calls. A real SQL bug should still fail loudly.
- Do not let `substitute 怎么用` become free provider prose before the basic ECDICT identity is grounded.
- Do not make plain `像` a universal shape cue. It should require word-candidate wording such as `有个像 X 的词`.
- Do not regress existing good examples:
  - `mitigate 是什么意思`
  - `make up 是什么意思`
  - `according to 是什么意思`
  - `restrain 和 constrain 的区别`
  - `re开头cile结尾的单词`
  - `跟 institute 一样那几个词怎么记`
  - `institute 是什么意思`

## Suggested Commit Shape

1. `Handle ordinary lookup when structured DB is unavailable`
2. `Route plain similar-word wording to shape neighbors`
3. `Add FastAPI DB-unavailable smoke coverage`
4. `Document ECDICT backbone DB fallback plan progress`
