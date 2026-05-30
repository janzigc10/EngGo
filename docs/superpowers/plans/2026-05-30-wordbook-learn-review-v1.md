# Wordbook Learn/Review V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build the first usable wordbook-driven Learn/Review loop: a CET-6 foundation wordbook, local progress, 10-word sessions, staged Learn checks, hidden-recall Review, wrong-answer requeue, and persisted counts.

**Architecture:** Keep this entirely in the Next/React client layer. Add a focused `src/features/wordbook/` module for static wordbook data, localStorage progress, distractor generation, pure session state machines, and UI components. Do not change `/api/chat`, FastAPI, Prisma schema, provider prompts, or collection storage.

**Tech Stack:** Next 16, React 19, TypeScript, localStorage, Vitest, Testing Library, Tailwind CSS.

---

## Source Spec

- Product spec: `docs/superpowers/specs/2026-05-30-wordbook-learn-review-state-machine-design.md`
- Current docs handoff: `progress.md`
- Current route placeholders: `src/features/collections/study-panels.tsx`

## Guardrails

- Do not copy 不背单词 proprietary content, examples, icons, audio, mascots, exact visual skin, or proprietary wording.
- Do not import or invent a complete commercial CET-6 / postgrad wordbook.
- Do not use model calls for Learn/Review V1.
- Do not modify backend `/api/chat`.
- Do not mutate `enggo.collectedWords`; wordbook progress uses its own storage key.
- Before implementation commits, ensure the existing V3 diff is either committed or intentionally kept separate. If the worktree is still dirty with unrelated files, stage only the files listed in the current task.

## File Structure

| File | Responsibility |
|---|---|
| `src/features/wordbook/wordbook-types.ts` | Shared IDs, entry, progress, session, and action types. |
| `src/features/wordbook/wordbook-data.ts` | Build `cet6-foundation-v1` from `data/exam-vocab/real-smoke/entries.json`. |
| `src/features/wordbook/wordbook-data.test.ts` | Verify scope filtering, content blocking, and metadata. |
| `src/features/wordbook/wordbook-progress-store.ts` | LocalStorage repository and subscription events for progress. |
| `src/features/wordbook/wordbook-progress-store.test.ts` | Verify hydrate/write/reset/missing-lemma behavior. |
| `src/features/wordbook/distractors.ts` | Deterministic 4-option meaning choice builder. |
| `src/features/wordbook/distractors.test.ts` | Verify correct option, same-POS preference, duplicate exclusion, and deterministic shuffle. |
| `src/features/wordbook/session-engine.ts` | Pure Learn/Review session state machine. |
| `src/features/wordbook/session-engine.test.ts` | Verify staged pass, wrong requeue, review remembered, review forgotten, and scheduling. |
| `src/features/wordbook/wordbook-dashboard.tsx` | Dashboard card with Learn/Review counts and entry buttons. |
| `src/features/wordbook/wordbook-dashboard.test.tsx` | Component tests for counts and entry actions. |
| `src/features/wordbook/study-session.tsx` | Learn/Review card UI and user interaction bridge to the engine/store. |
| `src/features/wordbook/study-session.test.tsx` | Component tests for Learn and Review user flows. |
| `src/features/collections/study-panels.tsx` | Replace Learn/Review placeholders with wordbook panels; keep Collections behavior stable. |
| `src/app/learn/learn-client.tsx` | Point dynamic import at the new Learn panel if panels move. |
| `src/app/review/review-client.tsx` | Point dynamic import at the new Review panel if panels move. |
| `docs/README.md` | Mark this plan as the active implementation plan. |
| `progress.md` | Keep the rolling handoff current after each completed task. |

## Task 0: Activate The Plan And Protect The Worktree

**Files:**
- Modify: `docs/superpowers/plans/2026-05-30-wordbook-learn-review-v1.md`
- Modify: `progress.md`

- [x] **Step 1: Confirm the active spec and plan**

Read:

```powershell
Get-Content -Raw -Encoding UTF8 docs\superpowers\specs\2026-05-30-wordbook-learn-review-state-machine-design.md
Get-Content -Raw -Encoding UTF8 docs\superpowers\plans\2026-05-30-wordbook-learn-review-v1.md
```

