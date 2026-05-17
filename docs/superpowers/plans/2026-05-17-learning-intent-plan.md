# Learning Intent Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a learning-intent planning layer so EngGo routes broad student questions by task, constraints, and desired teaching shape instead of letting each backend branch reinterpret the raw query.

**Architecture:** Keep the current top-level `query_mode` split, but add a structured `LearningIntentPlan` between normalization and candidate grounding. The plan records the learner task, hard constraints, expansion policy, and output style; `AdvancedLookupService`, `dynamic_light_grounding`, and `broad_vocab` then consume that plan instead of re-parsing the same sentence independently.

**Tech Stack:** Python 3.12, FastAPI backend services, pytest, existing `NormalizedQuery`, `RetrievalCandidate`, `LightGroundingCandidate`, ECDICT lookup/search, and broad-vocab answer planner.

---

## Product Contract

This plan is about the middle layer, not a new vocabulary source.

- Top-level routing remains useful: ordinary lookup, direct compare, shape neighbor, root/fragment, meaning lookup, no-match.
- The missing layer is a learner-facing intent plan: "what task is the student asking for", "which constraints are hard", and "what kind of answer would feel like a teacher".
- Explicit word-form constraints are hard filters. `re开头cile结尾的单词` must not degrade into a `re*` list.
- Meaning constraints are also real constraints. `co开头的意思是合作的单词` must not degrade into a `co*` list.
- Compare requests stay focused. `access assess excess 怎么区分` must not add nearby words unless the user asks.
- Shape-neighbor and word-family requests may expand, but expansions must be labeled as grounded candidates or learning associations, not as confirmed same-root facts.
- Ordinary exact lookup remains deterministic and clean.

## File Structure

- Create: `backend/app/retrieval/learning_intent.py`
  - Owns `LearningIntentPlan`, constraint dataclasses, output-style enums, and `build_learning_intent_plan()`.
- Modify: `backend/app/retrieval/normalize_query.py`
  - Attaches the plan to `NormalizedQuery` and exposes it in `to_json()`.
- Modify: `backend/app/retrieval/dynamic_light_grounding.py`
  - Accepts an optional intent plan and uses it for hard filtering, semantic filtering, and signal generation.
- Modify: `backend/app/answering/advanced_lookup.py`
  - Uses intent plan policy for broad candidate sources, minimum candidate count, and fallback behavior.
- Modify: `backend/app/answering/broad_vocab.py`
  - Uses intent plan output style to build `broadAnswerPlan`, `candidateSections`, and deterministic fallback answers.
- Modify: `backend/app/answering/direct_compare.py`
  - Preserves focused compare behavior and passes the intent plan into any broad fallback.
- Create: `backend/tests/test_learning_intent.py`
  - Unit tests for intent parsing and policy decisions.
- Modify: `backend/tests/test_normalize_query.py`
  - Ensures existing query modes remain stable while plan metadata is added.
- Modify: `backend/tests/test_dynamic_light_grounding.py`
  - Verifies plan-aware hard filtering and semantic filtering.
- Modify: `backend/tests/test_advanced_lookup.py`
  - Service-level tests for real user examples.
- Modify: `backend/tests/test_broad_vocab_answer.py`
  - Output-plan and candidate-section tests.
- Modify: `docs/README.md`
  - Adds this plan to the active work list.
- Modify: `progress.md`
  - Records that the current next step is this learning-intent layer.

---

### Task 1: Add Learning Intent Plan Types

**Files:**
- Create: `backend/app/retrieval/learning_intent.py`
- Create: `backend/tests/test_learning_intent.py`

- [x] **Step 1: Write failing tests for core intent plans**

Add tests like:

