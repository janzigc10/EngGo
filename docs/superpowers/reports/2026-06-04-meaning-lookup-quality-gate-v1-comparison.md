# Meaning Lookup Quality Gate V1 Comparison

## Summary

Baseline: `52b7834`

Current branch: `codex/meaning-lookup-quality-gate-v1`

Command:

```powershell
C:\Users\Chen\anaconda3\python.exe scripts\run-model-routing-e2e-compare.py
```

Result:

- 36 total
- 36 pass
- 0 fail
- 23 changed
- Stable: 12 / 12 pass, 1 changed
- Regression probe: 2 / 2 pass, 1 changed
- Expected improvement: 22 / 22 pass, 21 changed

## Meaning Lookup Deltas

### `表达观点的英文是什么`

Before:

- `answerKind=grounded`
- `queryMode=meaning_lookup`
- `mainAnswer=["hiss"]`
- Answer preview: `hiss n. / vi. / vt. 嘘声...`

After:

- `answerKind=grounded`
- `queryMode=meaning_lookup`
- `mainAnswer=["express", "state", "voice", "represent"]`

### `遵循的英文是什么`

Before:

- `answerKind=grounded`
- `queryMode=meaning_lookup`
- `mainAnswer=["disobedience", "subdue", "unwilling"]`

After:

- `answerKind=grounded`
- `queryMode=meaning_lookup`
- `mainAnswer=["follow", "observe", "comply", "obey", "abide"]`

### `限制的英文是什么`

Before:

- `answerKind=grounded`
- `queryMode=meaning_lookup`
- `mainAnswer=["bridle"]`

After:

- `answerKind=grounded`
- `queryMode=meaning_lookup`
- `mainAnswer=["restrict", "limit", "constrain"]`

### `遵守规则用英文怎么说`

Before:

- `answerKind=plain`
- `resolvedFollowUp.action=clear_context`
- `mainAnswer=[]`

After:

- `answerKind=grounded`
- `queryMode=meaning_lookup`
- `mainAnswer=["follow", "observe", "comply", "obey", "abide"]`
- `defer` is forbidden from the main answer for this phrase.

### `负责的英文是什么` / `承担责任的英文是什么`

Before:

- `answerKind=grounded`
- `queryMode=meaning_lookup`
- `mainAnswer=["provost"]`

After:

- `answerKind=grounded`
- `queryMode=meaning_lookup`
- `mainAnswer=["responsible", "liable"]`
- `respond` is forbidden from the main answer.

### `表达想法的英文是什么` / `提出观点的英文是什么`

Before:

- Either `clear_context` or weak off-target candidates.

After:

- `表达想法的英文是什么` -> `mainAnswer=["express", "state", "voice"]`
- `提出观点的英文是什么` -> `mainAnswer=["state", "express", "voice"]`
- `thought / notion` are forbidden from the main answer for these expression questions.

## Regression Notes

No-match did not increase in the E2E matrix:

- `zzqvwm 是什么意思` stayed `no_match`.
- `access 是什么意思` stayed ordinary resolved lookup.
- `formal 是什么意思` stayed ordinary resolved lookup, not `semantic_expression`.
- `restrain 和 constrain 的区别` and `desert dessert 怎么区分` stayed direct compare.
- `和 contest 像的单词` stayed shape-neighbor search.
- `according to 是什么意思` stayed fixed-phrase direct lookup.
- Root combo gates and style follow-up improvements from Model-assisted Intent Routing V1 remained intact.

The main behavior change is not "more no-match"; it is better candidate quality inside `meaning_lookup`.

## Review Blocker Follow-up

Two review blockers were found outside the original 36-case matrix and fixed on 2026-06-05:

- Weak `meaning_expression_advice` now returns `answerKind=plain`, `resolution=no_match`, `noMatchReason=low_confidence`, an empty `mainAnswer`, and complete display metadata. The chat UI renders it as "表达建议" instead of a wordbook hit or "已命中 0 个当前范围词".
- Phrase hint extraction now ignores protected phrases when they are immediately preceded by negative context such as `不`, `不要`, `不能`, `没有`, or `未能`. `不承担责任的英文是什么` therefore keeps the negative meaning and prefers `irresponsible` in the focused regression test.

Follow-up verification:

- `backend/tests/test_advanced_lookup.py` -> 55 passed.
- `backend/tests/test_advanced_lookup.py backend/tests/test_chat_contract.py backend/tests/test_chat_tool_router.py backend/tests/test_learning_intent.py backend/tests/test_learning_context.py` -> 193 passed.
- `src/components/chat/chat-workspace.test.tsx src/features/chat/conversation-context.test.ts scripts/lib/conversational-learning-context-smoke.test.ts` -> 41 passed.
- `scripts/run-model-routing-e2e-compare.py` -> 36 total / 36 pass / 0 fail / 23 changed.

## Extended Probe Residuals

These were discovered while increasing coverage but were not included as passing acceptance cases for this round:

- `活动的英文是什么` still returns `action` under CET-6 providerless runtime. `activity` exists in Gaokao/CET-4 source scope, but current CET-6 source and preferred ECDICT paths do not inherit lower-level scopes. This needs a separate scope-policy decision.
- `anti 前缀有哪些词`, `sub开头表示下面的词`, and `re开头表示再次的词` can still produce obscure or semantically loose prefix candidates. This is a root/prefix semantic quality-gate problem, not a `meaning_lookup` issue.
- `xyz开头的单词` can resolve to ECDICT `xyz`. That is a prefix/bare-token boundary issue for a later matrix.
