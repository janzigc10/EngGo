# Source Lemma Fallback Design

## Goal

Let EngGo answer ordinary exact lookups for words that exist in the source exam lemma lists but do not yet have curated structured entries.

## Decision

Use Scheme C:

- Keep one unified lemma identity.
- Keep exam-scope membership separate from teaching content.
- Use curated structured entries when they exist.
- Fall back to source lemma exact lookup when a structured entry is missing.
- Let the model generate only a short dictionary-style explanation for that confirmed lemma.

## First Slice

The first implementation only supports:

- English exact ordinary lookup.
- Source lemmas from `data/exam-vocab/source-lemmas`.
- Active scopes `gaokao`, `cet4`, and `cet6`.
- `cet6` includes unstarred CET4 source lemmas plus CET6-extra lemmas.

The first implementation does not support:

- Source-only confusion groups.
- Source-only root family answers.
- Source-only examples or collocations.
- Vector semantic recall.
- Generated profile persistence.
- Postgrad source lemmas.

## Data Flow

```text
user query
  -> normalize query
  -> existing structured retrieval
  -> if structured exact/fuzzy resolves, keep current behavior
  -> if structured retrieval misses and query is exact ordinary lookup
  -> check file-backed source lemma index
  -> if active scope contains the lemma
  -> return source-only resolved grounding
  -> provider generates short explanation
  -> chat service cleans source-only answer like standard lookup
```

## Safety Rules

- The model never decides whether a lemma is in scope.
- The model never chooses the lemma.
- The model never expands to similar words.
- Source-only answers stay ordinary lookup only.
- Source-only candidates still use `answerStyle: "standard_lookup"`.
- Source-only candidates are marked with `sourceKind: "source_lemma"`.
- Source-only candidates use synthetic entry ids prefixed by `source-lemma:`.

## Future Follow-up

If this slice works, add generated lexical profile caching:

- `generated_unreviewed` cache status.
- promote high-frequency or reviewed profiles to curated entries.
- add batch generation only after the exact fallback behavior is stable.
