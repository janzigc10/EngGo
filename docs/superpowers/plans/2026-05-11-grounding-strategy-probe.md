# Grounding Strategy Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small evaluation probe that compares current grounded answers, direct model answers, and light-grounding model answers on broad student-style vocabulary questions.

**Architecture:** Keep product runtime unchanged. Add a script-only evaluation path that loads the existing exam source lemma list and structured `real-smoke` entries, builds a lightweight candidate pool for broad lookalike/prefix questions, calls the configured provider for direct and light-grounded answers, optionally calls local `/api/chat` for the current grounded answer, then writes JSON and Markdown reports under `output/grounding-strategy-probe/`.

**Tech Stack:** TypeScript, tsx scripts, Vitest, existing OpenAI-compatible provider configuration, existing source lemma and ECDICT utilities.

---

### Task 1: Define Probe Cases And Candidate Builder

**Files:**
- Create: `scripts/lib/grounding-strategy-probe.ts`
- Create: `scripts/lib/grounding-strategy-probe.test.ts`
- Modify: `docs/superpowers/plans/2026-05-11-grounding-strategy-probe.md`

- [x] **Step 1: Add student-style broad cases**

Create 12-16 cases that ask like a real learner: broad lookalikes, prefix clusters, uncertain root/prefix questions, and meaning-adjacent confusion.

- [x] **Step 2: Build lightweight candidate selection**

Load source lemmas and structured entries, then select candidates by exact token, prefix hints, substring, edit distance, and common-prefix similarity.

- [x] **Step 3: Add unit tests for broad candidate behavior**

Test that `commend/comment/command` and `re/con` style questions produce useful candidate pools without requiring handcrafted confusion groups.

- [x] **Step 4: Run the focused tests**

Run:

```powershell
corepack pnpm test scripts/lib/grounding-strategy-probe.test.ts
```

Expected: pass.

### Task 2: Add Provider And Report Runner

**Files:**
- Create: `scripts/run-grounding-strategy-probe.ts`
- Modify: `package.json`
- Modify: `docs/superpowers/plans/2026-05-11-grounding-strategy-probe.md`

- [x] **Step 1: Call direct model and light-grounding model**

For each case, call the configured provider twice: once without candidate grounding and once with the lightweight candidate pool.

- [x] **Step 2: Optionally call current grounded app route**

If `--current-base-url` is provided, call `${baseUrl}/api/chat` and include the current runtime answer and grounding summary.

- [x] **Step 3: Write JSON and Markdown reports**

Write a machine-readable JSON report and a human-readable Markdown report under `output/grounding-strategy-probe/`.

- [x] **Step 4: Add package script**

Add:

```json
"eval:grounding-strategy:probe": "tsx scripts/run-grounding-strategy-probe.ts"
```

### Task 3: Run Probe And Record Handoff

**Files:**
- Modify: `progress.md`
- Modify: `docs/README.md`
- Modify: `docs/superpowers/plans/2026-05-11-grounding-strategy-probe.md`

- [x] **Step 1: Run focused tests and lint**

Run:

```powershell
corepack pnpm test scripts/lib/grounding-strategy-probe.test.ts
corepack pnpm lint scripts/lib/grounding-strategy-probe.ts scripts/lib/grounding-strategy-probe.test.ts scripts/run-grounding-strategy-probe.ts
```

Expected: pass.

- [x] **Step 2: Run a real provider probe**

Run the probe with the current provider configuration. If the local app stack is healthy, include `--current-base-url http://127.0.0.1:3000`; otherwise run direct vs light only and mark current grounded as skipped.

- [x] **Step 3: Summarize results for product direction**

Update `progress.md` with the report path, key findings, and recommended next step. Add the plan to `docs/README.md`.