```python
from backend.app.retrieval.learning_intent import build_learning_intent_plan
from backend.app.retrieval.normalize_query import normalize_query


def plan_for(query: str):
    normalized = normalize_query(query)
    return build_learning_intent_plan(normalized)


def test_form_filter_keeps_prefix_and_suffix_as_hard_constraints():
    plan = plan_for("re开头cile结尾的单词")

    assert plan.task == "form_filter"
    assert plan.output_style == "strict_inventory"
    assert plan.allow_expansion is False
    assert plan.minimum_answerable_candidates == 1
    assert plan.constraints == [
        {"type": "prefix", "value": "re", "hard": True},
        {"type": "suffix", "value": "cile", "hard": True},
    ]


def test_prefix_meaning_query_is_semantic_filter_not_prefix_inventory():
    plan = plan_for("co开头的意思是合作的单词")

    assert plan.task == "semantic_filter"
    assert plan.output_style == "teacher_table"
    assert plan.allow_expansion is False
    assert {"type": "prefix", "value": "co", "hard": True} in plan.constraints
    assert {"type": "meaning", "value": "合作", "hard": True} in plan.constraints


def test_word_family_request_allows_grounded_derivative_expansion():
    plan = plan_for("respect派生词")

    assert plan.task == "word_family"
    assert plan.seed_terms == ["respect"]
    assert plan.output_style == "teacher_table"
    assert plan.allow_expansion is True
    assert "derivative_family" in plan.allowed_expansion_kinds
```

- [x] **Step 2: Run the tests and verify RED**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_learning_intent.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: fail because `backend.app.retrieval.learning_intent` does not exist.

- [x] **Step 3: Add minimal dataclasses and builder**

Implement:

```python
from dataclasses import dataclass, field
from typing import Literal

LearningTask = Literal[
    "standard_lookup",
    "focused_compare",
    "shape_neighbors",
    "word_family",
    "form_filter",
    "semantic_filter",
    "meaning_core",
    "unknown",
]

OutputStyle = Literal[
    "compact_lookup",
    "focused_compare",
    "strict_inventory",
    "teacher_table",
    "meaning_boundary",
    "conservative_no_match",
]


@dataclass(frozen=True)
class IntentConstraint:
    type: str
    value: str
    hard: bool = True

    def to_json(self) -> dict[str, object]:
        return {"type": self.type, "value": self.value, "hard": self.hard}


@dataclass(frozen=True)
class LearningIntentPlan:
    task: LearningTask
    seed_terms: list[str] = field(default_factory=list)
    constraints: list[IntentConstraint] = field(default_factory=list)
    output_style: OutputStyle = "teacher_table"
    allow_expansion: bool = False
    allowed_expansion_kinds: list[str] = field(default_factory=list)
    require_hard_filter: bool = True
    minimum_answerable_candidates: int = 2

    def to_json(self) -> dict[str, object]:
        return {
            "task": self.task,
            "seedTerms": self.seed_terms,
            "constraints": [constraint.to_json() for constraint in self.constraints],
            "outputStyle": self.output_style,
            "allowExpansion": self.allow_expansion,
            "allowedExpansionKinds": self.allowed_expansion_kinds,
            "requireHardFilter": self.require_hard_filter,
            "minimumAnswerableCandidates": self.minimum_answerable_candidates,
        }
```

Add `build_learning_intent_plan(normalized_query)` with narrow rules only. Reuse existing parser helpers where possible; do not move code yet.

- [x] **Step 4: Run the tests and verify GREEN**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_learning_intent.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: pass.

- [x] **Step 5: Commit**

```powershell
git add backend/app/retrieval/learning_intent.py backend/tests/test_learning_intent.py
git commit -m "Add learning intent plan model"
```

---

### Task 2: Attach Intent Plan To NormalizedQuery

**Files:**
- Modify: `backend/app/retrieval/normalize_query.py`
- Modify: `backend/tests/test_normalize_query.py`
- Modify: `backend/tests/test_learning_intent.py`

- [x] **Step 1: Write failing normalization tests**

Add tests that prove query mode stays stable while `intent_plan` carries the richer policy:

```python
def test_shape_neighbor_query_has_teacher_intent_plan():
    result = normalize_query("跟evacuate很像的单词有哪些")

    assert result.query_mode == "shape_neighbor_search"
    assert result.intent_plan.task == "shape_neighbors"
    assert result.intent_plan.output_style == "teacher_table"
    assert result.intent_plan.allow_expansion is True


def test_direct_compare_query_has_focused_intent_plan():
    result = normalize_query("access assess excess 怎么区分")

    assert result.query_mode == "direct_compare"
    assert result.intent_plan.task == "focused_compare"
    assert result.intent_plan.allow_expansion is False
    assert result.intent_plan.output_style == "focused_compare"
```

