# Meaning Lookup Scope Tag Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Chinese-to-English `meaning_lookup` answers use only the current wordbook's ECDICT exam-tag candidates, while keeping ordinary English lookup global.

**Architecture:** Keep the current ECDICT-first + optional structured overlay direction. Narrow only the `meaning_core` candidate expansion path in `AdvancedLookupService.ecdict_meaning_vocabulary()` so non-current tags such as `gre` and untagged ECDICT profiles cannot become the main Chinese-to-English answer. Ordinary exact/source/ECDICT lookup remains unchanged and may still answer global English queries such as `viaduct 是什么意思`.

**Tech Stack:** Python 3.12 FastAPI backend, pytest, existing ECDICT profile lookup/search, `LearningIntentPlan`, dynamic light grounding, TypeScript smoke runners, `corepack pnpm`.

---

## Product Contract

- Prerequisite: do this after the completed `codex/p1-intent-regressions` branch is merged, or rebase this plan's implementation branch on top of that worktree. Do not keep widening the P1 regression branch itself.
- Scope tags map through the existing ECDICT policy: `gk/zk -> gaokao`, `cet4 -> cet4`, `cet6 -> cet6`, `ky -> postgrad`.
- `gre` is not an EngGo current wordbook tag. It must not satisfy `gaokao`, `cet4`, `cet6`, or `postgrad` Chinese-to-English main-answer filtering.
- Ordinary English lookup stays global. Queries like `viaduct 是什么意思` may still return `external_dictionary_exact` / `external_dictionary_basic` even when `scopeCodes=[]`.
- Chinese-to-English `meaning_lookup` / `meaning_core` is stricter. If the current scope has no tagged ECDICT candidate, return conservative grounded no-match / range-out behavior rather than using `gre`, untagged, or unrelated low-quality candidates as the main answer.
- Do not rename ECDICT to `structured`, do not reintroduce default structured DB dependency, and do not use provider prose as the fallback for this path.

## File Map

- Modify: `backend/app/answering/advanced_lookup.py`
  - Owns `ecdict_meaning_vocabulary()` and the broad `meaning_core` path that currently widens from current-scope ECDICT tags to any tagged / any matching profile.
- Modify: `backend/tests/test_advanced_lookup.py`
  - Service-level regressions for current-scope Chinese-to-English filtering and conservative no-match.
- Modify: `backend/tests/test_ordinary_lookup_answer.py`
  - Guardrail proving ordinary English lookup still answers global ECDICT entries that do not map to the active scope.
- Optionally modify: `scripts/lib/fastapi-db-unavailable-smoke.ts`
  - Add one no-DB meaning lookup case if a deterministic real ECDICT fixture exists locally.
- Optionally modify: `scripts/lib/fastapi-migrated-slice-smoke.ts`
  - Add the same product smoke case only if it is stable across local ECDICT CSV versions.
- Modify after verification: `progress.md`
  - Record the result, exact tests, and next handoff.
- Modify after verification: `docs/README.md`
  - Move this plan from current active to completed/history.
- Modify only if a residual is confirmed: `bugs.md`
  - Record any ECDICT tag ambiguity or product boundary that remains deferred.

---

### Task 1: Red Tests For Current-Scope Meaning Lookup

**Files:**
- Modify: `backend/tests/test_advanced_lookup.py`

- [x] **Step 1: Add a failing service test for non-current tagged candidates**

Add a test near the existing meaning lookup tests:

```python
def test_gaokao_meaning_lookup_rejects_non_current_ecdict_tags():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("viaduct", ["n. 高架桥；高架铁路"], tag="gre"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="gaokao",
        query="高架桥怎么说",
        request_id="req_viaduct_gre_rejected",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "meaning_lookup"
    assert grounding["resolution"] == "no_match"
    assert "viaduct" not in [
        item["lemma"] for item in grounding.get("mainAnswer", [])
    ]
```

- [x] **Step 2: Add a failing service test for untagged candidates**

Use the same structure, but with an untagged profile:

```python
def test_gaokao_meaning_lookup_rejects_untagged_ecdict_candidates():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("ventiduct", ["n. 通风管"], tag=""),
        ],
    )
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="gaokao",
        query="通风管怎么说",
        request_id="req_ventiduct_untagged_rejected",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert grounding["resolution"] == "no_match"
    assert "ventiduct" not in [
        item["lemma"] for item in grounding.get("mainAnswer", [])
    ]
```

- [x] **Step 3: Add a positive in-scope control**

Add a test proving the stricter path still answers when the ECDICT profile has the active scope tag:

