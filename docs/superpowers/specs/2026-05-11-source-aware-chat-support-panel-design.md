# Source-Aware Chat Support Panel Design

Date: 2026-05-11

## Summary

FastAPI migration is now complete, and ordinary lookup can return three different kinds of grounded answers:

- structured EngGo entries
- source-lemma exact matches backed by exam source lists
- external dictionary basic profiles, currently ECDICT

The chat support panel still speaks as if every resolved answer is the same kind of "current range hit". That is too coarse now. The next UI pass should make the source and trust level visible without turning the answer into a technical debug panel.

## Product Principle

Grounding should help the learner decide how to use the answer.

- Structured entries are EngGo's high-confidence learning material.
- Source-lemma matches mean the word is in a source list, but may not yet have EngGo structured notes.
- External dictionary profiles are useful basic definitions, but unreviewed and should not look like handcrafted EngGo entries.

The UI should make that difference clear in one short status line and one short note.

## Desired Behavior

### Structured Answer

For normal structured hits, keep the current compact support panel shape.

Example:

```text
命中状态
已命中 1 个结构化范围词：access
```

### Source-Lemma Answer

For `sourceKind: "source_lemma"` or `matchType: "source_lemma_exact"`, show a source-list label.

Example:

```text
命中状态
已命中 1 个来源词表词：accent

来源说明
这个词在当前考试来源词表内，但还不是 EngGo 人工结构化词条；释义先按基础释义理解。
```

### External Dictionary Answer

For `sourceKind: "external_dictionary_basic"` or `matchType: "external_dictionary_exact"`, show an external dictionary label.

Example:

```text
命中状态
已找到 1 条外部基础释义：make up

来源说明
来自外部基础词典，适合先理解意思；暂不产生易混词、词根族或考试优先级判断。
```

### Collection Actions

Collection rows should not expose internal reasons like `source lemma exact match`.

- Structured candidates can keep the existing meaning-based note.
- Source-lemma candidates with no meaning should save/display a learner-facing note such as `来源词表命中，待补结构化释义`.
- External dictionary candidates should prefix the note with `外部基础词典释义：`.

## Non-Goals

- Do not change retrieval ranking or answer generation.
- Do not add bulk collection.
- Do not build the review queue yet.
- Do not make external dictionary entries count as EngGo structured entries.
- Do not expose raw `sourceKind`, `matchType`, or implementation terms in the UI.

## Acceptance Criteria

- Structured lookup still shows a compact resolved support panel.
- Source-lemma lookup shows a source-list explanation and does not claim handcrafted structured status.
- External dictionary lookup shows an external dictionary explanation.
- Collection notes for source-only or external dictionary candidates are learner-facing.
- Plain answers and no-match answers keep their current support-panel behavior.
- Component tests cover source-lemma and external dictionary support-panel rendering plus collection-note behavior.
