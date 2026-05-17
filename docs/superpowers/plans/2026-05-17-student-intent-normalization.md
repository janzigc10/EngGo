# Student Intent Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn student-style wording variants into stable `LearningIntentPlan` tasks, so EngGo stops treating every new phrasing as a fresh routing bug.

**Architecture:** Keep the current deterministic routing stack and use a few-shot-style example matrix as tests, not as a runtime LLM prompt. First harden `normalize_query` and `learning_intent`, then make dynamic grounding understand OR-style semantic constraints, then tighten word-family candidate quality, and finally lock the behavior with live smoke.

**Tech Stack:** Python 3.12, FastAPI backend, pytest, existing `NormalizedQuery`, `LearningIntentPlan`, dynamic light grounding, ECDICT profile lookup, migrated smoke runner through Next `/api/chat`.

---

## Product Contract

This plan is about the student-language entrance layer.

- Do not add a runtime LLM intent classifier in this pass.
- Treat few-shot examples as a contract matrix: inputs must normalize to deterministic `task`, `constraints`, and `outputStyle`.
- Ordinary exact lookup remains deterministic and clean.
- Direct compare remains focused unless the user explicitly asks for similar/shape-neighbor expansion.
- Semantic + form questions must support natural student wording:
  - `con开头表示共同或一起的词`
  - `e开头表示评估评价的单词`
  - `pre开头表示提前或预先的单词`
  - `表示限制或约束的con开头单词`
- Shape-neighbor questions must support natural wording:
  - `desert dessert 还有没有相似的词`
  - `跟desert很像的词有哪些`
  - `receipt容易看错成什么`
- Word-family questions must support student study wording:
  - `sign这组词怎么背`
  - `produce的同根词或派生词`
  - `consider派生词`
- Candidate quality matters. A correct route is not enough if `sign派生词` includes `sigh/sight/scan/sick`, or `produce派生词` promotes `provide/propose/project` as main family terms.

## Known Current Failures

Use these as the initial red tests.

1. `con开头表示共同或一起的词`
   - Current normalize result has `task=semantic_filter`, but `meaning=共同或一起` is treated as one exact keyword.
   - Dynamic grounding requires a full substring match in `meanings_zh`, so all candidates are filtered out.

2. `e开头表示评估评价的单词`
   - Current prefix regex only accepts 2 to 8 letters, so `e开头` is not extracted as `prefix=e`.
   - It falls to `unknown` / no-match instead of `semantic_filter`.

3. `desert dessert 还有没有相似的词`
   - Current shape cue does not recognize bare `相似的词`.
   - It falls to ordinary `fuzzy_recall` instead of `shape_neighbors`.

4. `sign这组词怎么背`
   - Current query can be treated as ordinary lookup before word-family intent wins.
   - It returns only `sign`.

5. `sign的派生词有哪些`
   - It can route to `word_family`, but candidates include weak shape noise such as `sigh/sight/scan/sick`.

6. `produce的同根词或派生词`
   - It can route to `word_family`, but main answer includes loose `pro*` terms such as `project/promote/propose/provide`.

## File Structure

- Modify: `backend/app/retrieval/normalize_query.py`
  - Owns top-level query mode cues and student wording recognition.
- Modify: `backend/app/retrieval/learning_intent.py`
  - Owns `LearningIntentPlan`, form constraints, semantic constraints, task precedence, and JSON contract.
- Modify: `backend/app/retrieval/dynamic_light_grounding.py`
  - Owns candidate hard filtering, semantic OR matching, signal creation, and plan-aware candidate suppression.
- Modify: `backend/app/answering/advanced_lookup.py`
  - Owns broad lookup source selection and word-family ECDICT expansion.
- Modify: `backend/app/answering/broad_vocab.py`
  - Owns deterministic answer shape and candidate sections.
- Create: `backend/tests/test_student_intent_matrix.py`
  - Matrix-level tests for student wording variants and expected `LearningIntentPlan`.
- Modify: `backend/tests/test_learning_intent.py`
  - Unit tests for semantic alternatives and task precedence.
- Modify: `backend/tests/test_normalize_query.py`
  - Query-mode tests for shape/compare/family wording variants.
