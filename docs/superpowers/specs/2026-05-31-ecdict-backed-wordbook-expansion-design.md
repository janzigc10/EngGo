# ECDICT-backed Wordbook Expansion Design

## Status

Drafted on 2026-05-31 after validating the running Learn / Review flow and revisiting the original 2026-04-21 product spec.

This spec extends `2026-05-30-wordbook-learn-review-state-machine-design.md`. It keeps the Learn / Review state machine, but changes the wordbook content source from the small `real-smoke` slice to a compact generated ECDICT-backed wordbook.

## Decision

Use ECDICT as the backing dictionary for memorization.

The practical rule is:

```text
source lemma manifests define exam membership
ECDICT supplies basic POS and Chinese meanings
generated compact JSON feeds the client wordbook
manual confusion graph remains optional override, not the main ingestion path
```

This matches the current ECDICT backbone direction: ECDICT is the broad base, old structured data is a frozen / optional overlay, and high-value manual edits can be added later as small overrides.

## Current Verified State

Verified on the running local app on 2026-05-31:

- `/learn` and `/review` are implemented and usable.
- Current default wordbook has 546 CET-6 entries from `real-smoke`.
- Learn opens real cards, persists local progress, and supports active session restore.
- Review opens hidden recall cards, persists local progress, and supports active session restore.
- `/progress` reads the same local wordbook progress.
- The remaining content gap is not state-machine behavior; it is that the wordbook is still a thin development slice.

## Product Boundary

In scope:

- Generate a compact, git-tracked wordbook dataset from local ECDICT plus confirmed source lemma manifests.
- Keep the current `cet6-foundation-v1` ID for compatibility with existing localStorage.
- Continue to expose one default CET-6 wordbook in the app.
- Keep Gaokao / CET-4 / CET-6 source membership in entries when available.
- Keep postgrad blocked until a machine-readable source list exists.
- Add a conservative ECDICT-only direct-comparison distinction when no manual confusion group exists.
- Fix obvious stale homepage copy and hydration mismatch seen during live validation.

Out of scope:

- Full manual confusion graph generation.
- Full NotebookLM-style source workspace.
- Account sync, cloud state, complete SRS, audio, examples, or commercial wordbook content.
- UI polish beyond stale/incorrect copy and health fixes.
- New collection workflow work.

## Confusion Graph Shortcut

A fully systematic graph is still mostly manual work. ECDICT can help create candidate pairs, but it cannot reliably know which pairs are pedagogically confusing, common in exams, or worth teaching first.

The useful shortcut for this stage is narrower:

- For explicit `A 和 B 的区别` questions, if no manual group exists, show both ECDICT meanings and add a grounded "core meaning" distinction extracted from those meanings.
- Do not claim a high-confidence confusion relationship.
- Do not add generated graph edges to persistent data.
- Later, frequently repeated weak comparisons can become small manual overrides.

This gives the chat answer a better user-visible result without pretending ECDICT has a human-authored confusion graph.

## Data Generation Rules

Input files:

- `output/external-dictionaries/ecdict.csv`
- `data/exam-vocab/source-lemmas/gaokao-2020-lemmas.txt`
- `data/exam-vocab/source-lemmas/cet-2016-lemmas.tsv`

Generated output:

- `data/exam-vocab/ecdict-wordbook/entries.json`

Rules:

- Include only lookup-friendly lemmas matching `/^[a-z]{3,}$/`.
- Include only lemmas with at least one confirmed source membership among `gaokao`, `cet4`, `cet6`.
- Treat CET-4 source words as both `cet4` and `cet6`.
- Treat CET-6 extra words as `cet6`.
- Keep Gaokao membership as `gaokao`.
- Do not emit `postgrad`.
- Require an exact ECDICT row.
- Require at least one non-empty cleaned Chinese meaning.
- Drop duplicate meanings and cap the client-facing meaning list to a small number.
- Keep examples and collocations empty for now.

## Acceptance

- The default wordbook still uses ID `cet6-foundation-v1`, but its source label clearly says ECDICT + source lemmas.
- The app exposes materially more than the old 546-entry slice.
- Existing Learn / Review behavior keeps working against the larger dataset.
- Direct compare for ECDICT-only pairs is no longer just two dictionary lines.
- Homepage copy no longer says learning/review will be added later.
- Restored chat transcript does not trigger the observed server/client hydration mismatch.
