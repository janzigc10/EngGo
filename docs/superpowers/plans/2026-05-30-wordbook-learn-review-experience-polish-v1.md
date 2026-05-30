# Wordbook Learn/Review Experience Polish V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. After each completed task, update this plan and `progress.md`.

**Goal:** Improve the current Wordbook Learn/Review V1 hand-feel without expanding scope: configurable session word counts, Learn failure requeue without downgrading, Review one-light verification, wrong-choice contrast, and tiered Learn details.

**Source spec:** `docs/superpowers/specs/2026-05-30-wordbook-learn-review-experience-polish-v1.md`

**Branch:** continue on `codex/wordbook-learn-review-v1`. Do not merge main during this plan.

**Architecture:** Keep the work client-only in `src/features/wordbook/` plus the existing `/learn` and `/review` entry panels. Do not touch `/api/chat`, FastAPI, Prisma, provider prompts, or `enggo.collectedWords`.

## Guardrails

- Do not do UI visual polish beyond what is needed for the new states to be usable.
- Do not implement a full SRS algorithm.
- Do not add account, cloud sync, daily plan, official full wordbooks, or custom collection wordbooks.
- Do not route Review failures into Learn.
- Do not downgrade Learn failures to an earlier light.
- Progress text must remain completed target count over frozen target count.
- Existing collection behavior and chat behavior must stay unchanged.

## File Map

| File | Expected work |
|------|---------------|
| `src/features/wordbook/wordbook-types.ts` | Add session goal/settings and mistake/contrast stage types. |
| `src/features/wordbook/wordbook-study-settings-store.ts` | New localStorage settings store. |
| `src/features/wordbook/wordbook-study-settings-store.test.ts` | New settings store tests. |
| `src/features/wordbook/wordbook-study-settings-panel.tsx` | New lightweight learning settings UI. |
| `src/features/wordbook/wordbook-dashboard.tsx` | Read settings, expose settings entry, pass target count to sessions. |
| `src/features/wordbook/wordbook-dashboard.test.tsx` | Cover settings entry and configured session counts. |
| `src/features/wordbook/session-engine.ts` | Parameterize target count, Learn failure requeue, Review one-light flow, mistake state. |
| `src/features/wordbook/session-engine.test.ts` | Core state-machine regression tests. |
| `src/features/wordbook/study-session.tsx` | Render wrong-choice contrast and tiered detail content; consume frozen target count. |
| `src/features/wordbook/study-session.test.tsx` | Component flow tests for Learn/Review polish. |
| `src/features/collections/study-panels.tsx` | Pass target count/settings through existing Learn/Review panels if needed. |
| `docs/README.md` | Keep this plan marked active while implementation is in progress. |
| `progress.md` | Rolling handoff after every completed task. |

## Task 0: Activate The Plan And Baseline

**Files:**
- Modify: `docs/superpowers/plans/2026-05-30-wordbook-learn-review-experience-polish-v1.md`
- Modify: `progress.md`

- [x] **Step 1: Re-read the source spec**

Read:

```powershell
Get-Content -Raw -Encoding UTF8 docs\superpowers\specs\2026-05-30-wordbook-learn-review-experience-polish-v1.md
```

Expected: implementation scope is limited to the five agreed areas: settings, target count, Learn failure behavior, Review behavior, wrong-choice contrast, and tiered details.

- [x] **Step 2: Check worktree state**

Run:

```powershell
git status --short --branch
```

Expected: branch is `codex/wordbook-learn-review-v1`; identify any dirty files and do not revert unrelated changes.

- [x] **Step 3: Confirm current regression baseline**

Run focused baseline before changes:

```powershell
corepack pnpm test src\features\wordbook\session-engine.test.ts src\features\wordbook\study-session.test.tsx src\features\wordbook\wordbook-dashboard.test.tsx
```

Expected: tests pass before implementation edits.

- [x] **Step 4: Update progress handoff**

Update `progress.md` to say this polish plan has started and Task 0 is complete. Remove stale next-step language that conflicts with this active plan.

