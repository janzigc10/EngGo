# Real-Smoke Vocabulary Dataset

## Source Contract

- Source name: TODO - fill with the confirmed vocabulary source name before adding data files.
- Source date: TODO - fill with the source publication or retrieval date before adding data files.
- `entries.json`: normalized vocabulary entries using the existing EngGo vocabulary seed schema.
- `confusion-groups.json`: manually confirmed confusing-word groups using the existing EngGo confusion group seed schema.
- `lookalike-smoke-cases.json`: deterministic smoke cases for scope-aware lookalike recall.

## Data Rules

- Do not hand-invent real vocabulary entries. Only normalize entries from confirmed source files or explicit source documents.
- Every entry must include at least one Chinese core meaning in `meaningsZh`.
- Duplicate lemmas across exam scopes must be merged into one entry with multiple `examScopes`, not copied as separate entries.
- Curated confusion groups require human confirmation; do not create them from spelling similarity alone.
- Keep source traceability outside generated normalized files when possible, so future reviewers can verify where each vocabulary slice came from.