- [x] **Step 2: Run the tests and verify RED**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_normalize_query.py backend/tests/test_learning_intent.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: fail because `NormalizedQuery` has no `intent_plan`.

- [x] **Step 3: Add `intent_plan` to `NormalizedQuery`**

Modify the dataclass:

```python
@dataclass(frozen=True)
class NormalizedQuery:
    raw: str
    normalized_text: str
    query_mode: QueryMode
    english_terms: list[str]
    meaning_hint: str
    compare_terms: list[str]
    group_seed_term: str | None
    is_supported_ordinary_lookup: bool
    intent_plan: LearningIntentPlan | None = None
```

In `normalize_query()`, build the basic `NormalizedQuery` first, then attach a plan using `dataclasses.replace()` to avoid circular builder awkwardness:

```python
query = NormalizedQuery(...)
return replace(query, intent_plan=build_learning_intent_plan(query))
```

Expose it in `to_json()` as `learningIntentPlan`.

- [x] **Step 4: Verify broad query-mode regressions stay unchanged**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_normalize_query.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: pass.

- [x] **Step 5: Commit**

```powershell
git add backend/app/retrieval/normalize_query.py backend/tests/test_normalize_query.py backend/tests/test_learning_intent.py
git commit -m "Attach learning intent to normalized queries"
```

---

### Task 3: Make Dynamic Grounding Consume The Plan

**Files:**
- Modify: `backend/app/retrieval/dynamic_light_grounding.py`
- Modify: `backend/tests/test_dynamic_light_grounding.py`

- [x] **Step 1: Write failing tests for hard constraints**

Add tests for plan-aware filtering:

```python
def test_intent_plan_hard_filters_prefix_suffix_candidates():
    vocabulary = [
        candidate("reconcile", ["使和解"], part_of_speech="vt.", source_kind="external_dictionary_basic"),
        candidate("recite", ["背诵"], part_of_speech="v.", source_kind="external_dictionary_basic"),
        candidate("reptile", ["爬行动物"], part_of_speech="n.", source_kind="external_dictionary_basic"),
        candidate("facile", ["容易的"], part_of_speech="adj.", source_kind="external_dictionary_basic"),
    ]
    plan = normalize_query("re开头cile结尾的单词").intent_plan

    result = build_light_grounding_candidates(
        query="re开头cile结尾的单词",
        active_exam_target="postgrad",
        vocabulary=vocabulary,
        groups=[],
        intent_plan=plan,
    )

    assert [item.lemma for item in result] == ["reconcile"]
```

Add a second test proving `co开头的意思是合作的单词` keeps `cooperate/cooperative` and suppresses `coach/coal`.

- [x] **Step 2: Run the tests and verify RED**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_dynamic_light_grounding.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: fail because `build_light_grounding_candidates()` does not accept `intent_plan`.

- [x] **Step 3: Add intent-aware hard filtering**

Add a small pre-filter:

```python
def matches_intent_constraints(candidate: RetrievalCandidate, plan: LearningIntentPlan | None) -> bool:
    if plan is None or not plan.require_hard_filter:
        return True

    lemma = candidate.lemma.lower()
    for constraint in plan.constraints:
        if not constraint.hard:
            continue
        if constraint.type == "prefix" and not lemma.startswith(constraint.value):
            return False
        if constraint.type == "suffix" and not lemma.endswith(constraint.value):
            return False
        if constraint.type == "contains" and constraint.value not in lemma:
            return False
        if constraint.type == "meaning" and not any(
            meaning_matches_keyword(meaning, constraint.value, primary_only=True)
            for meaning in candidate.meanings_zh
        ):
            return False
    return True
```

Call it before `score_candidate()`.

- [x] **Step 4: Add plan-derived signals**

When a candidate survives a hard prefix/suffix/meaning constraint, make sure corresponding `prefix`, `suffix`, or `meaning_keyword` signals are present. This keeps the UI and ranking explainable even when the old raw-query regex would not have caught the wording.

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_dynamic_light_grounding.py backend/tests/test_learning_intent.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: pass.

- [x] **Step 6: Commit**

```powershell
git add backend/app/retrieval/dynamic_light_grounding.py backend/tests/test_dynamic_light_grounding.py backend/tests/test_learning_intent.py
git commit -m "Use learning intent for dynamic grounding"
```