- Modify: `backend/tests/test_dynamic_light_grounding.py`
  - Tests for semantic OR matching and hard filters.
- Modify: `backend/tests/test_advanced_lookup.py`
  - Service-level tests for no-match regressions and word-family candidate quality.
- Modify: `backend/tests/test_broad_vocab_answer.py`
  - Output shape tests for family and shape answers.
- Modify: `scripts/lib/fastapi-migrated-slice-smoke.ts`
  - Add product smoke cases if it remains the right shared smoke file.
- Modify: `docs/README.md`
  - Register this as the active plan while implementation is ongoing.
- Modify: `progress.md`
  - Keep the top section aligned after each task.

---

### Task 1: Add Student Intent Matrix Red Tests

**Files:**
- Create: `backend/tests/test_student_intent_matrix.py`
- Modify: `backend/tests/test_learning_intent.py`
- Modify: `backend/tests/test_normalize_query.py`

- [x] **Step 1: Create a matrix of student wording variants**

Create `backend/tests/test_student_intent_matrix.py` with focused examples:

```python
import pytest

from backend.app.retrieval.normalize_query import normalize_query


@pytest.mark.parametrize(
    ("query", "query_mode", "task", "constraints"),
    [
        (
            "con开头表示共同或一起的词",
            "root_family_summary",
            "semantic_filter",
            {"prefix": "con", "meaning_any": {"共同", "一起", "合作", "联合", "连接"}},
        ),
        (
            "e开头表示评估评价的单词",
            "root_family_summary",
            "semantic_filter",
            {"prefix": "e", "meaning_any": {"评估", "评价", "估计"}},
        ),
        (
            "表示限制或约束的con开头单词",
            "root_family_summary",
            "semantic_filter",
            {"prefix": "con", "meaning_any": {"限制", "约束"}},
        ),
        (
            "desert dessert 还有没有相似的词",
            "shape_neighbor_search",
            "shape_neighbors",
            {},
        ),
        (
            "sign这组词怎么背",
            "root_family_summary",
            "word_family",
            {},
        ),
    ],
)
def test_student_wording_maps_to_learning_intent(query, query_mode, task, constraints):
    result = normalize_query(query)

    assert result.query_mode == query_mode
    assert result.intent_plan is not None
    assert result.intent_plan.task == task

    serialized = result.intent_plan.to_json()["constraints"]
    if "prefix" in constraints:
        assert {
            "type": "prefix",
            "value": constraints["prefix"],
            "hard": True,
        } in serialized

    if "meaning_any" in constraints:
        meaning_constraints = [
            item for item in serialized if item["type"] == "meaning"
        ]
        assert meaning_constraints
        actual = set(meaning_constraints[0].get("alternatives", []))
        assert constraints["meaning_any"] <= actual
```

If adding `alternatives` to `to_json()` feels too large, use a helper accessor on the dataclass. The final JSON should still expose enough information for smoke/debugging.

- [x] **Step 2: Add regression tests for existing working examples**

Add examples that must keep passing:

```python
@pytest.mark.parametrize(
    ("query", "task"),
    [
        ("co开头的意思是合作的单词", "semantic_filter"),
        ("re开头cile结尾的单词", "form_filter"),
        ("包含scribe的考研词", "form_filter"),
        ("adapt和adopt怎么区分", "focused_compare"),
        ("receipt的形近词有哪些", "shape_neighbors"),
        ("mitigate是什么意思", "standard_lookup"),
    ],
)
def test_existing_good_routes_stay_stable(query, task):
    result = normalize_query(query)

    assert result.intent_plan is not None
    assert result.intent_plan.task == task
```

