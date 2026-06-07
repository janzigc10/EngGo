# ECDICT Wordbook Dataset

`entries.json` is a compact client-facing wordbook dataset generated from:

- `output/external-dictionaries/ecdict.csv`

The generator reads ECDICT exam tags directly:

- `gk` / `zk` -> `gaokao`
- `cet4` -> `cet4`
- `cet6` -> `cet6`
- `ky` -> `postgrad`

Regenerate with:

```powershell
corepack pnpm exec tsx scripts\generate-ecdict-wordbook.ts
```

The full ECDICT CSV stays in ignored `output/`; this directory stores only the compact tagged subset used by Learn / Review / Progress and chat scope closure.

The JSON stores direct ECDICT scopes only. Learn / Review / Progress and chat apply app-level scope closure when a user selects a wordbook: CET-4 includes Gaokao, CET-6 includes Gaokao + CET-4, and Postgrad includes all lower-level scopes.