---

### Task 4: Wire Intent Policy Into Advanced Lookup

**Files:**
- Modify: `backend/app/answering/advanced_lookup.py`
- Modify: `backend/app/answering/direct_compare.py`
- Modify: `backend/tests/test_advanced_lookup.py`
- Modify: `backend/tests/test_direct_compare_answer.py`

- [x] **Step 1: Write failing service tests**

Add service-level tests:

```python
def test_prefix_suffix_intent_allows_single_strict_match():
    result = service.answer(
        active_exam_target="postgrad",
        query="re开头cile结尾的单词",
        request_id="req_re_cile",
    )

    assert result.status_code == 200
    assert [item["lemma"] for item in result.payload.grounding["mainAnswer"]] == ["reconcile"]
    assert result.payload.grounding["learningIntentPlan"]["minimumAnswerableCandidates"] == 1


def test_direct_compare_intent_does_not_expand_to_related_words():
    result = service.answer(
        active_exam_target="cet6",
        query="access assess excess 怎么区分",
        request_id="req_access_assess_excess",
    )

    assert result.status_code == 200
    assert result.payload.grounding["learningIntentPlan"]["task"] == "focused_compare"
    assert [item["lemma"] for item in result.payload.grounding["mainAnswer"]] == [
        "access",
        "assess",
        "excess",
    ]
```

- [x] **Step 2: Run the tests and verify RED**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_advanced_lookup.py backend/tests/test_direct_compare_answer.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: fail because grounding does not expose or consistently use `learningIntentPlan`.

- [x] **Step 3: Pass `intent_plan` to dynamic grounding**

In `AdvancedLookupService.answer_broad_vocab_if_possible()`, pass:

```python
candidates = build_light_grounding_candidates(
    query=query,
    active_exam_target=active_exam_target,
    vocabulary=vocabulary,
    groups=[],
    intent_plan=normalized_query.intent_plan,
)
```

Use `normalized_query.intent_plan.minimum_answerable_candidates` instead of ad hoc `len(candidates) < 2` when a plan is present.

- [x] **Step 4: Include the plan in grounding**

Add `learningIntentPlan` to broad grounding payloads and any direct-compare fallback grounding. Do not change ordinary lookup grounding in this task.

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_advanced_lookup.py backend/tests/test_direct_compare_answer.py backend/tests/test_dynamic_light_grounding.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: pass.

- [x] **Step 6: Commit**

```powershell
git add backend/app/answering/advanced_lookup.py backend/app/answering/direct_compare.py backend/tests/test_advanced_lookup.py backend/tests/test_direct_compare_answer.py
git commit -m "Wire learning intent into broad lookup"
```

---

### Task 5: Add Teacher-Shaped Broad Answer Planning

**Files:**
- Modify: `backend/app/answering/broad_vocab.py`
- Modify: `backend/tests/test_broad_vocab_answer.py`

- [x] **Step 1: Write failing answer-plan tests**

Add tests for output shape:

```python
def test_word_family_intent_uses_teacher_table_sections():
    normalized = normalize_query("respect派生词")
    candidates = [
        light_candidate("respect", ["尊重；方面"], part_of_speech="n. / v."),
        light_candidate("respectful", ["恭敬的；有礼貌的"], part_of_speech="adj."),
        light_candidate("respectable", ["体面的；值得尊敬的"], part_of_speech="adj."),
        light_candidate("respective", ["各自的；分别的"], part_of_speech="adj."),
    ]

    plan = build_broad_answer_plan(normalized_query=normalized, candidates=candidates)

    assert plan["style"] == "teacher_table"
    assert plan["presentation"] == "word_family_table"
    assert plan["candidateSections"][0]["role"] == "core_family_terms"


def test_strict_inventory_intent_does_not_add_teacher_notes():
    normalized = normalize_query("re开头cile结尾的单词")
    candidates = [light_candidate("reconcile", ["使和解"], part_of_speech="vt.")]

    answer = build_broad_vocab_answer(candidates, normalized)

    assert "reconcile" in answer
    assert "注意" not in answer
```

- [x] **Step 2: Run the tests and verify RED**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_broad_vocab_answer.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: fail because broad-vocab style is still derived mostly from `query_mode`.

