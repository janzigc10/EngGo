# Real-Smoke Vocabulary Dataset

## Source Contract

- Source names:
  - 教育部《普通高中英语课程标准（2017年版2020年修订）》附录 2 词汇表。
  - 中国教育考试网《全国大学英语四、六级考试大纲（2016年修订版）》词表。
- Source retrieval date: 2026-04-24.
- Source lemma manifests:
  - `data/exam-vocab/source-lemmas/gaokao-2020-lemmas.txt`
  - `data/exam-vocab/source-lemmas/cet-2016-lemmas.tsv`
- `entries.json`: normalized vocabulary entries using the existing EngGo vocabulary seed schema.
- `confusion-groups.json`: manually confirmed confusing-word groups using the existing EngGo confusion group seed schema.
- `lookalike-smoke-cases.json`: deterministic smoke cases for scope-aware lookalike recall.

## Data Rules

- Do not hand-invent real vocabulary entries. Only normalize entries from confirmed source files or explicit source documents.
- Every entry must include at least one Chinese core meaning in `meaningsZh`.
- Duplicate lemmas across exam scopes must be merged into one entry with multiple `examScopes`, not copied as separate entries.
- Curated confusion groups require human confirmation; do not create them from spelling similarity alone.
- Keep source traceability outside generated normalized files when possible, so future reviewers can verify where each vocabulary slice came from.

## Confusion Clusters

- Ordinary entries are not all groups. Most entries are thin lookup records for standard lookup.
- A confusion cluster is reserved for words worth remembering together because students are likely to mix them up in exams.
- Cluster labels explain why the group exists:
  - `shape_like`: spelling or visual form is close.
  - `root_family`: shared fragment/root-like pattern is useful for memory.
  - `prefix_family`: prefix direction helps distinguish the words.
  - `meaning_near`: Chinese meanings are close but usage differs.
  - `collocation_boundary`: fixed collocation or following pattern is the main boundary.
  - `exam_high_value`: worth prioritizing for exam-facing recall.
- Labels are additive metadata on the existing `confusion_group` model, not a separate frontend mode.

## Scope Notes

- `gaokao`, `cet4`, and `cet6` scopes are backed by the source manifests above.
- Unstarred CET entries are treated as both `cet4` and `cet6` scope for EngGo retrieval, because CET6 preparation includes the shared CET vocabulary base plus the star-marked CET6 extension.
- `postgrad` is intentionally absent from this dataset until an entry-level, source-checkable postgrad vocabulary file is available. The NEEA 2022 英语（二）大纲 page confirms the book contains `附录1 词汇表`, but the public page only exposes cover/catalog images rather than a machine-readable vocabulary appendix.

## Current Slice

- Current size: 546 entries / 34 manually reviewed confusion groups.
- The first 86-entry source-backed smoke slice reuses EngGo's manually reviewed confusing-word entries and retags their exam scopes against the official source lemma manifests.
- The added foundation entries are thin lookup records: source-backed lemma, exam scopes, part of speech, Chinese core meaning, and optional collocation. They are meant to make common exact lookups less empty before the full teaching corpus exists.
- The first labeled cluster pass upgrades `access-assess-excess` and `respect-respective-respectful-respectable`, and adds `root-stitute` plus `root-tempt` as source-backed cluster smoke fixtures.
- This dataset has entered the 500-1000 word foundation RAG MVP range, but remains a thin development slice rather than a full teaching corpus. It should keep growing in controlled source-backed batches rather than through one-time full ingestion.