- [x] **Step 3: Run the matrix and verify RED**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_student_intent_matrix.py backend/tests/test_learning_intent.py backend/tests/test_normalize_query.py -p no:cacheprovider
```

Expected: fail on the known current failures, especially one-letter prefix, `相似的词`, and `这组词怎么背`.

- [x] **Step 4: Commit only if this task contains tests and expected failures are documented**

Do not commit a permanently failing test suite unless the implementation is in the same commit. If following strict TDD in one commit is preferred, keep these test changes staged locally until Task 2 turns them green.

---

### Task 2: Normalize Student Wording Into Stable Tasks

**Files:**
- Modify: `backend/app/retrieval/normalize_query.py`
- Modify: `backend/app/retrieval/learning_intent.py`
- Modify: `backend/tests/test_student_intent_matrix.py`
- Modify: `backend/tests/test_learning_intent.py`
- Modify: `backend/tests/test_normalize_query.py`

- [x] **Step 1: Let explicit one-letter prefixes count only when there is a cue**

Change the prefix regex in `backend/app/retrieval/learning_intent.py` from `{2,8}` to `{1,8}` only for explicit `开头|词首|前缀` wording:

```python
prefix_pattern = re.compile(
    r"(?<![a-z])([a-z]{1,8})(?![a-z])\s*(?:开头|词首|前缀)",
    re.IGNORECASE,
)
```

Do not loosen plain English token extraction.

- [x] **Step 2: Recognize shape wording `相似的词`**

In `backend/app/retrieval/normalize_query.py`, extend `shape_neighbor_cue_pattern`:

```python
shape_neighbor_cue_pattern = re.compile(
    r"(很像|比较像|相像|相似|类似|形近|长得像|看错|看成|易混词?|容易.*混|拼写.{0,4}(像|近|相似))",
    re.IGNORECASE,
)
```

Then allow shape-neighbor route when there are multiple English terms and a shape/list cue:

```python
elif english_terms and contains_shape_neighbor_cue(normalized_text):
    query_mode = "shape_neighbor_search"
```

Place this after direct compare detection, so `desert和dessert怎么区分` still routes to `direct_compare`.

- [x] **Step 3: Make study wording route to word-family**

Extend family/root cues so these route to `root_family_summary` and `word_family`:

```text
这组词怎么背
这组词怎么记
那组词怎么背
老搞混这组词
```

Implementation option:

```python
word_family_pattern = re.compile(
    r"(派生词|派生|同根|这一族|一族|家族|词族|这组词|那组词|怎么背|怎么记)",
    re.IGNORECASE,
)
```

In `build_learning_intent_plan()`, evaluate explicit word-family intent before the ordinary lookup shortcut. This prevents `sign这组词怎么背` from becoming `standard_lookup`.

- [x] **Step 4: Run normalization tests and verify GREEN**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_student_intent_matrix.py backend/tests/test_learning_intent.py backend/tests/test_normalize_query.py -p no:cacheprovider
```

Expected: matrix passes without changing answer generation yet.

- [x] **Step 5: Commit**

```powershell
git add backend/app/retrieval/normalize_query.py backend/app/retrieval/learning_intent.py backend/tests/test_student_intent_matrix.py backend/tests/test_learning_intent.py backend/tests/test_normalize_query.py
git commit -m "Normalize student intent wording variants"
```

- [x] **Step 6: Update this plan checkbox and `progress.md`**

Mark Task 2 steps complete and add a short `progress.md` note with the tests run.

---

### Task 3: Add Semantic Alternatives For Meaning Constraints

**Files:**
- Modify: `backend/app/retrieval/learning_intent.py`
- Modify: `backend/app/retrieval/dynamic_light_grounding.py`
- Modify: `backend/tests/test_learning_intent.py`
- Modify: `backend/tests/test_dynamic_light_grounding.py`

- [x] **Step 1: Add failing tests for OR-style meaning constraints**

Add tests:

```python
def test_meaning_constraint_splits_or_words_into_alternatives():
    plan = normalize_query("con开头表示共同或一起的词").intent_plan

    meaning = next(item for item in plan.constraints if item.type == "meaning")
    assert set(meaning.alternatives) >= {"共同", "一起", "合作", "联合", "连接"}


def test_pre_meaning_does_not_match_pressure():
    vocabulary = [
        candidate("precede", ["先于；在...之前"]),
        candidate("prevent", ["预防；阻止"]),
        candidate("pressure", ["压力；施压"], part_of_speech="n. / v."),
    ]
    plan = normalize_query("pre开头表示提前或预先的单词").intent_plan

    result = build_light_grounding_candidates(
        query="pre开头表示提前或预先的单词",
        active_exam_target="cet6",
        vocabulary=vocabulary,
        groups=[],
        intent_plan=plan,
    )

    assert [item.lemma for item in result] == ["precede", "prevent"]
```