Expected: the plan matches the state-machine spec and starts from data/state modules before UI.

- [x] **Step 2: Check worktree state**

Run:

```powershell
git status --short
```

Expected: identify whether V3 files are still dirty. If unrelated dirty files exist, do not stage or revert them.

- [x] **Step 3: Update this task checkbox**

Change this task's completed steps from `- [x]` to `- [x]` as they finish.

- [x] **Step 4: Update progress handoff**

Update `progress.md` with the fact that Wordbook Learn/Review V1 implementation has started and Task 0 is complete. Keep old completed/obsolete next steps compressed.

- [x] **Step 5: Commit only if the worktree is isolated**

If the V3 diff has already been committed and this plan activation is isolated:

```powershell
git add docs\superpowers\plans\2026-05-30-wordbook-learn-review-v1.md progress.md
git commit -m "docs: start wordbook learn review plan"
```

Expected: commit succeeds.

If unrelated dirty files remain, skip commit and record why in `progress.md`.

## Task 1: Add Wordbook Types And Static CET-6 Data Adapter

**Files:**
- Create: `src/features/wordbook/wordbook-types.ts`
- Create: `src/features/wordbook/wordbook-data.ts`
- Create: `src/features/wordbook/wordbook-data.test.ts`

- [x] **Step 1: Write failing data adapter tests**

Create `src/features/wordbook/wordbook-data.test.ts` with tests for:

- `getDefaultWordbook()` returns `id="cet6-foundation-v1"`.
- every entry includes `cet6` in `examScopes`.
- entries without `meaningsZh` are excluded or marked blocked.
- the wordbook label does not claim to be a complete official CET-6 wordbook.

Example assertions:

```ts
import { describe, expect, it } from "vitest";

import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";

describe("wordbook data", () => {
  it("builds a CET-6 foundation wordbook from source-backed entries", () => {
    const wordbook = getDefaultWordbook();

    expect(wordbook.id).toBe("cet6-foundation-v1");
    expect(wordbook.label).toContain("CET-6");
    expect(wordbook.label).not.toContain("完整");
    expect(wordbook.entries.length).toBeGreaterThan(100);
    expect(wordbook.entries.every((entry) => entry.examScopes.includes("cet6"))).toBe(true);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run:

```powershell
corepack pnpm test src\features\wordbook\wordbook-data.test.ts
```

Expected: FAIL because the module does not exist.

- [x] **Step 3: Add shared types**

Create `src/features/wordbook/wordbook-types.ts`:

```ts
export type WordbookId = "cet6-foundation-v1";

export type WordbookEntry = {
  id: string;
  lemma: string;
  aliases: string[];
  pos: string[];
  meaningsZh: string[];
  examScopes: Array<"gaokao" | "cet4" | "cet6" | "postgrad">;
  examples: string[];
  collocations: string[];
};

export type Wordbook = {
  id: WordbookId;
  label: string;
  sourceLabel: string;
  entries: WordbookEntry[];
};
```

- [x] **Step 4: Implement the data adapter**

Create `src/features/wordbook/wordbook-data.ts`. Import `data/exam-vocab/real-smoke/entries.json`, normalize only valid CET-6 entries, and export:

- `defaultWordbookId`
- `getDefaultWordbook()`
- `findWordbookEntry(lemma)`
- `listWordbookEntries()`

Implementation rules:

- Sort entries by `lemma`.
- Trim lemma and meanings.
- Exclude entries with empty lemma or no Chinese meanings.
- Keep `examples` and `collocations` when present.
- Do not include `postgrad`-only entries.

- [x] **Step 5: Run data tests**

Run:

```powershell
corepack pnpm test src\features\wordbook\wordbook-data.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit Task 1 if isolated**

```powershell
git add src\features\wordbook\wordbook-types.ts src\features\wordbook\wordbook-data.ts src\features\wordbook\wordbook-data.test.ts docs\superpowers\plans\2026-05-30-wordbook-learn-review-v1.md progress.md
git commit -m "feat: add wordbook data adapter"
```

