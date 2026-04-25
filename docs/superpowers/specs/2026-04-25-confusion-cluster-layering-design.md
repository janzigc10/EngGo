# Confusion Cluster Layering Design

Date: 2026-04-25

## Summary

EngGo should not treat fuzzy recall, root-family maps, and confused-word comparisons as separate product universes. They are different layers of the same core product value: helping exam students recover and untangle words they naturally remember together.

The current `confusion-groups.json` direction remains valid. The next design step is to reinterpret and extend it from "shape-neighbor groups only" into a broader confusion-cluster layer.

## Core Principle

Students do not confuse words by dictionary category. They confuse words because the words feel close in memory:

- spelling or visual shape is close
- the same root or word fragment appears
- the same prefix or suffix pattern appears
- Chinese meanings feel close
- common collocations or sentence patterns are close

EngGo should model those memory relationships explicitly, then let retrieval and answer style use that structure.

## Three-Layer Model

### 1. Input Layer

This layer answers: how did the user ask?

Examples:

- direct lookup: `academic 是什么意思`
- direct comparison: `stationary 和 stationery 哪个是文具`
- shape search: `跟 recent 很像的词有哪些`
- root fragment: `stitute 是什么`
- collocation phrase: `benefit from 是什么意思`
- Chinese meaning recall: `证据那个词`
- typo or partial spelling: `有个像 reqeust 的词`

These modes are retrieval entry points. They should not define the knowledge model by themselves.

### 2. Knowledge Layer

This layer answers: what should be remembered together?

The main unit is a confusion cluster. A cluster may have one or more labels:

- `shape_like`: words look visually similar
- `root_family`: words share a root or stable word fragment
- `prefix_family`: words share a prefix pattern worth teaching together
- `meaning_near`: Chinese meanings or exam choices are close
- `collocation_boundary`: words are separated mainly by collocation or grammar pattern
- `exam_high_value`: the group is especially worth teaching for exam users

Existing shape-like groups remain valid. Root-family groups such as `institute / substitute / constitute` should not live in a separate universe; they are confusion clusters with a `root_family` label.

### 3. Answer Layer

This layer answers: how should EngGo explain the result?

The current answer styles should remain:

- `standard_lookup`: used for a single entry when no group explanation is needed
- `confusion_untangle`: used when the answer is a cluster, regardless of whether the cluster is shape-like, root-family, meaning-near, or collocation-based
- `root_family_summary`: currently useful as a prototype, but should be treated as a specialized rendering of `confusion_untangle`, not a separate long-term product lane

## Existing Work Is Preserved

The current confusion groups should not be thrown away. They become the first set of `shape_like` clusters.

Examples:

- `access / assess / excess`
- `stationary / stationery`
- `accept / except`
- `advice / advise`
- `personal / personnel`

The current root prototypes are also preserved, but should move toward the same cluster model:

- `institute / institution / constitute / substitute`
- `attempt / tempt / temptation / contempt`

## Collocation Boundary

`collocation_boundary` means words may be close in Chinese meaning, but exam answers are often separated by what the word takes after it.

Examples:

- `comply / conform / defer`
  - `comply with rules`
  - `conform to standards`
  - `defer to authority`
- `consist / compose / comprise / constitute`
  - `consist of`
  - `be composed of`
  - `comprise`
  - `constitute`
- `benefit / profit / gain`
  - `benefit from`
  - `profit from`
  - `gain experience`

These groups are not primarily shape-like. They are still confusion clusters because students choose between them in exam contexts.

## Proposed Cluster Shape

The existing JSON schema can be extended conservatively instead of replaced.

```json
{
  "id": "root-stitute",
  "labels": ["root_family", "shape_like", "exam_high_value"],
  "anchorPattern": "stitute",
  "members": ["institute", "institution", "constitute", "substitute"],
  "whyConfusing": "These words share the stitute fragment and are easy to remember as one abstract family.",
  "quickDistinction": "institute = set up / institution = organization or system / constitute = make up / substitute = replace",
  "examHook": "Start with institute and institution, then use constitute and substitute as contrast words."
}
```

This keeps the existing group idea but makes the reason for grouping explicit.

## What Not To Do

Do not turn EngGo into a static screenshot-style word list. The reference images are useful because they show how students naturally group confusing words, not because the product should copy their format.

Do not make all fuzzy recall paths equal. Typo correction, Chinese meaning lookup, and collocation lookup are entry points. The product value is the cluster explanation after retrieval.

Do not replace existing answer styles with a new system. The right move is to put current styles into the three-layer model and gradually migrate root-family behavior into cluster-backed explanations.

## Next Implementation Direction

The next valuable implementation plan should be small:

1. Add optional cluster metadata to a few existing confusion groups.
2. Convert the current `stitute` and `tempt` prototypes into cluster-backed data or cluster-like fixtures.
3. Add 10-20 high-value clusters across `shape_like`, `root_family`, `meaning_near`, and `collocation_boundary`.
4. Add smoke cases that ask through different input paths but verify the same cluster result.

Success means a user can ask in different ways and still land on the same memory group:

- `stitute 是什么`
- `institute substitute constitute 怎么分`
- `跟 institute 很像的一组词`

All should resolve toward the same cluster, with the answer style adapted to the user question.