```python
def test_gaokao_meaning_lookup_accepts_current_scope_ecdict_tags():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("restrict", ["v. 限制；约束"], tag="gk"),
            ecdict_profile("constrain", ["v. 限制；约束；强迫"], tag="gre"),
        ],
    )
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="gaokao",
        query="限制用英语怎么说",
        request_id="req_restrict_gaokao_scope",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert grounding["resolution"] == "resolved"
    assert [item["lemma"] for item in grounding["mainAnswer"]][:1] == [
        "restrict",
    ]
```

- [x] **Step 4: Run the red tests**

Run:

```powershell
$env:TMP='C:\tmp\enggo-pytest-tmp'; $env:TEMP='C:\tmp\enggo-pytest-tmp'; & 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests/test_advanced_lookup.py -k "meaning_lookup" -p no:cacheprovider
```

Expected: the new rejection tests fail because `ecdict_meaning_vocabulary()` currently falls back from current-scope profiles to any tagged or any matching profile.

---

### Task 2: Implement The Narrow Filter

**Files:**
- Modify: `backend/app/answering/advanced_lookup.py`
- Modify: `backend/tests/test_advanced_lookup.py`

- [x] **Step 1: Remove widening fallback from `ecdict_meaning_vocabulary()`**

Change `AdvancedLookupService.ecdict_meaning_vocabulary()` so `meaning_core` candidates are searched only through:

```python
profiles = search(
    lambda profile: bool(
        scope_codes_for_profile(
            profile,
            active_exam_target=active_exam_target,
        ),
    )
    and matches_profile(profile),
    limit=search_limit,
    preferred_tags=preferred_tags,
)
```

Delete or bypass the current fallback blocks that search:

```python
lambda profile: bool(profile.tag.strip()) and matches_profile(profile)
```

and:

```python
matches_profile
```

Keep the existing sort and candidate conversion. The result should be an empty candidate list when no current-scope ECDICT profile matches.

- [x] **Step 2: Verify the service now returns conservative no-match**

Run:

```powershell
$env:TMP='C:\tmp\enggo-pytest-tmp'; $env:TEMP='C:\tmp\enggo-pytest-tmp'; & 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests/test_advanced_lookup.py -k "meaning_lookup" -p no:cacheprovider
```

Expected: all meaning lookup tests pass, including existing P1 cases such as `遵守的英文是啥` under `postgrad`.

- [x] **Step 3: Check for unintended call sites**

Search:

```powershell
rg -n "ecdict_meaning_vocabulary|meaning_core|meaning_lookup" backend/app backend/tests
```

Expected: no other caller depends on `ecdict_meaning_vocabulary()` widening outside the active exam target. If a real caller does, add a named parameter such as `require_current_scope=True` instead of weakening this plan's product rule.

---

### Task 3: Protect Ordinary English Lookup

**Files:**
- Modify: `backend/tests/test_ordinary_lookup_answer.py`
- Do not modify unless the guardrail fails: `backend/app/answering/ordinary_lookup.py`

- [x] **Step 1: Add an ordinary lookup guardrail**

Add a test near the ECDICT fallback tests:

```python
def test_ordinary_lookup_keeps_global_ecdict_fallback_for_non_scope_tags(tmp_path):
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path / "missing-source-lemmas",
        ecdict_lookup=lambda lookup: profile(
            "viaduct",
            ["n. 高架桥；高架铁路"],
            tag="gre",
        )
        if lookup == "viaduct"
        else None,
    )

    result = service.answer(
        active_exam_target="gaokao",
        query="viaduct 是什么意思",
        request_id="req_viaduct_global_lookup",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert grounding["matchType"] == "external_dictionary_exact"
    assert grounding["mainAnswer"][0]["lemma"] == "viaduct"
    assert grounding["mainAnswer"][0]["scopeCodes"] == []
```

- [x] **Step 2: Run the ordinary lookup guardrail**

Run:

```powershell
$env:TMP='C:\tmp\enggo-pytest-tmp'; $env:TEMP='C:\tmp\enggo-pytest-tmp'; & 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests/test_ordinary_lookup_answer.py -k "viaduct or ecdict" -p no:cacheprovider
```

Expected: PASS without changing `ordinary_lookup.py`. If it fails because the current helper expects a different callable shape, adjust only the test fixture wiring.

---

### Task 4: Product Smoke And Handoff Docs

**Files:**
- Optionally modify: `scripts/lib/fastapi-db-unavailable-smoke.ts`
- Optionally modify: `scripts/lib/fastapi-migrated-slice-smoke.ts`
- Modify: `docs/README.md`
- Modify: `progress.md`
- Optionally modify: `bugs.md`

