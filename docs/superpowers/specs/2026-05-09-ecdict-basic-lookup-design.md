# ECDICT Basic Lookup Design

## Goal

Use ECDICT as an external basic-definition source for ordinary lookup, so EngGo does not need to ask a model for every source-only word.

## Vocabulary Boundaries

EngGo should keep three lookup shapes separate:

- Word: `access`, `makeup`, `airport`, `everyday`
- Hyphenated word: `well-known`, `x-ray`, `t-shirt`, `up-to-date`
- Phrase: `according to`, `ought to`, `make up`, `take effect`

Hyphenated words are words, not phrases. They should stay eligible for ordinary exact lookup. Phrases are primarily identified by spaces. Joined phrase artifacts such as `accordingto` should not become word lemmas; they should be explicit normalization aliases to phrase entries.

## Source Priority

For ordinary exact lookup, the target order is:

1. EngGo structured entry.
2. Source lemma membership for exam scope only, including ordinary words, hyphenated words, and explicit joined-phrase aliases.
3. ECDICT basic profile for external basic meanings after scope-safe source membership, or for exact spaced phrases that would otherwise be no-match.
4. Model fallback for missing dictionary profiles, out-of-scope normal English, or complex explanations.

ECDICT output must remain marked as external and unreviewed. It can answer basic meanings, but it must not create confusion groups, root families, exam priority, or high-trust teaching notes.

## Implemented Slice

The first slice builds an independent ECDICT basic profile lookup module and wires it into ordinary lookup through narrow gates.

Supported:

- exact lookup for words
- exact lookup for hyphenated words
- exact lookup for phrases with spaces
- explicit joined phrase aliases, for example `accordingto -> according to`
- translation cleaning that drops domain-only lines like `[计]`, `[医]`, `[化]`
- source-lemma ordinary lookup short-circuits provider through ECDICT when a usable profile exists
- hyphenated source lemmas such as `x-ray` stay in direct lookup mode, not root-family mode
- direct spaced phrases no longer fuzzy-match unrelated single words
- exact spaced phrase no-match can use an ECDICT phrase profile with `matchType: "external_dictionary_exact"`

Not supported yet:

- fuzzy phrase lookup
- automatic compound splitting
- automatic `makeup` / `make-up` / `make up` merging
- model fallback cache
- using ECDICT to create confusion groups, root families, or exam priority

## Validation

The module should have unit tests for exact word lookup, hyphenated lookup, phrase lookup, joined phrase normalization, and domain-noise filtering. The existing ECDICT source-only audit remains the coverage and quality smoke tool.