- [x] **Step 3: Make `broad_answer_style()` consume intent plan**

Rules:

- `standard_lookup` -> not handled here.
- `focused_compare` -> `focused_compare`.
- `form_filter` -> `strict_inventory`.
- `semantic_filter` -> `teacher_table` when there is a meaning constraint, otherwise `strict_inventory`.
- `shape_neighbors` -> `teacher_table`.
- `word_family` -> `teacher_table`.
- `meaning_core` -> `meaning_core`.

- [x] **Step 4: Add candidate section roles**

Add section roles for teacher-style answers:

- `exact_user_terms`
- `core_shape_neighbors`
- `core_family_terms`
- `semantic_matches`
- `grounded_learning_associations`
- `candidate_only_no_reviewed_meaning`

Keep all sections derived from candidates; do not invent terms in `broad_vocab.py`.

- [x] **Step 5: Keep deterministic fallback concise**

For provider-disabled broad answers, keep deterministic lines professional:

```text
respect n. / v. 尊重；方面
respectful adj. 恭敬的；有礼貌的
respectable adj. 体面的；值得尊敬的
respective adj. 各自的；分别的

注意：先区分 respectful / respectable / respective。
```

Only add the `注意` line when the plan output style is `teacher_table`, not for `strict_inventory`.

- [x] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_broad_vocab_answer.py backend/tests/test_advanced_lookup.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: pass.

- [x] **Step 7: Commit**

```powershell
git add backend/app/answering/broad_vocab.py backend/tests/test_broad_vocab_answer.py
git commit -m "Shape broad answers from learning intent"
```

---

### Task 6: Add ECDICT Word-Family Candidate Expansion

**Files:**
- Modify: `backend/app/answering/advanced_lookup.py`
- Modify: `backend/tests/test_advanced_lookup.py`

- [x] **Step 1: Write failing ECDICT word-family tests**

Add a fake ECDICT searchable lookup with:

- `respect`
- `respectful`
- `respectable`
- `respective`
- `respectively`
- `irrespective`
- `self-respect`
- noise terms that should not enter the main answer

Test:

```python
def test_postgrad_word_family_intent_uses_ecdict_tagged_derivatives():
    result = service.answer(
        active_exam_target="postgrad",
        query="respect派生词",
        request_id="req_respect_family",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert grounding["learningIntentPlan"]["task"] == "word_family"
    assert grounding["broadAnswerPlan"]["presentation"] == "word_family_table"
    assert [item["lemma"] for item in grounding["mainAnswer"]][:4] == [
        "respect",
        "respectful",
        "respectable",
        "respective",
    ]
```

- [x] **Step 2: Run the test and verify RED**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_advanced_lookup.py::test_postgrad_word_family_intent_uses_ecdict_tagged_derivatives -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: fail because there is no word-family ECDICT expansion path.

- [x] **Step 3: Add `ecdict_word_family_vocabulary()`**

In `AdvancedLookupService`, add a narrow helper:

- Only runs for `intent_plan.task == "word_family"`.
- Requires exactly one seed term.
- Requires ECDICT profiles to be tagged for the active exam target when possible.
- Matches:
  - exact seed
  - seed plus common derivative suffixes: `ful`, `less`, `able`, `ible`, `ive`, `ively`, `ion`, `ation`, `ity`, `ability`, `ment`, `ness`
  - common negative or reflexive prefixes when ECDICT has exact profile: `ir`, `in`, `im`, `un`, `self-`
- Does not claim etymology; it only returns candidates with a `word_family_candidate` signal.

- [x] **Step 4: Merge word-family ECDICT candidates before dynamic scoring**

In `answer_broad_vocab_if_possible()`, merge the helper output into `vocabulary` when the plan task is `word_family`.

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_advanced_lookup.py backend/tests/test_broad_vocab_answer.py backend/tests/test_dynamic_light_grounding.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: pass.

- [x] **Step 6: Commit**

```powershell
git add backend/app/answering/advanced_lookup.py backend/tests/test_advanced_lookup.py
git commit -m "Add ECDICT word family expansion"
```

---

### Task 7: Add Product Smoke Matrix For Learning Intent