Expected: commit includes only Task 1 files plus plan/progress checkbox updates.

## Task 2: Add Local Wordbook Progress Store

**Files:**
- Modify: `src/features/wordbook/wordbook-types.ts`
- Create: `src/features/wordbook/wordbook-progress-store.ts`
- Create: `src/features/wordbook/wordbook-progress-store.test.ts`

- [x] **Step 1: Write failing store tests**

Cover:

- empty storage hydrates to default progress for all wordbook entries.
- `saveWordProgress()` persists one lemma under `enggo.wordbookProgress.v1`.
- invalid JSON returns empty progress rather than throwing.
- progress records for lemmas no longer in the wordbook are ignored in dashboard snapshots.
- subscription listeners fire after writes.

- [x] **Step 2: Run tests to verify they fail**

```powershell
corepack pnpm test src\features\wordbook\wordbook-progress-store.test.ts
```

Expected: FAIL because the store does not exist.

- [x] **Step 3: Extend types**

Add to `wordbook-types.ts`:

```ts
export type WordStudyStatus =
  | "unseen"
  | "learning"
  | "passed"
  | "reviewing"
  | "lapsed"
  | "blockedContent";

export type MasteryDots = 0 | 1 | 2 | 3;
export type ReviewStrength = 0 | 1 | 2 | 3;

export type WordStudyProgress = {
  wordbookId: WordbookId;
  lemma: string;
  status: WordStudyStatus;
  masteryDots: MasteryDots;
  reviewStrength: ReviewStrength;
  seenCount: number;
  correctCount: number;
  wrongCount: number;
  lastSeenAt?: string;
  nextReviewAt?: string;
  updatedAt: string;
};
```

- [x] **Step 4: Implement localStorage repository**

Create `wordbook-progress-store.ts` with:

- storage key `enggo.wordbookProgress.v1`
- active wordbook key `enggo.activeWordbook.v1`
- `loadProgressRecords()`
- `saveWordProgress(progress)`
- `getProgressForEntry(entry)`
- `buildWordbookProgressSnapshot(wordbook, now)`
- `subscribeWordbookProgressChanges(listener)`

Snapshot counts:

- `total`: valid wordbook entries.
- `passed`: `status === "passed"` or due review states that have been passed before.
- `learnable`: `unseen`, `learning`, or `lapsed` entries.
- `dueReview`: passed/reviewing entries where `nextReviewAt <= now`.
- `blocked`: `blockedContent`.

- [x] **Step 5: Run store tests**

```powershell
corepack pnpm test src\features\wordbook\wordbook-progress-store.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit Task 2 if isolated**

```powershell
git add src\features\wordbook\wordbook-types.ts src\features\wordbook\wordbook-progress-store.ts src\features\wordbook\wordbook-progress-store.test.ts docs\superpowers\plans\2026-05-30-wordbook-learn-review-v1.md progress.md
git commit -m "feat: add wordbook progress store"
```

## Task 3: Add Deterministic Distractor Builder

**Files:**
- Create: `src/features/wordbook/distractors.ts`
- Create: `src/features/wordbook/distractors.test.ts`

- [x] **Step 1: Write failing distractor tests**

Cover:

- output has exactly 4 options when enough candidates exist.
- exactly one option is correct.
- same-POS distractors are preferred.
- duplicate Chinese meaning strings are excluded.
- shuffle order is deterministic for the same seed and changes for a different seed.
- insufficient distractors returns a blocked result.

- [x] **Step 2: Run tests to verify they fail**

```powershell
corepack pnpm test src\features\wordbook\distractors.test.ts
```

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement distractor result types**

Add types in `distractors.ts`:

```ts
export type MeaningChoiceOption = {
  id: string;
  lemma: string;
  meaningZh: string;
  partOfSpeech?: string;
  isCorrect: boolean;
};

export type MeaningChoiceResult =
  | { kind: "ready"; options: MeaningChoiceOption[]; correctOptionId: string }
  | { kind: "blocked"; reason: "missing_correct_meaning" | "insufficient_distractors" };
