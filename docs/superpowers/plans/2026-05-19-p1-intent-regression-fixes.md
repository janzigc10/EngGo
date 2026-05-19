# P1 Intent Regression Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three latest P1 student-intent regressions: Chinese expression recall, A/B lookalike collection recall, and English seed word-family expansion wording.

**Architecture:** Keep the current ECDICT-first + optional structured overlay direction. Fix routing and candidate grounding in the smallest backend layer that owns each behavior: `normalize_query` / `learning_intent` for intent classification, `advanced_lookup` and dynamic grounding for ECDICT candidates, and smoke matrices for product-level regression coverage.

**Tech Stack:** Python 3.12 FastAPI backend, pytest, existing ECDICT lookup/search, Vitest TypeScript smoke helpers, `corepack pnpm`.

---

## Shared Context

- Work from `C:\tmp\enggo-worktrees\p1-intent-regressions`.
- Protect the latest green baseline:
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_repository.py backend/tests/test_ecdict.py backend/tests/test_normalize_query.py backend/tests/test_ordinary_lookup_answer.py backend/tests/test_direct_compare_answer.py backend/tests/test_advanced_lookup.py backend/tests/test_broad_vocab_answer.py backend/tests/test_dynamic_light_grounding.py backend/tests/test_chat_contract.py backend/tests/test_student_intent_matrix.py backend/tests/test_config.py -o cache_dir='C:\tmp\enggo-pytest-cache'`
  - `corepack pnpm test scripts/lib/fastapi-db-unavailable-smoke.test.ts scripts/lib/fastapi-migrated-slice-smoke.test.ts`
- Do not restore default structured DB runtime dependency.
- Do not use provider prose as default grounding for these P1s.
- Do not route semantic-near wording such as `意思相关 / 同义 / 近义 / 搭配 / 作文 / 翻译` into word-family.

## File Map

- `backend/app/retrieval/normalize_query.py`: top-level query mode precedence and English/chinese cue extraction.
- `backend/app/retrieval/learning_intent.py`: `LearningIntentPlan`, semantic cue aliases, word-family task selection.
- `backend/app/answering/advanced_lookup.py`: ECDICT meaning/semantic/shape/word-family candidate expansion and broad lookup entrypoint.
- `backend/app/retrieval/dynamic_light_grounding.py`: dynamic candidate scoring and word-family evidence.
- `backend/tests/test_normalize_query.py`: query-mode and intent-plan regression tests.
- `backend/tests/test_learning_intent.py`: intent-plan policy tests.
- `backend/tests/test_advanced_lookup.py`: service-level grounded answer tests.
- `scripts/lib/fastapi-migrated-slice-smoke.ts`: migrated FastAPI product smoke matrix.
- `scripts/lib/fastapi-db-unavailable-smoke.ts`: bad/no DB smoke matrix.
- `progress.md`, `docs/README.md`: handoff and plan index updates after behavior is verified.

---

### Task 1: P1-1 Chinese Expression Recall

**Files:**
- Modify: `backend/app/retrieval/learning_intent.py`
- Modify: `backend/app/answering/advanced_lookup.py`
- Modify: `backend/tests/test_learning_intent.py`
- Modify: `backend/tests/test_advanced_lookup.py`
- Modify: `scripts/lib/fastapi-migrated-slice-smoke.ts`
- Modify: `scripts/lib/fastapi-db-unavailable-smoke.ts`

- [x] **Step 1: Write failing tests for representative expression recall**

Add tests proving these route to `meaning_lookup` / `meaning_core`, clean the hint, and return ECDICT-first grounded candidates:

```python
def test_expression_recall_cleans_chinese_prefix_noise():
    normalized = normalize_query("表达遵守的单词")

    assert normalized.query_mode == "meaning_lookup"
    assert normalized.intent_plan.task == "meaning_core"
    assert normalized.meaning_hint == "遵守"
