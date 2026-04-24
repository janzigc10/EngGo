# Exam Vocabulary Source Lemmas

This directory stores machine-extracted lemma forms from confirmed public exam-scope documents. These files are provenance aids for development smoke datasets; they are not EngGo teaching content.

## Sources

- `gaokao-2020-lemmas.txt`
  - Source: 教育部《普通高中英语课程标准（2017年版2020年修订）》附录 2 词汇表。
  - Official entry page: https://www.moe.gov.cn/srcsite/A26/s8001/202006/t20200603_462199.html
  - Retrieval date: 2026-04-24.
  - Notes: the source lists word forms only, without POS or Chinese meanings.
- `cet-2016-lemmas.tsv`
  - Source: 中国教育考试网《全国大学英语四、六级考试大纲（2016年修订版）》词表。
  - Official entry page: https://cet.neea.edu.cn/xhtml1/folder/16113/1588-1.htm
  - Official PDF: https://cet.neea.edu.cn/res/Home/1704/55b02330ac17274664f06d9d3db8249d.pdf
  - Retrieval date: 2026-04-24.
  - Notes: `sourceScope=cet4` means the unstarred CET list; EngGo treats those words as in-scope for both CET4 and CET6. `sourceScope=cet6-extra` means the star-marked CET6-only extension.

## Current Gap

Postgrad vocabulary remains source-blocked for entry-level ingestion. The current official NEEA page for the 2022 英语（二）大纲 confirms an appendix vocabulary list in the book images, but does not expose a machine-readable word list. Do not assign `postgrad` scope in `real-smoke` until an entry-level source is available.