- [x] **Step 1: Add stable smoke cases only if the local CSV supports them**

If the local ignored ECDICT CSV reliably contains the needed rows, add one or two smoke cases:

```ts
{
  name: "gaokao meaning lookup rejects gre-only viaduct",
  query: "高架桥怎么说",
  activeExamTarget: "gaokao",
  expectedStatus: 200,
  expectedAnswerKind: "grounded",
  expectedResolution: "no_match",
  forbiddenGroundingIncludes: ["viaduct"],
  forbiddenMainAnswerIncludes: ["viaduct"],
  expectedProviderRequest: "absent",
  expectedProviderRequestId: null,
}
```

Do not add fragile smoke if the assertion depends on rows that may differ across ECDICT downloads. In that case, keep this as pytest-only coverage.

- [x] **Step 2: Run focused backend verification**

Run:

```powershell
$env:TMP='C:\tmp\enggo-pytest-tmp'; $env:TEMP='C:\tmp\enggo-pytest-tmp'; & 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests/test_ecdict.py backend/tests/test_normalize_query.py backend/tests/test_ordinary_lookup_answer.py backend/tests/test_advanced_lookup.py backend/tests/test_dynamic_light_grounding.py backend/tests/test_chat_contract.py -p no:cacheprovider
```

Expected: PASS.

- [x] **Step 3: Run smoke tests**

Run:

```powershell
corepack pnpm test scripts/lib/fastapi-db-unavailable-smoke.test.ts scripts/lib/fastapi-migrated-slice-smoke.test.ts
```

Expected: PASS. If smoke cases were not changed, this is still the required guard that the no-DB and migrated FastAPI matrices remain stable.

- [x] **Step 4: Optional live FastAPI smoke**

If the implementation changes the real `/api/chat` path in a way not fully covered by unit tests, start a temporary FastAPI server with:

```powershell
$env:ENGGO_ECDICT_PATH='C:\Users\Chen\Desktop\EngGo\output\external-dictionaries\ecdict.csv'
```

Then manually smoke:

- `gaokao + 高架桥怎么说` -> grounded no-match / conservative range-out behavior, no provider request, no `viaduct` main answer.
- `gaokao + viaduct 是什么意思` -> ordinary ECDICT answer is still allowed.
- `postgrad + 遵守的英文是啥` -> resolved `meaning_core`, no provider request.

- [x] **Step 5: Update handoff docs**

Update `progress.md` with:

- branch and commit state,
- exact test commands and results,
- behavior summary for `meaning_lookup` vs ordinary lookup,
- any residual risk.

Update `docs/README.md`:

- move this plan from current active plan to completed/history,
- keep the P1 regression plan in completed/history.

Update `bugs.md` only if a confirmed issue remains.

- [x] **Step 6: Final diff checks**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only intentional files changed.

---

## Task 4 Completion Notes

- Smoke case decision: local CSV confirms `viaduct` is `gre` and `ventiduct` is untagged, but this task did not add real smoke cases. The existing smoke definition tests use exact matrices, and updating those tests is outside this task's write set; the less fragile coverage remains the fixture-based pytest regressions from Tasks 1-3.
- Focused backend verification: `$env:TMP='C:\tmp\enggo-pytest-tmp'; $env:TEMP='C:\tmp\enggo-pytest-tmp'; & 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests/test_ecdict.py backend/tests/test_normalize_query.py backend/tests/test_ordinary_lookup_answer.py backend/tests/test_advanced_lookup.py backend/tests/test_dynamic_light_grounding.py backend/tests/test_chat_contract.py -p no:cacheprovider` -> `144 passed in 1.33s`.
- Smoke verification: `corepack pnpm test scripts/lib/fastapi-db-unavailable-smoke.test.ts scripts/lib/fastapi-migrated-slice-smoke.test.ts` -> `2 passed` test files / `15 passed` tests.
- Live FastAPI smoke skipped: Task 4 did not change the real `/api/chat` production path; the scope behavior is covered by focused pytest and existing no-DB / migrated FastAPI smoke matrices.

---

## Completion Criteria

- Chinese-to-English `meaning_lookup` under a selected scope only uses ECDICT candidates tagged for that scope.
- `gre`, untagged, and non-current-scope ECDICT profiles do not become main answers for `meaning_core`.
- Ordinary English lookup remains global and can still return ECDICT entries with `scopeCodes=[]`.
- Existing P1 expression recall, shape-neighbor, word-family, ordinary lookup, and no-DB smoke coverage stays green.