```

Add service tests for:

- `遵守的英文是啥`
- `限制用英语怎么说`
- `表达遵守的单词`
- `表示承担责任的词有哪些`
- `表示表达观点的词有哪些哪些考试常见`

Expected: 200 grounded, no provider request, main answers contain plausible ECDICT candidates such as `comply` / `follow` / `restrict` / `responsible` / `express`.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```powershell
$env:TMP='C:\tmp\enggo-pytest-tmp'; $env:TEMP='C:\tmp\enggo-pytest-tmp'; & 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests/test_learning_intent.py backend/tests/test_advanced_lookup.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: new tests fail because hint cleanup / synonym cue coverage is too narrow.

- [x] **Step 3: Implement minimal hint cleanup and cue aliases**

Keep the fix narrow:

- strip leading request verbs like `表达`, `表示`, `有哪些`, `哪些考试常见` when they wrap a Chinese meaning cue.
- add small Chinese synonym aliases for recurring P1 meanings only, for example `遵守 -> 遵守 / 遵循 / 服从`, `承担责任 -> 负责 / 承担责任`, `表达观点 -> 表达 / 观点 / 陈述`.
- reuse `ecdict_meaning_vocabulary()` instead of adding structured DB dependency.

- [x] **Step 4: Add product smoke cases**

Add no-DB / migrated-slice smoke cases for at least:

- `遵守的英文是啥`
- `限制用英语怎么说`
- `表达遵守的单词`
- `表示承担责任的词有哪些`

Expected: grounded resolved, `providerRequestId=null`, `learningIntentTask=meaning_core`, and the old `遵循的英文是什么` / `活动的英文是什么` cases still pass.

- [x] **Step 5: Run verification and commit**

Run:

```powershell
$env:TMP='C:\tmp\enggo-pytest-tmp'; $env:TEMP='C:\tmp\enggo-pytest-tmp'; & 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests/test_learning_intent.py backend/tests/test_advanced_lookup.py backend/tests/test_chat_contract.py -o cache_dir='C:\tmp\enggo-pytest-cache'
corepack pnpm test scripts/lib/fastapi-db-unavailable-smoke.test.ts scripts/lib/fastapi-migrated-slice-smoke.test.ts
```

Commit:

```powershell
git add backend/app/retrieval/learning_intent.py backend/app/answering/advanced_lookup.py backend/tests/test_learning_intent.py backend/tests/test_advanced_lookup.py scripts/lib/fastapi-migrated-slice-smoke.ts scripts/lib/fastapi-db-unavailable-smoke.ts docs/superpowers/plans/2026-05-19-p1-intent-regression-fixes.md
git commit -m "Fix Chinese expression recall grounding"
```

---

### Task 2: P1-2 A/B Lookalike Collection Recall

**Files:**
- Modify: `backend/app/retrieval/normalize_query.py`
- Modify: `backend/app/answering/advanced_lookup.py`
- Modify: `backend/tests/test_normalize_query.py`
- Modify: `backend/tests/test_advanced_lookup.py`
- Modify: `scripts/lib/fastapi-migrated-slice-smoke.ts`

- [x] **Step 1: Write failing routing tests**

Add tests:

```python
@pytest.mark.parametrize("query", [
    "accept 和 except 很像的单词有哪些",
    "跟constitute和institute很像的单词",
    "restrain 和 constrain 很像的单词",
])
def test_multi_seed_lookalike_collection_wins_over_direct_compare(query):
    result = normalize_query(query)

    assert result.query_mode == "shape_neighbor_search"
    assert result.intent_plan.task == "shape_neighbors"
```

Also protect focused compare:

```python
@pytest.mark.parametrize("query", [
    "accept 和 except 怎么区分",
    "restrain 和 constrain 的区别",
])
def test_multi_seed_compare_stays_focused(query):
    result = normalize_query(query)
    assert result.query_mode == "direct_compare"
    assert result.intent_plan.task == "focused_compare"
```

- [x] **Step 2: Run focused tests and verify RED**

Run:

```powershell
$env:TMP='C:\tmp\enggo-pytest-tmp'; $env:TEMP='C:\tmp\enggo-pytest-tmp'; & 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests/test_normalize_query.py backend/tests/test_advanced_lookup.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: new collection-recall cases currently route to `direct_compare`.

- [x] **Step 3: Adjust query-mode precedence**

Make collection recall cues beat bare `A和B` compare only when the query asks for more lookalike words:

- collection cues: `很像的单词`, `有哪些`, `还有没有相似的词`, `相似的词`, `类似的词`, `易混词`.
- focused compare cues still win when query says `怎么区分`, `区别`, `差别`, `分不清`, `哪个`.
- preserve semantic-near exclusion from `semantic_similarity_pattern`.
- update service behavior so `shape_neighbor_search` can handle two seed terms in collection-recall mode; the current single-seed `answer_shape_neighbor()` guard must not turn `A/B 很像的单词` into no-match.

- [x] **Step 4: Verify service behavior and smoke**

Add service/smoke coverage for:

- `accept 和 except 很像的单词有哪些` -> `shape_neighbor_search`
- `restrain 和 constrain 很像的单词` -> `shape_neighbor_search`
- `restrain 和 constrain 的区别` -> `direct_compare`

Expected: collection recall main answer includes the seed terms plus grounded neighbors when available; focused compare answers only the named terms.

- [x] **Step 5: Run verification and commit**

Run:

```powershell
$env:TMP='C:\tmp\enggo-pytest-tmp'; $env:TEMP='C:\tmp\enggo-pytest-tmp'; & 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests/test_normalize_query.py backend/tests/test_advanced_lookup.py backend/tests/test_direct_compare_answer.py -o cache_dir='C:\tmp\enggo-pytest-cache'
corepack pnpm test scripts/lib/fastapi-migrated-slice-smoke.test.ts
```

Commit:

```powershell
git add backend/app/retrieval/normalize_query.py backend/app/answering/advanced_lookup.py backend/tests/test_normalize_query.py backend/tests/test_advanced_lookup.py scripts/lib/fastapi-migrated-slice-smoke.ts docs/superpowers/plans/2026-05-19-p1-intent-regression-fixes.md
git commit -m "Route multi-seed lookalike recall"
```

---

### Task 3: P1-3 English Seed Expansion Wording

**Files:**
- Modify: `backend/app/retrieval/learning_intent.py`
- Modify: `backend/app/retrieval/normalize_query.py` only if routing needs a root-family cue change.
- Modify: `backend/app/retrieval/dynamic_light_grounding.py` only for narrow stem aliases discovered by tests.
- Modify: `backend/tests/test_learning_intent.py`
- Modify: `backend/tests/test_normalize_query.py`
- Modify: `backend/tests/test_advanced_lookup.py`
- Modify: `scripts/lib/fastapi-migrated-slice-smoke.ts`
- Modify: `scripts/lib/fastapi-db-unavailable-smoke.ts`

- [ ] **Step 1: Write failing word-family wording tests**

Add tests for positive cues:

```python
@pytest.mark.parametrize("query", [
    "respect的拓展词",
    "reduce的拓展词",
    "consequence相关词",
    "contribute相关词",
    "responsible的派生/拓展/相关词怎么分",
])
def test_english_seed_expansion_wording_routes_to_word_family(query):
    result = normalize_query(query)
    assert result.query_mode == "root_family_summary"
    assert result.intent_plan.task == "word_family"
```

Add exclusion tests:

```python
@pytest.mark.parametrize("query", [
    "contribute意思相关的短语",
    "responsible的同义词",
    "respect作文表达怎么用",
    "reduce的搭配",
])
def test_semantic_related_writing_and_collocation_do_not_route_to_word_family(query):
    result = normalize_query(query)
    assert result.intent_plan.task != "word_family"
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
$env:TMP='C:\tmp\enggo-pytest-tmp'; $env:TEMP='C:\tmp\enggo-pytest-tmp'; & 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests/test_learning_intent.py backend/tests/test_normalize_query.py backend/tests/test_advanced_lookup.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: `拓展词/相关词` positive cases are currently `standard_lookup` or no-match.

- [ ] **Step 3: Implement `english_seed_word_family_expansion` rules**