```

- [x] **Step 4: Implement deterministic choice building**

Export `buildMeaningChoice({ entry, allEntries, seed })`.

Rules:

- correct meaning is `entry.meaningsZh[0]`.
- distractors come from same wordbook, excluding same lemma.
- prefer same first POS.
- exclude duplicate `meaningZh`.
- use a simple stable hash / seeded shuffle; do not use `Math.random()`.

- [x] **Step 5: Run distractor tests**

```powershell
corepack pnpm test src\features\wordbook\distractors.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit Task 3 if isolated**

```powershell
git add src\features\wordbook\distractors.ts src\features\wordbook\distractors.test.ts docs\superpowers\plans\2026-05-30-wordbook-learn-review-v1.md progress.md
git commit -m "feat: add wordbook distractors"
```

## Task 4: Add Learn Session Engine

**Files:**
- Modify: `src/features/wordbook/wordbook-types.ts`
- Create: `src/features/wordbook/session-engine.ts`
- Create: `src/features/wordbook/session-engine.test.ts`

- [x] **Step 1: Write failing Learn engine tests**

Cover:

- starts with up to 10 `unseen` / `learning` entries.
- `recognitionChoice` correct adds first mastery dot and moves to `detailReveal`.
- wrong choice moves to answer reveal and requeues the word.
- `guidedRecall` `认识` adds second dot.
- `finalRecall` `认识` adds third dot and returns a persisted `passed` progress update.
- a word with repeated failures does not block session completion forever.

- [x] **Step 2: Run Learn tests to verify they fail**

```powershell
corepack pnpm test src\features\wordbook\session-engine.test.ts
```

Expected: FAIL because the engine does not exist.

- [x] **Step 3: Add session types**

Add types for:

- `StudyMode = "learn" | "review"`
- `StudyCardStage`
- `StudySessionState`
- `StudySessionAction`
- `StudyEngineResult`

Keep engine state serializable and UI-independent.

- [x] **Step 4: Implement Learn session creation**

Export `createLearnSession({ wordbook, progressRecords, now, sessionId })`.

Rules:

- pick up to 10 entries with status `unseen`, missing progress, `learning`, or `lapsed`.
- skip `blockedContent`.
- initialize current card at `recognitionChoice`.
- track target lemmas separately from raw card exposures.

- [x] **Step 5: Implement Learn reducers**

Export `applyStudyAction(state, action, helpers)`.

Required actions:

- `chooseMeaning`
- `showAnswer`
- `continueFromDetail`
- `markKnown`
- `markUnknown`
- `nextCard`

Requeue rule:

- prefer after 3 other card exposures.
- if not enough cards remain, requeue at the end.
- after 3 failed attempts, leave status `learning` and let session complete.

- [x] **Step 6: Run Learn engine tests**

```powershell
corepack pnpm test src\features\wordbook\session-engine.test.ts
```

Expected: Learn tests PASS.

- [x] **Step 7: Commit Task 4 if isolated**

```powershell
git add src\features\wordbook\wordbook-types.ts src\features\wordbook\session-engine.ts src\features\wordbook\session-engine.test.ts docs\superpowers\plans\2026-05-30-wordbook-learn-review-v1.md progress.md
git commit -m "feat: add learn session engine"
```

## Task 5: Add Review Session Engine And Scheduling

**Files:**
- Modify: `src/features/wordbook/session-engine.ts`
- Modify: `src/features/wordbook/session-engine.test.ts`
- Modify: `src/features/wordbook/wordbook-progress-store.ts`
- Modify: `src/features/wordbook/wordbook-progress-store.test.ts`

- [x] **Step 1: Write failing Review engine tests**

Cover:

- review session selects due passed/reviewing words.
- first card starts at `hiddenSelfRecall`.
- `认识` shows detail and then produces a passed review update.
- `模糊` shows detail and rechecks with final recall.
- `忘记了` shows detail, routes through recognition choice, and reduces review strength.
- schedule offsets are strength 0 today, 1 tomorrow, 2 in 3 days, 3 in 7 days.

- [x] **Step 2: Run Review tests to verify they fail**