- [x] **Step 2: Extend `IntentConstraint`**

Add alternatives while keeping current fields backward compatible:

```python
@dataclass(frozen=True)
class IntentConstraint:
    type: str
    value: str
    hard: bool = True
    alternatives: list[str] = field(default_factory=list)

    def to_json(self) -> dict[str, object]:
        payload = {"type": self.type, "value": self.value, "hard": self.hard}
        if self.alternatives:
            payload["alternatives"] = self.alternatives
        return payload
```

- [x] **Step 3: Add a tiny semantic normalizer**

In `learning_intent.py`, add a conservative mapping. Keep it small and test-backed:

```python
semantic_aliases = {
    "共同": ["共同", "一起", "合作", "协作", "联合", "连接", "合并", "配合"],
    "一起": ["共同", "一起", "合作", "协作", "联合", "连接", "合并", "配合"],
    "合作": ["合作", "协作", "配合"],
    "评估": ["评估", "评价", "估计", "估算"],
    "评价": ["评估", "评价", "评论"],
    "限制": ["限制", "约束", "制约"],
    "约束": ["限制", "约束", "制约"],
    "提前": ["提前", "预先", "先于", "之前", "预期", "预防"],
    "预先": ["提前", "预先", "先于", "之前", "预期", "预防"],
}
```

Split raw Chinese meaning chunks on:

```text
或 / 或者 / 和 / 与 / 及 / 、 / ， / ,
```

Deduplicate alternatives in order.

- [x] **Step 4: Make dynamic grounding match meaning alternatives as OR**

In `matches_intent_constraints()`, replace exact single-value matching with:

```python
keywords = constraint.alternatives or [constraint.value]
if constraint.type == "meaning" and not any(
    meaning_matches_keyword(meaning, keyword, primary_only=True)
    for keyword in keywords
    for meaning in candidate.meanings_zh
):
    return False
```

