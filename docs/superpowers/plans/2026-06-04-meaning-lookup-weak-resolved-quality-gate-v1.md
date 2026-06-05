# Meaning Lookup Weak-Resolved Quality Gate V1

## Goal

Reduce false `resolved` answers in `meaning_lookup` without turning natural Chinese expression questions into hard `no_match`.

The product rule for this round:
- Strong source-backed candidates stay `grounded/resolved`.
- Weak or off-target candidates must not claim a wordbook / ECDICT hit.
- Expression-like Chinese questions should still get a useful bounded answer, preferably provider-assisted when available.
- Hard `no_match` remains reserved for true out-of-scope or no-candidate cases.

## Non-Goals

- Do not introduce a full ReAct / LangGraph agent.
- Do not let the provider freely choose tool parameters or expand wordbook candidates.
- Do not broaden `semantic_expression` beyond the cases already accepted in Model-assisted Intent Routing V1.
- Do not change Learn / Review / Progress state machines.

## Acceptance Matrix

Weak resolved to fix:
- `遵循的英文是什么` must not resolve to only `disobedience / subdue / unwilling` style candidates.
- `表达观点的英文是什么` must not resolve to unrelated single-word candidates such as `hiss`.
- `遵守规则用英文怎么说` must not be swallowed by the broad `遵从 / 遵守` seed-expression group and must not put `defer` in the main answer.
- `负责的英文是什么` and `承担责任的英文是什么` must not resolve to off-target candidates such as `provost` or `respond`.
- `表达想法的英文是什么` and `提出观点的英文是什么` must prefer expression verbs such as `express / state / voice`, not idea nouns such as `thought / notion`.

Stable paths to protect:
- `access 是什么意思` remains ordinary exact lookup.
- `限制的英文是什么` remains `meaning_lookup` resolved when candidates include `restrict / constrain / restrain`.
- `合作的英文是什么` remains resolved when current-scope candidates contain direct cooperation meanings.
- Direct compare, shape-neighbor, and fixed-phrase lookup stay stable: `restrain 和 constrain 的区别`, `desert dessert 怎么区分`, `和 contest 像的单词`, `according to 是什么意思`.
- Random strings and impossible root / fragment combinations still become bounded `no_match`.
- Unsupported root combinations such as `anti+xyz` and `re+con+sub` stay bounded `no_match`.

## Implementation Tasks

- [x] Task 1: Confirm current branch, active docs, and current `meaning_lookup` resolved path.
- [x] Task 2: Add focused red tests for weak `meaning_lookup` and stable source-backed cases.
- [x] Task 3: Implement a small candidate-quality classifier for `meaning_core`.
- [x] Task 4: Add provider-assisted / bounded expression advice fallback for weak expression-like questions.
- [x] Task 5: Extend E2E comparison coverage with weak-resolved cases and run focused backend verification.
- [x] Task 6: Update `progress.md`, `bugs.md`, and `docs/README.md` with the final result.

## Design Notes

`meaning_lookup` currently merges dynamic vocabulary with ECDICT meaning candidates, then allows `meaning_core` to be answerable with one light candidate. The broad grounding builder then always writes `resolution: resolved`.

V1 should insert a narrow quality gate before `build_broad_vocab_grounding()`:

1. Score the selected light candidates for the cleaned Chinese hint.
2. Treat preferred lemma hits and direct primary meaning hits as strong.
3. Treat reverse / negative morphology and off-target parts of speech as weak when they are the only evidence.
4. If strong candidates exist, continue through existing grounded broad answer.
5. If candidates are weak but the question is expression-like, return a plain provider-assisted expression answer with metadata that explicitly says it is not a wordbook hit.
6. If no useful expression fallback exists, return existing bounded no-match.

This keeps the system from becoming a keyword-only customer-service style bot: weak evidence downgrades the claim, not necessarily the helpfulness of the answer.