## Task 1: Add Local Learning Settings

**Files:**
- Modify: `src/features/wordbook/wordbook-types.ts`
- Create: `src/features/wordbook/wordbook-study-settings-store.ts`
- Create: `src/features/wordbook/wordbook-study-settings-store.test.ts`

- [x] **Step 1: Add settings types**

Add:

```ts
export type StudySessionGoal = 10 | 20 | 30;

export type WordbookStudySettings = {
  learnTargetCount: StudySessionGoal;
  reviewTargetCount: StudySessionGoal;
};
```

- [x] **Step 2: Write settings store tests**

Cover:

- missing storage returns `{ learnTargetCount: 10, reviewTargetCount: 10 }`
- invalid JSON returns defaults
- invalid values normalize to defaults
- saving `20/30` persists and reloads
- subscription/version changes trigger UI consumers if following existing progress-store pattern

- [x] **Step 3: Implement settings store**

Use localStorage key:

```ts
enggo.wordbookStudySettings.v1
```

Expose:

- `defaultWordbookStudySettings`
- `loadWordbookStudySettings()`
- `saveWordbookStudySettings(settings)`
- `subscribeWordbookStudySettings(listener)`
- `getWordbookStudySettingsSnapshot()`
- `getServerWordbookStudySettingsSnapshot()`

- [x] **Step 4: Run settings tests**

Run:

```powershell
corepack pnpm test src\features\wordbook\wordbook-study-settings-store.test.ts
```

Expected: pass.

- [x] **Step 5: Update plan and progress**

Mark Task 1 steps complete and update `progress.md`.

## Task 2: Thread Target Count Through Sessions

**Files:**
- Modify: `src/features/wordbook/session-engine.ts`
- Modify: `src/features/wordbook/session-engine.test.ts`
- Modify: `src/features/wordbook/study-session.tsx`
- Modify: `src/features/wordbook/study-session.test.tsx`
- Modify: `src/features/wordbook/wordbook-dashboard.tsx`
- Modify: `src/features/wordbook/wordbook-dashboard.test.tsx`
- Modify: `src/features/collections/study-panels.tsx` if required by the current component boundary.

- [x] **Step 1: Add `targetCount` to `CreateSessionInput`**

`createLearnSession` and `createReviewSession` must select up to `targetCount`, not hard-coded 10.

- [x] **Step 2: Pass frozen target count into `StudySession`**

`StudySession` props should include `targetCount`. Session creation reads it once and stores `totalTargets` in state.

- [x] **Step 3: Load settings in dashboard**

Dashboard reads local settings and starts Learn/Review with:

- `learnTargetCount` for Learn
- `reviewTargetCount` for Review

- [x] **Step 4: Preserve progress semantics**

Ensure UI still renders:

```ts
completedTargetLemmas.length / totalTargets
```

Do not count card exposures or detail views.

- [x] **Step 5: Add tests**

Cover:

- Learn can start with 20 targets when enough words exist.
- Review can start with 30 targets when enough due words exist.
- Changing stored settings after session creation does not change the active session denominator.

- [x] **Step 6: Run focused tests**

Run:

```powershell
corepack pnpm test src\features\wordbook\session-engine.test.ts src\features\wordbook\study-session.test.tsx src\features\wordbook\wordbook-dashboard.test.tsx
```

Expected: pass.

- [x] **Step 7: Update plan and progress**

Mark Task 2 steps complete and update `progress.md`.

## Task 3: Fix Learn Failure Requeue

**Files:**
- Modify: `src/features/wordbook/session-engine.ts`
- Modify: `src/features/wordbook/session-engine.test.ts`
- Modify: `src/features/wordbook/study-session.test.tsx` if UI behavior expectations change.

- [x] **Step 1: Remove failure auto-complete behavior**

`failCurrentTarget` must not finish the target simply because `failedAttempts >= 3`.

- [x] **Step 2: Keep current light on failure**

Failure behavior:

| Current stage | Delay | Resume stage |
|---------------|-------|--------------|
| `recognitionChoice` | 2 | `recognitionChoice` |
| `guidedRecall` | 3 | `guidedRecall` |
| `finalRecall` | 3 | `finalRecall` |

- [x] **Step 3: Preserve existing mastery dots**

On failure, do not clear dots and do not reduce dots. Only increment failure/wrong counters as appropriate.

- [x] **Step 4: Add tests**

Cover:

- first-light failure returns later as first-light question
- second-light failure returns later as second-light question
- third-light failure returns later as third-light question
- repeated failures keep the target active instead of completing/blocking it

- [x] **Step 5: Run focused tests**

Run:

```powershell
corepack pnpm test src\features\wordbook\session-engine.test.ts src\features\wordbook\study-session.test.tsx
```

Expected: pass.

- [x] **Step 6: Update plan and progress**

Mark Task 3 steps complete and update `progress.md`.

## Task 4: Make Review One-Light Verification

**Files:**
- Modify: `src/features/wordbook/wordbook-types.ts`
- Modify: `src/features/wordbook/wordbook-progress-store.ts` if status semantics need a small extension.
- Modify: `src/features/wordbook/session-engine.ts`
- Modify: `src/features/wordbook/session-engine.test.ts`
- Modify: `src/features/wordbook/study-session.tsx`
- Modify: `src/features/wordbook/study-session.test.tsx`
- Modify: `src/features/wordbook/wordbook-dashboard.test.tsx` if due counts change.

- [x] **Step 1: Prevent Review failures from entering Learn**

Review failed words must not be selectable by `createLearnSession` just because they failed Review. If current `lapsed` semantics make this impossible, introduce a Review-owned state or change Learn selection to exclude Review-owned failures.

- [x] **Step 2: Simplify Review path**

Review should use one user judgment:

- `markKnown`: show detail, then pass
- `markFuzzy` / `markForgotten`: show detail, record lapse, requeue in Review

Do not route Review failure to `recognitionChoice` or `finalRecall`.

- [x] **Step 3: Implement medium penalty**

Clean pass:

- increment correct count
- raise `reviewStrength` up to 3
- schedule normal next review

Failure then rescue pass:

- increment wrong/lapse signal
- keep in Review queue
- rescue pass completes this session target
- next interval shorter than a clean pass, typically strength 1 unless already lower

- [x] **Step 4: Add tests**

Cover:

- remembered Review completes after detail
- fuzzy/forgotten Review stays in Review after detail
- failed Review word reappears after other cards
- failed Review word does not enter Learn
- rescue pass gets shorter next review interval than clean pass

- [x] **Step 5: Run focused tests**

Run:

```powershell
corepack pnpm test src\features\wordbook\session-engine.test.ts src\features\wordbook\study-session.test.tsx src\features\wordbook\wordbook-dashboard.test.tsx
```

Expected: pass.

- [x] **Step 6: Update plan and progress**

Mark Task 4 steps complete and update `progress.md`.

## Task 5: Add Wrong-Choice Contrast

**Files:**
- Modify: `src/features/wordbook/wordbook-types.ts`
- Modify: `src/features/wordbook/distractors.ts` if choice metadata is missing.
- Modify: `src/features/wordbook/distractors.test.ts` if metadata is added.
- Modify: `src/features/wordbook/session-engine.ts`
- Modify: `src/features/wordbook/session-engine.test.ts`
- Modify: `src/features/wordbook/study-session.tsx`
- Modify: `src/features/wordbook/study-session.test.tsx`

- [x] **Step 1: Add mistake data model**

Add a serializable state shape for:

- selected meaning
- correct meaning
- selected distractor lemma when available

- [x] **Step 2: Add `wrongChoiceContrast` stage**

When `chooseMeaning` is incorrect, transition to contrast before detail.

- [x] **Step 3: Preserve active-failure direct detail**

`showAnswer`, `markUnknown`, and `markForgotten` should go directly to detail, not contrast.

