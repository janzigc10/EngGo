# Broad Vocab Confusion Organizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `broad_vocab_summary` collection answers from loose semantic maps into student-facing confusion organizers that prioritize easily confused terms, core differences, and bounded supplemental candidates.

**Architecture:** Keep ordinary `standard_lookup` unchanged. Rework only the broad answer planning layer in `backend/app/answering/broad_vocab.py`: `broadAnswerPlan.candidateSections`, `candidateBudget`, and prompt/rules should tell the provider to produce one high-confusion core group first, then bounded same-prefix/suffix/fragment supplements. Preserve dynamic light grounding as the candidate source and keep old structured groups as boost data, not answer gates.

**Tech Stack:** Python 3.12, FastAPI backend answering helpers, pytest, existing TypeScript smoke runners for product regression handles.

---

### Task 1: Lock The New Broad Organizer Contract

**Files:**
- Modify: `backend/tests/test_broad_vocab_answer.py`

- [x] **Step 1: Add a failing test for collection-map core confusion grouping**

Add `test_collection_plan_prioritizes_confusable_core_before_supplements`.

Use candidates like:

```python
candidates = [
    light_candidate("command", signals=[
        LightGroundingSignal("prefix", 110, "comm"),
        LightGroundingSignal("common_prefix", 60, "comm"),
        LightGroundingSignal("ngram_overlap", 45, "command/comment"),
    ], meanings=["命令；指挥"], part_of_speech="n./v."),
    light_candidate("comment", signals=[
        LightGroundingSignal("prefix", 109, "comm"),
        LightGroundingSignal("common_prefix", 60, "comm"),
        LightGroundingSignal("ngram_overlap", 45, "comment/command"),
    ], meanings=["评论"], part_of_speech="n./v."),
    light_candidate("commend", signals=[
        LightGroundingSignal("prefix", 108, "comm"),
        LightGroundingSignal("common_prefix", 60, "comm"),
        LightGroundingSignal("ngram_overlap", 44, "commend/comment"),
    ], meanings=["称赞；推荐"], part_of_speech="vt."),
    light_candidate("commander", signals=[LightGroundingSignal("prefix", 80, "comm")]),
    light_candidate("commemorate", signals=[LightGroundingSignal("prefix", 79, "comm")]),
]
```

Expected assertions:

```python
sections = plan["candidateSections"]
assert sections[0]["role"] == "confusable_core_terms"
assert sections[0]["lemmas"] == ["command", "comment", "commend"]
assert sections[1]["role"] == "supplemental_same_form_candidates"
assert "commander" in sections[1]["lemmas"]
assert plan["candidateBudget"]["rule"] == "Prioritize the most confusable core group, then list bounded same-form supplements."
```

- [x] **Step 2: Add a failing test for collection-map rules**

Add `test_collection_plan_requires_core_difference_and_rejects_loose_category_titles`.

Expected assertions:

```python
rules = "\n".join(plan["rules"])
assert "Start with the most confusable core group." in rules
assert "For the core group, include one short core difference sentence." in rules
assert "Use supplemental candidates only after the core group." in rules
assert "Do not invent broad semantic category titles for weakly related candidates." in rules
```

- [x] **Step 3: Add a failing prompt contract test**

Extend `test_broad_prompt_blocks_learning_card_tail_and_invented_mnemonics`.

Expected prompt assertions:

```python
assert "confusable core group" in prompt
assert "one short core difference" in prompt
assert "supplemental candidates" in prompt
assert "Do not invent broad semantic category titles" in prompt
```

- [x] **Step 4: Run focused tests and verify RED**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_broad_vocab_answer.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: fail on the new `confusable_core_terms` / rule / prompt expectations.

### Task 2: Implement Confusion Organizer Sections

**Files:**
- Modify: `backend/app/answering/broad_vocab.py`
- Modify: `backend/tests/test_broad_vocab_answer.py` only if helper names need tiny cleanup

- [x] **Step 1: Add collection-map signal helpers**

In `backend/app/answering/broad_vocab.py`, add helper sets:

```python
confusion_core_signals = {
    "exact",
    "edit_distance",
    "ngram_overlap",
    "common_prefix",
    "structured_group",
}

supplemental_form_signals = {
    "prefix",
    "suffix",
    "fragment",
    "meaning_keyword",
}
```

Add a small helper:

```python
def signal_strength(candidate: LightGroundingCandidate, signal_names: set[str]) -> int:
    return len(signal_types(candidate) & signal_names)
```

- [x] **Step 2: Build collection organizer sections**

Replace the `collection_map` branch in `build_candidate_sections` with:

1. `confusable_core_terms`: answerable candidates with at least two confusion-core signals, capped at 3-5 terms.
2. `supplemental_same_form_candidates`: answerable candidates not already in core and carrying prefix/suffix/fragment/meaning signals, capped at 8-12 terms.
3. `candidate_only_no_reviewed_meaning`: unchanged role for source-only candidates with no reviewed meaning.

Keep ordering stable from candidate ranking; do not do a new global re-sort unless needed for the core-vs-supplement split.

- [x] **Step 3: Update collection budget and rules**

Change `candidate_budget("collection_map")["rule"]` to:

```text
Prioritize the most confusable core group, then list bounded same-form supplements.
```

Add rules:

```text
Start with the most confusable core group.
For the core group, include one short core difference sentence.
Use supplemental candidates only after the core group.
Do not invent broad semantic category titles for weakly related candidates.
```

Keep existing rules that forbid tables, candidate-outside answers, scope repetition, example columns, mnemonics, and follow-up invitations.

- [x] **Step 4: Update broad system prompt**

In `build_broad_vocab_system_prompt()`, revise the `collection_map` wording from "learning map not dictionary dump" toward:

```text
collection_map = first explain the confusable core group with POS, short meanings, and one short core difference; then list supplemental candidates only if useful.
```

Also add the explicit prohibition:

```text
Do not invent broad semantic category titles for weakly related candidates.
```

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_broad_vocab_answer.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: all tests in `test_broad_vocab_answer.py` pass.

### Task 3: Preserve Focused Compare, Semantic Root, And Ordinary Lookup Boundaries

**Files:**
- Modify: `backend/tests/test_broad_vocab_answer.py`
- Optionally modify: `backend/tests/test_ordinary_lookup_answer.py` only if a new boundary assertion is clearer there

- [x] **Step 1: Add regression tests for non-collection styles**

Add or extend assertions proving:

```python
focused = build_broad_vocab_grounding(... query="commend comment command 怎么区分" ...)
assert focused["broadAnswerPlan"]["style"] == "focused_compare"
assert focused["broadAnswerPlan"]["candidateSections"][0]["role"] == "primary_terms"

semantic = build_broad_vocab_grounding(... query="re+con 的词根有什么词" ...)
assert semantic["broadAnswerPlan"]["style"] == "semantic_root_boundary"
assert semantic["broadAnswerPlan"]["candidateSections"][0]["role"] == "direct_ordered_fragment_matches"
```

The new `confusable_core_terms` role must apply only to `collection_map`.

- [x] **Step 2: Run broad tests**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_broad_vocab_answer.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: pass.

- [x] **Step 3: Run ordinary lookup boundary tests**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_ordinary_lookup_answer.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: pass; this confirms the broad organizer change did not touch deterministic `standard_lookup`.

### Task 4: Add Product Regression Handles And Docs Sync

**Files:**
- Modify: `scripts/lib/black-box-product-smoke.test.ts`
- Modify: `scripts/lib/fastapi-migrated-slice-smoke.test.ts`
- Modify: `docs/superpowers/plans/2026-05-15-broad-vocab-confusion-organizer.md`
- Modify: `progress.md`
- Modify: `docs/README.md`

- [x] **Step 1: Extend product-smoke unit assertions for broad cases**

In the smoke test files, add assertions that the broad cases still expect:

```ts
expectedAnswerStyle: "broad_vocab_summary"
```

and continue covering:

```text
comm / command-style broad lookup if present
tion 结尾的词有哪些
re+con 的词根有什么词
要求怎么说
跟 qzxqzz 很像的词有哪些
```

If the existing smoke case set already covers a case, update the test description or expected fields rather than adding duplicates.

- [x] **Step 2: Run focused TypeScript smoke tests**

Run:

```powershell
corepack pnpm test scripts/lib/black-box-product-smoke.test.ts scripts/lib/fastapi-migrated-slice-smoke.test.ts
```

Expected: 2 files pass.

- [x] **Step 3: Run lint on touched TypeScript files if any changed**

Run only if smoke TypeScript files changed:

```powershell
corepack pnpm lint scripts/lib/black-box-product-smoke.test.ts scripts/lib/fastapi-migrated-slice-smoke.test.ts
```

Expected: pass.

- [x] **Step 4: Update rolling handoff**

After implementation and verification, update `progress.md` by rewriting the top current-direction block, not merely appending:

```text
Broad vocab confusion organizer second刀 completed.
Next: small provider sample for final phrasing, then decide whether to continue broad wording or return to chat main-stage UX.
```

Remove or downgrade any now-stale "next step" lines that still say this plan has not started.

- [x] **Step 5: Mark this plan complete as tasks finish**

After each task passes, mark its checklist items from `- [ ]` to `- [x]` immediately.

### Task 5: Final Verification

**Files:**
- Read-only verification across backend and smoke handles

- [x] **Step 1: Run focused backend suite**

Run:

```powershell
C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_broad_vocab_answer.py backend/tests/test_dynamic_light_grounding.py backend/tests/test_advanced_lookup.py backend/tests/test_direct_compare_answer.py backend/tests/test_ordinary_lookup_answer.py backend/tests/test_chat_contract.py -o cache_dir='C:\tmp\enggo-pytest-cache'
```

Expected: pass.

- [x] **Step 2: Run product smoke unit handles**

Run:

```powershell
corepack pnpm test scripts/lib/black-box-product-smoke.test.ts scripts/lib/fastapi-migrated-slice-smoke.test.ts
```

Expected: pass.

- [x] **Step 3: Run lint for touched files**

Run:

```powershell
corepack pnpm lint scripts/lib/black-box-product-smoke.test.ts scripts/lib/fastapi-migrated-slice-smoke.test.ts
```

If only Python and markdown files changed, lint may be skipped with that reason recorded in `progress.md`.

- [x] **Step 4: Run diff hygiene**

Run:

```powershell
git diff --check
```

Expected: exit 0, except the known CRLF warning if present.
