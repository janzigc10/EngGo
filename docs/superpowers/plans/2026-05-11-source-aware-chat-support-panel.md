# Source-Aware Chat Support Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make grounded chat support panels and collection notes distinguish structured entries, source-lemma hits, and external dictionary basic profiles.

**Architecture:** Keep the existing chat workspace and support-panel layout. Add small source-summary helpers in the chat UI layer, extend the TypeScript candidate contract with optional source metadata, and update collection-note formatting without touching retrieval or provider behavior.

**Tech Stack:** Next.js, React 19, TypeScript, Vitest + Testing Library, existing localStorage collection store.

---

### Task 1: Source-Aware Support Panel Tests

**Files:**
- Modify: `src/components/chat/chat-workspace.test.tsx`
- Modify: `docs/superpowers/plans/2026-05-11-source-aware-chat-support-panel.md`

- [x] **Step 1: Add failing source-lemma UI test**

Add a chat workspace test that returns a grounded source-lemma answer for `accent`:

```ts
grounding: {
  activeExamTarget: "cet4",
  activeExamTargetLabel: "CET-4",
  query: "accent",
  queryMode: "direct_lookup",
  answerStyle: "standard_lookup",
  resolution: "resolved",
  noMatchReason: null,
  matchType: "source_lemma_exact",
  mainAnswer: [
    {
      entryId: "source-lemma:accent",
      lemma: "accent",
      meaningsZh: [],
      matchedAlias: null,
      scopeCodes: ["cet4", "cet6"],
      inScope: true,
      reason: "source lemma exact match",
      score: 18,
      sourceKind: "source_lemma",
    },
  ],
  confusionBoundary: [],
  scopeReminder: "scope",
  followUpPrompt: "follow-up",
  comparisonView: null,
  rootFamilyView: null,
}
```

Assert that the rendered panel contains `来源词表词` and `还不是 EngGo 人工结构化词条`.

- [x] **Step 2: Add failing external dictionary UI test**

Add a chat workspace test for `make up` with `matchType: "external_dictionary_exact"` and `sourceKind: "external_dictionary_basic"`.

Assert that the rendered panel contains `外部基础释义` and `来自外部基础词典`.

- [x] **Step 3: Run tests and confirm they fail**

Run:

```powershell
corepack pnpm test src/components/chat/chat-workspace.test.tsx
```

Expected: fails because the source-aware labels do not exist yet.

- [x] **Step 4: Update this plan task status**

After the red tests are observed, mark completed steps in this plan.

### Task 2: Support Panel Implementation

**Files:**
- Modify: `src/features/retrieval/types.ts`
- Modify: `src/components/chat/message-thread.tsx`
- Modify: `docs/superpowers/plans/2026-05-11-source-aware-chat-support-panel.md`

- [x] **Step 1: Extend candidate metadata type**

Add optional `reviewStatus?: "unreviewed"` to `RetrievalCandidate` so UI code can safely accept current and future external dictionary metadata.

- [x] **Step 2: Add source-summary helpers**

In `message-thread.tsx`, add helpers that classify resolved grounding:

- `external_dictionary_basic` or `external_dictionary_exact` -> external dictionary summary
- `source_lemma` or `source_lemma_exact` -> source list summary
- otherwise -> structured summary

- [x] **Step 3: Render source explanation only when needed**

Keep the existing `命中状态` label. Add a `来源说明` block only for source-lemma and external dictionary answers.

- [x] **Step 4: Run chat workspace tests**

Run:

```powershell
corepack pnpm test src/components/chat/chat-workspace.test.tsx
```

Expected: pass.

- [x] **Step 5: Update this plan task status**

Mark completed steps in this plan.

### Task 3: Collection Note Tests And Implementation

**Files:**
- Modify: `src/components/chat/answer-actions.test.tsx`
- Modify: `src/components/chat/answer-actions.tsx`
- Modify: `docs/superpowers/plans/2026-05-11-source-aware-chat-support-panel.md`

- [x] **Step 1: Add failing source-only collection note test**

Render `AnswerActions` with a single `sourceKind: "source_lemma"` candidate that has no meanings. Assert that the UI shows `来源词表命中，待补结构化释义` and does not show `source lemma exact match`.

- [x] **Step 2: Add failing external dictionary collection note test**

Render `AnswerActions` with a single `sourceKind: "external_dictionary_basic"` candidate. Assert that the note starts with `外部基础词典释义：`.

- [x] **Step 3: Run tests and confirm they fail**

Run:

```powershell
corepack pnpm test src/components/chat/answer-actions.test.tsx
```

Expected: fails because current note formatting falls back to raw `reason`.

- [x] **Step 4: Implement learner-facing note formatting**

Update `buildCollectionNote` to branch on `candidate.sourceKind`.

- [x] **Step 5: Run answer action tests**

Run:

```powershell
corepack pnpm test src/components/chat/answer-actions.test.tsx
```

Expected: pass.

- [x] **Step 6: Update this plan task status**

Mark completed steps in this plan.

### Task 4: Verification And Handoff

**Files:**
- Modify: `progress.md`
- Modify: `docs/superpowers/plans/2026-05-11-source-aware-chat-support-panel.md`

- [x] **Step 1: Run focused component tests**

Run:

```powershell
corepack pnpm test src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx
```

Expected: pass.

- [x] **Step 2: Run focused lint**

Run:

```powershell
corepack pnpm lint src/components/chat/message-thread.tsx src/components/chat/answer-actions.tsx src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx src/features/retrieval/types.ts
```

Expected: pass.

- [x] **Step 3: Update progress**

Record the UI behavior, verification commands, and remaining next step in `progress.md`.

- [x] **Step 4: Commit**

Commit the source-aware support panel slice.