Also make `add_plan_signals()` use the matched keyword as signal detail.

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_learning_intent.py backend/tests/test_dynamic_light_grounding.py backend/tests/test_student_intent_matrix.py -p no:cacheprovider
```

Expected: pass.

- [x] **Step 6: Commit**

```powershell
git add backend/app/retrieval/learning_intent.py backend/app/retrieval/dynamic_light_grounding.py backend/tests/test_learning_intent.py backend/tests/test_dynamic_light_grounding.py backend/tests/test_student_intent_matrix.py
git commit -m "Add semantic alternatives to intent constraints"
```

- [x] **Step 7: Update this plan checkbox and `progress.md`**

Record the semantic alternatives and focused test results.

---

### Task 4: Verify Service-Level Answers For Previously Empty Results

**Files:**
- Modify: `backend/tests/test_advanced_lookup.py`
- Modify: `backend/tests/test_broad_vocab_answer.py`
- Modify: `backend/app/answering/advanced_lookup.py` only if service routing still bypasses broad lookup.
- Modify: `backend/app/answering/broad_vocab.py` only if output shape regresses.

- [x] **Step 1: Add service tests for the three known no-result cases**

Add tests with fake vocabulary/ECDICT profiles as needed:

```python
def test_con_common_or_together_question_resolves_semantic_filter():
    result = service.answer(
        active_exam_target="postgrad",
        query="con开头表示共同或一起的词",
        request_id="req_con_common",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert grounding["learningIntentPlan"]["task"] == "semantic_filter"
    assert grounding["broadAnswerPlan"]["presentation"] == "semantic_filter_table"
    assert {item["lemma"] for item in grounding["mainAnswer"]} & {
        "connect",
        "combine",
        "concentrate",
        "cooperate",
    }
```

For `e开头表示评估评价的单词`, assert at least `evaluate` or `estimate` when present in the available fake source. Do not require a large list.

For `desert dessert 还有没有相似的词`, assert `shape_neighbors` and includes `desert` / `dessert`.

- [x] **Step 2: Run service tests and verify RED if Task 2/3 were insufficient**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_advanced_lookup.py backend/tests/test_broad_vocab_answer.py -p no:cacheprovider
```

Expected: pass if routing and grounding are now wired correctly; otherwise fail at the service boundary.

- [x] **Step 3: Fix only the service boundary if needed**

If tests fail because `AdvancedLookupService` still treats a query as ordinary lookup, use `intent_plan.task` as the stronger signal:

```python
if normalized_query.intent_plan and normalized_query.intent_plan.task in {
    "semantic_filter",
    "form_filter",
    "shape_neighbors",
    "word_family",
}:
    return self.answer_broad_vocab_if_possible(...)
```

Do not change ordinary exact lookup for `mitigate是什么意思` or phrase lookup.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_advanced_lookup.py backend/tests/test_broad_vocab_answer.py backend/tests/test_student_intent_matrix.py -p no:cacheprovider
```

Expected: pass.

- [x] **Step 5: Commit**

```powershell
git add backend/app/answering/advanced_lookup.py backend/app/answering/broad_vocab.py backend/tests/test_advanced_lookup.py backend/tests/test_broad_vocab_answer.py backend/tests/test_student_intent_matrix.py
git commit -m "Resolve student intent service regressions"
```

- [x] **Step 6: Update this plan checkbox and `progress.md`**

Record which no-result cases now resolve.

---

### Task 5: Tighten Word-Family Candidate Quality

**Files:**
- Modify: `backend/app/answering/advanced_lookup.py`
- Modify: `backend/app/retrieval/dynamic_light_grounding.py`
- Modify: `backend/app/answering/broad_vocab.py`
- Modify: `backend/tests/test_advanced_lookup.py`
- Modify: `backend/tests/test_broad_vocab_answer.py`

- [x] **Step 1: Add failing tests for noisy word-family results**

Add tests that encode the exact product pain:

```python
def test_sign_word_family_excludes_shape_noise():
    result = service.answer(
        active_exam_target="cet6",
        query="sign的派生词有哪些",
        request_id="req_sign_family",
    )

    lemmas = [item["lemma"] for item in result.payload.grounding["mainAnswer"]]

    assert "sign" in lemmas
    assert "signal" in lemmas
    assert "signify" in lemmas
    assert "sigh" not in lemmas
    assert "sight" not in lemmas
    assert "scan" not in lemmas
    assert "sick" not in lemmas


def test_produce_word_family_excludes_loose_pro_prefix_words():
    result = service.answer(
        active_exam_target="cet6",
        query="produce的同根词或派生词",
        request_id="req_produce_family",
    )

    lemmas = [item["lemma"] for item in result.payload.grounding["mainAnswer"]]

    assert "produce" in lemmas
    assert "product" in lemmas
    assert "productive" in lemmas
    assert "reproduce" in lemmas
    assert "provide" not in lemmas
    assert "propose" not in lemmas
    assert "project" not in lemmas
    assert "promote" not in lemmas
```

- [x] **Step 2: Add a conservative family evidence helper**

Create a small shared helper near the current dynamic grounding evidence code and reuse it from `advanced_lookup.py` for ECDICT word-family expansion:

```python
def word_family_evidence(seed: str, lemma: str) -> tuple[int, str | None]:
    normalized_seed = seed.lower()
    normalized_lemma = lemma.lower()

    if normalized_lemma == normalized_seed:
        return 100, "exact_seed"

    # Exact seed + common derivational suffix.
    suffixes = ("ful", "less", "ness", "able", "ible", "ive", "ively", "ion", "ation", "ity", "ment")
    if any(normalized_lemma == f"{normalized_seed}{suffix}" for suffix in suffixes):
        return 90, "seed_suffix_derivative"

    # Prefix + exact seed, e.g. irrespective/self-respect when available.
    prefixes = ("ir", "in", "im", "un", "self-", "re")
    if any(normalized_lemma == f"{prefix}{normalized_seed}" for prefix in prefixes):
        return 85, "prefix_seed_derivative"

    # Handful of transparent stem families from tested product examples.
    stem_aliases = {
        "sign": ("sign",),
        "produce": ("produc", "product"),
        "consider": ("consider",),
        "respect": ("respect",),
    }
    aliases = stem_aliases.get(normalized_seed, ())
    if aliases and any(normalized_lemma.startswith(alias) for alias in aliases):
        return 75, "tested_stem_family"

    return 0, None
```

This helper is deliberately conservative. Do not add broad `common_prefix` admission for word-family main answers.

- [x] **Step 3: Suppress weak candidates for `word_family`**

When `intent_plan.task == "word_family"`:

- Main answer candidates must have exact seed, `word_family_candidate`, or family evidence score above threshold.
- Shape-only signals such as `common_prefix`, `ngram_overlap`, or edit distance are not enough.
- Weak related candidates may be omitted entirely for now. Do not invent a weak-association section unless the user asks for wider exploration.

- [x] **Step 4: Keep answer language honest**

In `broad_vocab.py`, for `word_family_table`, keep the deterministic fallback as `word + POS + short meaning`. Do not add text claiming etymology unless a source explicitly supports it.

Acceptable:

```text
product n. 产品, 结果
productive adj. 多产的, 有生产价值的
```

Avoid:

```text
product 是 produce 的严格派生词
```

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_advanced_lookup.py backend/tests/test_broad_vocab_answer.py backend/tests/test_dynamic_light_grounding.py -p no:cacheprovider
```

Expected: pass, with noisy word-family candidates suppressed.

- [x] **Step 6: Commit**

```powershell
git add backend/app/answering/advanced_lookup.py backend/app/retrieval/dynamic_light_grounding.py backend/app/answering/broad_vocab.py backend/tests/test_advanced_lookup.py backend/tests/test_broad_vocab_answer.py
git commit -m "Tighten word family candidate quality"
```

- [x] **Step 7: Update this plan checkbox and `progress.md`**

Record before/after examples for `sign` and `produce`.

---

### Task 6: Add Product Smoke For Student Intent

**Files:**
- Modify: `backend/app/answering/advanced_lookup.py`
- Modify: `backend/app/answering/broad_vocab.py`
- Modify: `backend/app/content/ecdict.py`
- Modify: `backend/app/retrieval/dynamic_light_grounding.py`
- Modify: `backend/app/retrieval/learning_intent.py`
- Modify: `backend/app/retrieval/types.py`
- Modify: `backend/tests/test_advanced_lookup.py`
- Modify: `backend/tests/test_dynamic_light_grounding.py`
- Modify: `backend/tests/test_learning_intent.py`
- Modify: `scripts/lib/fastapi-migrated-slice-smoke.ts`
- Modify: `scripts/lib/fastapi-migrated-slice-smoke.test.ts`
- Modify: `scripts/run-fastapi-migrated-slice-smoke.ts`
- Modify: `progress.md`

- [x] **Step 1: Add a student-intent section to the smoke matrix**

Add cases:

```text
con开头表示共同或一起的词
e开头表示评估评价的单词
表示限制或约束的con开头单词
desert dessert 还有没有相似的词
sign这组词怎么背
sign的派生词有哪些
produce的同根词或派生词
pre开头表示提前或预先的单词
```

Expected assertions:

- No case should return `answer` containing `当前回答服务暂时不可用`.
- `providerRequestId` should be `null` for deterministic grounded cases whenever local grounding is sufficient.
- `learningIntentTask` should match expected task.
- `groundingLemmas` should include expected core terms.
- No smoke case should include known bad noise in main answer:
  - `pressure` for `pre开头表示提前或预先的单词`
  - `sigh/sight/scan/sick` for `sign的派生词有哪些`
  - `provide/propose/project/promote` for `produce的同根词或派生词`

- [x] **Step 2: Add unit tests for the smoke definitions**

Update `scripts/lib/fastapi-migrated-slice-smoke.test.ts` so the new expected fields are covered.

- [x] **Step 3: Run smoke definition tests**

Run:

```powershell
corepack pnpm test scripts/lib/fastapi-migrated-slice-smoke.test.ts
```

Expected: pass.

- [x] **Step 4: Run focused backend suite**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_ecdict.py backend/tests/test_normalize_query.py backend/tests/test_ordinary_lookup_answer.py backend/tests/test_direct_compare_answer.py backend/tests/test_advanced_lookup.py backend/tests/test_broad_vocab_answer.py backend/tests/test_dynamic_light_grounding.py backend/tests/test_chat_contract.py backend/tests/test_student_intent_matrix.py -p no:cacheprovider
```

Expected: pass.

- [x] **Step 5: Run live proxy smoke**

Make sure FastAPI and Next proxy are running. If the current dev stack is stale, restart with the approved local workflow from `bugs.md` / `progress.md`.

Run:

```powershell
corepack pnpm eval:fastapi:migrated-smoke:proxy
```

Expected: all student-intent cases pass through `http://127.0.0.1:3000/api/chat`.

- [x] **Step 6: Commit**

```powershell
git add backend/app/answering/advanced_lookup.py backend/app/answering/broad_vocab.py backend/app/content/ecdict.py backend/app/retrieval/dynamic_light_grounding.py backend/app/retrieval/learning_intent.py backend/app/retrieval/types.py backend/tests/test_advanced_lookup.py backend/tests/test_dynamic_light_grounding.py backend/tests/test_learning_intent.py scripts/lib/fastapi-migrated-slice-smoke.ts scripts/lib/fastapi-migrated-slice-smoke.test.ts scripts/run-fastapi-migrated-slice-smoke.ts docs/superpowers/plans/2026-05-17-student-intent-normalization.md progress.md
git commit -m "Add student intent smoke coverage"
```

- [x] **Step 7: Update this plan checkbox and `progress.md`**

Record direct test results and live proxy smoke result.

---

### Task 7: Docs And Handoff

**Files:**
- Modify: `docs/README.md`
- Modify: `progress.md`
- Modify: `docs/superpowers/plans/2026-05-17-student-intent-normalization.md`
- Optionally modify: `bugs.md` only for confirmed environment or product pitfalls discovered during implementation.

- [ ] **Step 1: Mark plan steps as completed as work lands**

Do not wait until the end. After each task commit, change completed `- [ ]` boxes to `- [x]`.

- [ ] **Step 2: Update `docs/README.md`**

Move this plan from active to completed only after all implementation and smoke pass.

- [ ] **Step 3: Re-audit and rewrite top of `progress.md`**

Keep only the next-session-relevant state:

- What student-intent normalization now covers.
- Which examples are now stable.
- Which candidate-quality risks remain, if any.
- Exact verification commands and results.
- Next suggested product step.

- [ ] **Step 4: Run doc sanity checks**

Run:

```powershell
git diff --check
git status --short --branch
```

Expected: `git diff --check` exits 0, ignoring CRLF warnings.

- [ ] **Step 5: Commit**

```powershell
git add docs/README.md progress.md docs/superpowers/plans/2026-05-17-student-intent-normalization.md bugs.md
git commit -m "Document student intent normalization progress"
```

---

## Guardrails For The Next Session

- Do not continue adding one-off regexes without first adding a matrix case.
- Do not make all semantic questions provider-driven. The goal is deterministic grounding first.
- Do not let `meaning` hard filters become exact full-string matching only; support tested OR alternatives.
- Do not over-claim word-family etymology from ECDICT. If the evidence is only shape similarity, omit it or label it outside main family terms.
- Do not regress ordinary lookup:
  - `mitigate是什么意思` should stay ordinary ECDICT exact.
  - `in terms of是什么意思` should stay phrase ECDICT exact.
  - `access 是什么意思` should not become broad vocab.
- Do not regress existing repaired examples:
  - `包含pire的单词`
  - `expire和inspire`
  - `sow和row`
  - `给我几个跟sow易混的单词`
  - `co开头的意思是合作的单词`
  - `re开头cile结尾的单词`
  - `slander的形近词有哪些`

## Suggested Commit Shape

1. `Normalize student intent wording variants`
2. `Add semantic alternatives to intent constraints`
3. `Resolve student intent service regressions`
4. `Tighten word family candidate quality`
5. `Add student intent smoke coverage`
6. `Document student intent normalization progress`