In `learning_intent.py`, extend the word-family cue pattern narrowly:

- positive cues: `拓展词`, `扩展词`, `相关词`, `变形`, `形式`, `同族`, `这一族`, `这一组`, `派生/拓展/相关词怎么分`.
- require at least one English seed term.
- exclusion cues: `意思相关`, `短语`, `作文`, `表达`, `翻译`, `同义`, `近义`, `搭配`.

If needed, update `normalize_query.py` so these positive cues become `root_family_summary`, not `direct_lookup` / `fuzzy_recall`.

- [ ] **Step 4: Verify grounded candidate quality**

Use existing ECDICT word-family expansion where possible. Add only narrow stem aliases if service tests prove a high-value seed cannot form a usable family. Do not add broad prefix-only retrieval.

- [ ] **Step 5: Add smoke cases and commit**

Add smoke cases for:

- `respect的拓展词`
- `reduce的拓展词`
- `consequence相关词`
- `contribute相关词`
- `responsible的派生/拓展/相关词怎么分`

Run:

```powershell
$env:TMP='C:\tmp\enggo-pytest-tmp'; $env:TEMP='C:\tmp\enggo-pytest-tmp'; & 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests/test_learning_intent.py backend/tests/test_normalize_query.py backend/tests/test_advanced_lookup.py backend/tests/test_dynamic_light_grounding.py -o cache_dir='C:\tmp\enggo-pytest-cache'
corepack pnpm test scripts/lib/fastapi-db-unavailable-smoke.test.ts scripts/lib/fastapi-migrated-slice-smoke.test.ts
```

Commit:

```powershell
git add backend/app/retrieval/learning_intent.py backend/app/retrieval/normalize_query.py backend/app/retrieval/dynamic_light_grounding.py backend/tests/test_learning_intent.py backend/tests/test_normalize_query.py backend/tests/test_advanced_lookup.py scripts/lib/fastapi-migrated-slice-smoke.ts scripts/lib/fastapi-db-unavailable-smoke.ts docs/superpowers/plans/2026-05-19-p1-intent-regression-fixes.md
git commit -m "Normalize English seed expansion wording"
```

---

### Task 4: Final Handoff And Full Verification

**Files:**
- Modify: `docs/README.md`
- Modify: `progress.md`
- Modify: `bugs.md` only if a new confirmed pitfall appears.

- [ ] **Step 1: Run full focused backend matrix**

Run:

```powershell
$env:TMP='C:\tmp\enggo-pytest-tmp'; $env:TEMP='C:\tmp\enggo-pytest-tmp'; & 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests/test_repository.py backend/tests/test_ecdict.py backend/tests/test_learning_intent.py backend/tests/test_normalize_query.py backend/tests/test_ordinary_lookup_answer.py backend/tests/test_direct_compare_answer.py backend/tests/test_advanced_lookup.py backend/tests/test_broad_vocab_answer.py backend/tests/test_dynamic_light_grounding.py backend/tests/test_chat_contract.py backend/tests/test_student_intent_matrix.py backend/tests/test_config.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: pass.

- [ ] **Step 2: Run TS smoke unit tests**

Run:

```powershell
corepack pnpm test scripts/lib/fastapi-db-unavailable-smoke.test.ts scripts/lib/fastapi-migrated-slice-smoke.test.ts
```

Expected: pass.

- [ ] **Step 3: Update docs**

- Move this plan into completed/history in `docs/README.md`.
- Rewrite the top of `progress.md`: list the three P1 fixes, exact verification commands, and the next remaining non-P1 observations.
- Do not append stale historical bullets.

- [ ] **Step 4: Run diff sanity**

Run:

```powershell
git diff --check
git status --short --branch
```

Expected: no whitespace errors except existing CRLF warnings if Git emits them.

- [ ] **Step 5: Commit docs**

```powershell
git add docs/README.md progress.md bugs.md docs/superpowers/plans/2026-05-19-p1-intent-regression-fixes.md
git commit -m "Document P1 intent regression fixes"
```