```powershell
corepack pnpm test src\features\wordbook\session-engine.test.ts src\features\wordbook\wordbook-progress-store.test.ts
```

Expected: FAIL on review cases.

- [x] **Step 3: Implement review scheduling helper**

Add a pure helper in `wordbook-progress-store.ts` or `session-engine.ts`:

```ts
export function getNextReviewAt(now: Date, reviewStrength: ReviewStrength): string
```

Use local-day offsets from the spec.

- [x] **Step 4: Implement Review session creation**

Export `createReviewSession({ wordbook, progressRecords, now, sessionId })`.

Rules:

- include due records with `nextReviewAt <= now`.
- include `lapsed` words as due.
- start at `hiddenSelfRecall`.
- keep target word count at up to 10.

- [x] **Step 5: Implement Review reducer branches**

Actions:

- `markKnown` from `hiddenSelfRecall` -> detail -> pass on `nextCard`.
- `markFuzzy` -> detail -> final recall later.
- `markForgotten` -> detail -> recognition choice later.
- `markUnknown` / `wrong choice` -> lapsed and requeue.

- [x] **Step 6: Run Review engine tests**

```powershell
corepack pnpm test src\features\wordbook\session-engine.test.ts src\features\wordbook\wordbook-progress-store.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit Task 5 if isolated**

```powershell
git add src\features\wordbook\session-engine.ts src\features\wordbook\session-engine.test.ts src\features\wordbook\wordbook-progress-store.ts src\features\wordbook\wordbook-progress-store.test.ts docs\superpowers\plans\2026-05-30-wordbook-learn-review-v1.md progress.md
git commit -m "feat: add review session engine"
```

## Task 6: Build Wordbook Dashboard For Learn And Review Routes

**Files:**
- Create: `src/features/wordbook/wordbook-dashboard.tsx`
- Create: `src/features/wordbook/wordbook-dashboard.test.tsx`
- Modify: `src/features/collections/study-panels.tsx`
- Modify: `src/app/learn/learn-client.tsx` if imports move
- Modify: `src/app/review/review-client.tsx` if imports move

- [x] **Step 1: Write failing dashboard component tests**

Cover:

- `/learn` panel shows `CET-6 基础词书 V1`.
- dashboard shows total, learned, learnable, due review counts.
- Learn button is enabled when learnable count > 0.
- Review button is disabled or quiet when due review count is 0.
- postgrad active target shows the boundary note instead of fabricating a postgrad wordbook.

- [x] **Step 2: Run dashboard tests to verify they fail**

```powershell
corepack pnpm test src\features\wordbook\wordbook-dashboard.test.tsx
```

Expected: FAIL because component does not exist.

- [x] **Step 3: Implement dashboard component**

Create `WordbookDashboard` with props:

```ts
type WordbookDashboardProps = {
  mode: "learn" | "review";
  onStartSession: (mode: "learn" | "review") => void;
};
```

Use `useSyncExternalStore` with `subscribeWordbookProgressChanges`.

- [x] **Step 4: Replace placeholders**

In `study-panels.tsx`, replace `LearnPanel` and `ReviewPanel` placeholder content with dashboard mounts.

Keep `CollectionsPanel` behavior untouched.

- [x] **Step 5: Run dashboard tests**

```powershell
corepack pnpm test src\features\wordbook\wordbook-dashboard.test.tsx src\features\collections\study-panels.test.tsx
```

Expected: PASS.

- [x] **Step 6: Commit Task 6 if isolated**

```powershell
git add src\features\wordbook\wordbook-dashboard.tsx src\features\wordbook\wordbook-dashboard.test.tsx src\features\collections\study-panels.tsx src\app\learn\learn-client.tsx src\app\review\review-client.tsx docs\superpowers\plans\2026-05-30-wordbook-learn-review-v1.md progress.md
git commit -m "feat: add wordbook dashboard"
```

## Task 7: Build Learn/Review Study Session UI

**Files:**
- Create: `src/features/wordbook/study-session.tsx`
- Create: `src/features/wordbook/study-session.test.tsx`
- Modify: `src/features/wordbook/wordbook-dashboard.tsx`
- Modify: `src/features/collections/study-panels.tsx`

- [x] **Step 1: Write failing Learn UI tests**

Cover:

- Start Learn opens a session card.
- recognition card shows word and exactly 4 options.
- choosing the correct option moves to detail reveal.
- detail reveal can continue to guided recall.
- final `认识` persists passed progress after 3 dots.
- wrong option reveals answer and requeues the same word.

- [x] **Step 2: Write failing Review UI tests**

Seed localStorage with a due passed word and cover:

- Start Review opens hidden self recall.
- `认识` shows detail and then passes review.
- `忘记了` shows detail and then routes to recognition choice.

- [x] **Step 3: Run UI tests to verify they fail**

```powershell
corepack pnpm test src\features\wordbook\study-session.test.tsx
```

Expected: FAIL because session UI does not exist.

- [x] **Step 4: Implement session component shell**

Create `StudySession` props:

```ts
type StudySessionProps = {
  mode: "learn" | "review";
  onExit: () => void;
};
```

Render:

- top progress `passedTargets / totalTargets`.
- word.
- pronunciation placeholder only if data exists; otherwise omit.
- 3 mastery dots.
- stage-specific body.
- bottom actions.

- [x] **Step 5: Wire engine to store**

On each persisted update:

- call `saveWordProgress`.
- advance session state.
- let dashboard counts refresh through progress listeners.

- [x] **Step 6: Keep UI focused**

Style rules:

- no marketing hero.
- no nested cards.
- stable action button dimensions.
- mobile width 390px must not overflow.
- use short button labels: `认识`, `模糊`, `忘记了`, `看答案`, `继续`, `下一词`, `记错了`.

- [x] **Step 7: Run session UI tests**

```powershell
corepack pnpm test src\features\wordbook\study-session.test.tsx src\features\wordbook\wordbook-dashboard.test.tsx
```

Expected: PASS.

- [x] **Step 8: Commit Task 7 if isolated**

```powershell
git add src\features\wordbook\study-session.tsx src\features\wordbook\study-session.test.tsx src\features\wordbook\wordbook-dashboard.tsx src\features\collections\study-panels.tsx docs\superpowers\plans\2026-05-30-wordbook-learn-review-v1.md progress.md
git commit -m "feat: add wordbook study sessions"
```

## Task 8: Add Progress Panel Integration And Regression Coverage

**Files:**
- Modify: `src/features/collections/study-panels.tsx`
- Create or modify: `src/features/wordbook/wordbook-progress-summary.test.tsx`
- Modify: `src/features/collections/study-panels.test.tsx`

- [x] **Step 1: Write failing progress summary tests**

Cover:

- Progress panel shows wordbook learned / total count.
- Progress panel shows due review count.
- Existing collection total is still visible.

- [x] **Step 2: Run progress tests to verify they fail**

```powershell
corepack pnpm test src\features\collections\study-panels.test.tsx src\features\wordbook\wordbook-progress-summary.test.tsx
```

Expected: FAIL on missing wordbook progress summary.

- [x] **Step 3: Implement ProgressPanel summary**

Add a compact wordbook summary to `ProgressPanel`:

- active wordbook label.
- learned / total.
- due review.
- blocked content count if any.

Do not remove existing collection count.

- [x] **Step 4: Run collection regression tests**

```powershell
corepack pnpm test src\features\collections\collection-store.test.ts src\features\collections\study-panels.test.tsx src\components\chat\answer-actions.test.tsx
```

Expected: PASS. Existing collection add/list/delete behavior remains unchanged.

- [x] **Step 5: Commit Task 8 if isolated**

```powershell
git add src\features\collections\study-panels.tsx src\features\collections\study-panels.test.tsx src\features\wordbook\wordbook-progress-summary.test.tsx docs\superpowers\plans\2026-05-30-wordbook-learn-review-v1.md progress.md
git commit -m "feat: show wordbook progress"
```

## Task 9: Focused Verification, Manual QA, And Handoff Docs

**Files:**
- Modify: `docs/README.md`
- Modify: `progress.md`
- Modify: `docs/superpowers/plans/2026-05-30-wordbook-learn-review-v1.md`

- [x] **Step 1: Run focused wordbook tests**

```powershell
corepack pnpm test src\features\wordbook\wordbook-data.test.ts src\features\wordbook\wordbook-progress-store.test.ts src\features\wordbook\distractors.test.ts src\features\wordbook\session-engine.test.ts src\features\wordbook\wordbook-dashboard.test.tsx src\features\wordbook\study-session.test.tsx
```

Expected: all wordbook tests PASS.

- [x] **Step 2: Run collection/chat regression tests**

```powershell
corepack pnpm test src\features\collections\collection-store.test.ts src\features\collections\study-panels.test.tsx src\components\chat\answer-actions.test.tsx src\components\chat\chat-workspace.test.tsx
```

Expected: PASS. This protects existing collection and chat follow-up behavior.

- [x] **Step 3: Run focused lint**

```powershell
corepack pnpm lint -- src\features\wordbook src\features\collections\study-panels.tsx src\app\learn\learn-client.tsx src\app\review\review-client.tsx
```

Expected: PASS.

- [x] **Step 4: Run whitespace check**

```powershell
git diff --check
```

Expected: no whitespace errors. Windows LF/CRLF warnings are acceptable if there are no actual whitespace errors.

- [x] **Step 5: Run browser QA**

Start dev server only after the focused tests pass:

```powershell
corepack pnpm dev
```

Open:

- `http://127.0.0.1:3000/learn`
- `http://127.0.0.1:3000/review`
- `http://127.0.0.1:3000/progress`

