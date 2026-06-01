# ECDICT Wordbook Dataset

`entries.json` is a compact client-facing wordbook dataset generated from:

- `output/external-dictionaries/ecdict.csv`
- `data/exam-vocab/source-lemmas/gaokao-2020-lemmas.txt`
- `data/exam-vocab/source-lemmas/cet-2016-lemmas.tsv`

Regenerate with:

```powershell
corepack pnpm exec tsx scripts\generate-ecdict-wordbook.ts
```

The full ECDICT CSV stays in ignored `output/`; this directory stores only the source-backed subset used by the Learn / Review UI.