- [x] **Step 4: Requeue after contrast and detail**

After contrast, user continues to detail. After detail, the target requeues with the same light and correct delay from Task 3.

- [x] **Step 5: Add tests**

Cover:

- wrong choice renders selected meaning, correct meaning, and distractor lemma
- continue from contrast reaches detail
- active failure skips contrast
- wrong choice does not increase mastery dots

- [x] **Step 6: Run focused tests**

Run:

```powershell
corepack pnpm test src\features\wordbook\distractors.test.ts src\features\wordbook\session-engine.test.ts src\features\wordbook\study-session.test.tsx
```

Expected: pass.

- [x] **Step 7: Update plan and progress**

Mark Task 5 steps complete and update `progress.md`.

## Task 6: Split Learn Detail Depth

**Files:**
- Modify: `src/features/wordbook/study-session.tsx`
- Modify: `src/features/wordbook/study-session.test.tsx`
- Modify: `src/features/wordbook/session-engine.ts` only if stage naming needs a small adjustment.

- [x] **Step 1: Define detail depth by stage**

Render:

- first-light detail: core meaning + one example
- second-light detail: core meaning + one example + collocations
- third-light detail: all available current details + pass confirmation

- [x] **Step 2: Keep data source unchanged**

Use existing fields only:

- `meaningsZh`
- `examples`
- `collocations`

Do not add generated content or model calls.

- [x] **Step 3: Add tests**

Cover:

- first detail does not show all collocations
- second detail shows collocations when available
- third detail shows complete current entry details and pass confirmation

- [x] **Step 4: Run focused tests**

Run:

```powershell
corepack pnpm test src\features\wordbook\study-session.test.tsx src\features\wordbook\session-engine.test.ts
```

Expected: pass.

- [x] **Step 5: Update plan and progress**

Mark Task 6 steps complete and update `progress.md`.

## Task 7: Final Verification And Browser QA

**Files:**
- Modify: `docs/superpowers/plans/2026-05-30-wordbook-learn-review-experience-polish-v1.md`
- Modify: `progress.md`
- Modify: `docs/README.md` if active/completed plan status changes.

- [x] **Step 1: Run focused test bundle**

Run:

```powershell
corepack pnpm test src\features\wordbook\wordbook-data.test.ts src\features\wordbook\wordbook-progress-store.test.ts src\features\wordbook\wordbook-study-settings-store.test.ts src\features\wordbook\distractors.test.ts src\features\wordbook\session-engine.test.ts src\features\wordbook\wordbook-dashboard.test.tsx src\features\wordbook\study-session.test.tsx src\features\wordbook\wordbook-progress-summary.test.tsx src\features\collections\collection-store.test.ts src\features\collections\study-panels.test.tsx
```

Expected: pass.

- [x] **Step 2: Run focused lint**

Run:

```powershell
corepack pnpm lint -- src\features\wordbook src\features\collections\study-panels.tsx src\app\learn\learn-client.tsx src\app\review\review-client.tsx
```

Expected: pass.

- [x] **Step 3: Run diff check**

Run:

```powershell
git diff --check
```

Expected: no whitespace errors. Windows LF/CRLF warnings are acceptable.

- [x] **Step 4: Browser QA at 390px**

Use `http://localhost:3000/learn`, not `127.0.0.1`.

Verify:

- settings can choose Learn target 20
- new Learn session displays `0 / 20`
- wrong choice shows contrast before detail
- first/second/third light failures keep the current light
- Review failure stays in Review and returns after other cards
- no horizontal overflow at 390px

- [x] **Step 5: Update docs**

Update:

- this plan checkboxes
- `progress.md` with exact test/browser results
- `docs/README.md` if the plan is now completed or still active

- [x] **Step 6: Commit checkpoint**

Commit only this plan's files:

```powershell
git status --short --branch
git add <changed files for this plan>
git commit -m "feat: polish wordbook study flow"
```

Expected: commit succeeds and worktree is clean or only has explicitly unrelated files.