Manual checks:

- 390px mobile width has no horizontal overflow.
- Learn session can pass one word through 3 dots.
- Review session shows empty/due state correctly.
- After reload, counts persist.
- Collections page still lists and deletes existing collected words.

- [x] **Step 6: Update docs and progress**

Update:

- `docs/README.md`: mark plan completed and keep spec as current design.
- `progress.md`: compress old next steps and record verification outputs.

- [x] **Step 7: Commit Task 9 if isolated**

```powershell
git add docs\README.md progress.md docs\superpowers\plans\2026-05-30-wordbook-learn-review-v1.md
git commit -m "docs: complete wordbook learn review handoff"
```

## Final Acceptance

- [x] `/learn` shows `cet6-foundation-v1` dashboard with total, learned, learnable, and due-review counts.
- [x] Starting Learn opens a 10-word target session from unseen / learning words.
- [x] Learn recognition cards show exactly four Chinese options with one correct answer.
- [x] A new word only becomes passed after three mastery dots.
- [x] Wrong Learn answers reveal the answer and requeue the word.
- [x] `/review` starts due words with hidden self recall and `认识 / 模糊 / 忘记了`.
- [x] Review `认识` passes the word for this review after detail reveal.
- [x] Review `忘记了` routes through detail and lower-confidence testing.
- [x] Wordbook counts persist after reload.
- [x] Existing collections still add, display, and delete correctly.
- [x] No backend, provider, or Prisma changes are required.

## Suggested Final Verification Bundle

Run before marking this plan complete:

```powershell
corepack pnpm test src\features\wordbook\wordbook-data.test.ts src\features\wordbook\wordbook-progress-store.test.ts src\features\wordbook\distractors.test.ts src\features\wordbook\session-engine.test.ts src\features\wordbook\wordbook-dashboard.test.tsx src\features\wordbook\study-session.test.tsx src\features\collections\collection-store.test.ts src\features\collections\study-panels.test.tsx src\components\chat\answer-actions.test.tsx src\components\chat\chat-workspace.test.tsx
corepack pnpm lint -- src\features\wordbook src\features\collections\study-panels.tsx src\app\learn\learn-client.tsx src\app\review\review-client.tsx
git diff --check
```

Expected:

- all listed Vitest files pass.
- focused lint passes.
- no whitespace errors.

## Execution Note

This plan intentionally starts with pure data/state modules. If a future executor wants to jump straight to the UI, stop and come back here: the state machine is the real product risk.