**Files:**
- Modify: `scripts/lib/fastapi-migrated-slice-smoke.ts` or create a focused Python/TS smoke helper if the current smoke file is too ordinary-lookup-specific.
- Modify: `scripts/run-fastapi-migrated-slice-smoke.ts` only if needed.
- Modify: `package.json` only if a new script is created.
- Modify: `backend/tests/test_chat_contract.py` if response contract assertions need coverage.

- [x] **Step 1: Add smoke cases**

Add cases for:

```text
re开头cile结尾的单词
co开头的意思是合作的单词
respect派生词
跟evacuate很像的单词有哪些
access assess excess 怎么区分
access 是什么意思
```

Expected:

- `re开头cile结尾的单词` -> only `reconcile`, `providerRequestId=null`, task `form_filter`.
- `co开头的意思是合作的单词` -> `collaborate/cooperate/cooperative`, task `semantic_filter`.
- `respect派生词` -> ECDICT tagged family candidates, task `word_family`.
- `跟evacuate很像的单词有哪些` -> task `shape_neighbors`, teacher table sections.
- `access assess excess 怎么区分` -> task `focused_compare`, no unrelated words.
- `access 是什么意思` -> ordinary lookup path, no `broad_vocab`.

- [x] **Step 2: Run smoke and verify failures before implementation is complete**

Run the focused smoke command selected in this task.

Expected during task creation: new cases fail until previous tasks are complete.

- [x] **Step 3: Run full focused backend suite**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_ecdict.py backend/tests/test_normalize_query.py backend/tests/test_ordinary_lookup_answer.py backend/tests/test_direct_compare_answer.py backend/tests/test_advanced_lookup.py backend/tests/test_broad_vocab_answer.py backend/tests/test_dynamic_light_grounding.py backend/tests/test_chat_contract.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: pass.

- [x] **Step 4: Run live HTTP verification through Next proxy**

With `corepack pnpm dev:fastapi` running, verify:

```powershell
# Use Invoke-RestMethod to POST each smoke query to http://127.0.0.1:3000/api/chat.
```

Expected: response summaries match the smoke matrix.

- [x] **Step 5: Commit**

```powershell
git add scripts package.json backend/tests
git commit -m "Add learning intent smoke coverage"
```

---

### Task 8: Update Handoff Docs

**Files:**
- Modify: `docs/README.md`
- Modify: `progress.md`
- Optionally modify: `bugs.md` only if implementation discovers a confirmed environment or product pitfall.

- [x] **Step 1: Mark completed plan tasks**

As each task lands, change its checkbox from `- [ ]` to `- [x]`. Do not batch all checkboxes at the end.

- [x] **Step 2: Update docs index**

Move this plan from active to completed only after all tasks and smoke checks pass.

- [x] **Step 3: Re-audit `progress.md`**

Rewrite the current top section so the next session sees:

- current product direction
- what the learning-intent layer now owns
- exact verification commands and latest results
- remaining next step

Remove stale task bullets that are no longer needed.

- [x] **Step 4: Run doc sanity checks**

Run:

```powershell
git diff --check
git status --short --branch
```

Expected: `git diff --check` exits 0, ignoring CRLF warnings.

- [x] **Step 5: Commit**

```powershell
git add docs/README.md progress.md bugs.md docs/superpowers/plans/2026-05-17-learning-intent-plan.md
git commit -m "Document learning intent plan progress"
```

---

## Review Notes For Implementers

- Do not replace ordinary lookup.
- Do not route every broad query through provider prose before the grounding plan is stable.
- Do not let ECDICT become `structured`; keep `sourceKind="external_dictionary_basic"`.
- Do not claim same-root or etymology from word-shape candidates unless a curated source explicitly says so.
- Prefer deterministic candidate sections first; provider-style teacher prose can be reintroduced only after the plan and sections are trustworthy.
- Keep commits small. If Task 6 feels too large, split it into `word_family exact/suffix expansion` and `word_family answer shaping`.

## Suggested Execution Order

1. Task 1 and Task 2 first: they are pure planning/normalization and lowest risk.
2. Task 3 and Task 4 next: they stop the "right route, wrong sub-route" regressions.
3. Task 5 after grounding is stable: it improves answer maturity without changing candidate truth.
4. Task 6 last among behavior tasks: word-family expansion is useful but easiest to overreach.
5. Task 7 and Task 8 close the loop.
