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

## Scope Notes

- `gaokao`, `cet4`, and `cet6` scopes are backed by the source manifests above.
- Unstarred CET entries are treated as both `cet4` and `cet6` scope for EngGo retrieval, because CET6 preparation includes the shared CET vocabulary base plus the star-marked CET6 extension.
- `postgrad` is intentionally absent from this dataset until an entry-level, source-checkable postgrad vocabulary file is available. The NEEA 2022 英语（二）大纲 page confirms the book contains `附录1 词汇表`, but the public page only exposes cover/catalog images rather than a machine-readable vocabulary appendix.

## Current Slice

- This first source-backed smoke slice reuses EngGo's manually reviewed confusing-word entries and retags their exam scopes against the official source lemma manifests.
- It is deliberately smaller than the eventual 300-800 word dev dataset. Its purpose is to unblock loader/seed validation without fabricating entries, then support the next Task 3/4 retrieval and answer-style work.
