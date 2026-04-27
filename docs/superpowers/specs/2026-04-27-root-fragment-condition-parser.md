# Root Fragment Condition Parser Spec

Date: 2026-04-27

## Summary

EngGo should stop adding one-off rules for every root / fragment query. The next layer is a structured word-shape condition parser: convert user wording into composable constraints, filter real in-scope vocabulary entries, then render the existing `root_family_summary` answer.

This is a middle step, not a large architecture rewrite. It preserves the current retrieval and answer-style system while replacing query-by-query fragment handling with a small set of reusable condition types.

New fragment query support must map into one of the constraint types below. If a wording cannot be expressed as these constraints, do not add a special branch for it; leave it no-match or treat it as a separate product decision.

## Problem

The current fragment recall implementation already handles:

- `con 开头的词有哪些`
- `inter 开头的词有哪些`
- `re...nt 这种词`
- minimal root prototypes such as `stitute` and `tempt`

But it is still shaped like several specific patterns. If we keep adding `tion 结尾`, `con 开头 re 相关`, `有 struct 的词`, and every future wording as separate branches, the work becomes an endless patch loop.

## Product Principle

For word-shape queries, satisfy the user's explicit condition first.

- If the condition is structural and clear, filter the current exam scope and show matches.
- If the condition is broad, show the full table and let the user narrow in follow-up.
- If the condition is semantic or root-theory-like, do not invent a word family.
- If there are no real in-scope matches, return no-match.

## Supported Conditions

The parser should produce a structured query:

```ts
type RootFragmentConstraint =
  | { type: "prefix"; value: string }
  | { type: "suffix"; value: string }
  | { type: "contains"; value: string }
  | { type: "start_end"; prefix: string; suffix: string }
  | { type: "ordered_contains"; parts: string[] };

type RootFragmentQuery = {
  id: string;
  fragment: string;
  constraints: RootFragmentConstraint[];
};
```

All constraints combine with AND by default. A lemma must satisfy every constraint.

## Query Mapping

Examples:

| User query | Structured meaning |
| --- | --- |
| `con 开头的词有哪些` | `prefix=con` |
| `tion 结尾的词` | `suffix=tion` |
| `有 struct 的词` | `contains=struct` |
| `re...ct 这种词` | `start_end prefix=re suffix=ct` |
| `con 开头 re 相关的词` | `prefix=con AND contains=re` |
| `有 con 又有 struct 的词` | `contains=con AND contains=struct` |
| `con 和 struct 都有的词` | `contains=con AND contains=struct` |
| `a+b 这种词形` | `ordered_contains=[a,b]` |

## Boundaries

`re+con 的词根有什么词` should remain conservative unless the wording clearly asks for word-shape containment. It asks for a root combination, not just word form, so EngGo should not explain it as if a stable root family exists.

Do not use this parser for ordinary lookup:

- `content 是什么意思` remains `standard_lookup`.
- `inter 是什么意思` should not become prefix recall.
- `con 是什么意思` should not invent a standalone word meaning.

Do not use this parser for true confused-word comparison:

- `access assess excess 怎么分` remains `confusion_untangle`.
- `institute substitute constitute 怎么分` remains comparison / cluster behavior.

## Match Policy

Only match real vocabulary entries in the active exam scope.

- 0 matches: `no_match`.
- 1-8 matches: resolved `root_family_summary`, short family recall is allowed.
- More than 8 matches: resolved `root_family_summary`, broad table required.

Single-match structural queries are allowed because the condition itself is explicit. The answer should say the current scope only matched that word, not imply a larger hidden family.

## Output Contract

For broad matches, the answer must use:

```markdown
| word | 词性 | 核心义 |
```

Rules:

- list every `rootFamilyView.members` item
- do not write "等"
- `word` must copy `member.lemma`
- `词性` must copy `member.partOfSpeech`
- `核心义` must come from `member.modernMeaningZh`
- do not invent extra words
- do not expand into a word-origin lecture

For narrow matches, existing `word=中文义` style can remain, but future improvement may also use the three-column table if it reads better.

## Initial Smoke Matrix

Use current `real-smoke` data:

| Case | Expected behavior |
| --- | --- |
| `con 开头的词有哪些` | broad resolved table, 34 members |
| `tion 结尾的词有哪些` | broad resolved table, current CET-6 `tion` members |
| `有 struct 的词` | narrow resolved list/table for `construct / structure` |
| `con 开头 re 相关的词` | resolved with current match `conference` |
| `re...ct 这种词` | resolved with current match `respect` |
| `re+con 的词根有什么词` | no-match unless later product decision treats it as word-shape containment |

## Non-Goals

- Do not add a vector database.
- Do not add new vocabulary data.
- Do not infer etymology from the fragment.
- Do not convert every prefix into a memorization lesson.
- Do not replace curated high-value clusters; `stitute`, `tempt`, and true confusion groups still need curated teaching data.
