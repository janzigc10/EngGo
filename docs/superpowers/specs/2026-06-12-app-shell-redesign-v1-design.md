# EngGo App Shell Redesign V1 Design

## Design Read

Reading this as an exam-focused English learning app redesign for students, with a calm mobile-first app language, leaning toward Tailwind v4, Geist, restrained motion, and a single teal/cyan accent.

This is not a marketing-page redesign. The relevant `design-taste-frontend` constraints are the redesign/audit discipline, card restraint, consistent typography, clear controls, icon accessibility, and avoiding generic AI-looking UI. The landing-page and hero-image rules do not apply.

## Current Problem

The current UI works functionally, but it does not feel like one app:

- The header is a large rounded card, the page body is another large rounded card, and the content inside is more nested cards.
- The top navigation reads like a row of pills and currently overstates `对话主舞台` even on Learn / Review / Progress.
- Learn, Review, Progress, Collections, and Chat feel like separate pages assembled from local panels rather than one coherent shell.
- Wordbook switching and study settings are repeated near the top of Learn / Review, which competes with the actual session action.
- Progress exists as a primary route even though the user now wants data to live in a dedicated wordbook route.

## Goals

1. Make EngGo feel like a real app, not a set of loosely connected pages.
2. Keep the user free to choose Today, Learn, Review, or Chat. Do not introduce forced daily priority.
3. Remove persistent top navigation. Primary navigation is an on-demand drawer.
4. Move wordbook switching, settings, and progress data into a dedicated wordbook route.
5. Reduce nested card visual noise and use a stable app shell, consistent radius scale, and one accent color.
6. Keep the first implementation client-only and compatible with existing localStorage wordbook state.

## Non-Goals

- No account system, cloud sync, backend persistence, or complete SRS redesign.
- No changes to the Learn / Review state machine in V1.
- No full mobile-native gesture framework beyond a simple drawer open/close behavior.
- No provider/model behavior changes.
- No forced "today you must do this first" recommendation flow.
- No broad visual polish of every study card detail before the app shell is stable.

## Information Architecture

Primary destinations:

- `/` or `/today`: Today overview.
- `/learn`: Learn session entry and active Learn session surface.
- `/review`: Review session entry and active Review session surface.
- `/chat`: Chat lookup and comparison workspace.
- `/wordbook`: Wordbook management, settings, and progress/data dashboard.

Existing secondary routes:

- `/collections` remains available as a secondary route. It should not be part of the primary drawer. It can be linked from `/wordbook` or from relevant Chat/collection actions.
- `/progress` should be retired from primary navigation. V1 can keep a compatibility redirect or thin alias to `/wordbook` if needed.

## App Shell

### Top Bar

The top bar is not a primary navigation bar.

It contains:

- A left hamburger button.
- Current page title: `Today`, `Learn`, `Review`, `Chat`, or `Wordbook`.
- Optional compact contextual status on wider screens, such as current exam target or active wordbook label.

It does not contain:

- Learn / Review / Chat links.
- Wordbook switching controls.
- Long marketing copy.
- Large serif title treatment.

### Navigation Drawer

The hamburger button opens a drawer. On touch screens, a left-edge swipe can also open it if straightforward to implement without risky custom gesture code.

Drawer items:

- Today
- Learn
- Review
- Chat

Drawer behavior:

- Drawer overlays content and dims the page.
- Selecting an item navigates and closes the drawer.
- Escape closes the drawer.
- Focus is managed inside the drawer while open.
- The active route is clearly marked.
- The wordbook route is not inside this drawer.

This follows the common drawer pattern used by Material-style app navigation: a menu button reveals a navigation drawer while the main app stays focused.

### Bottom Tool Dock

V1 has one bottom tool icon only: Wordbook.

Behavior:

- The icon appears as a compact bottom floating tool.
- It links to `/wordbook`.
- It uses a book/library icon from the chosen icon library.
- It has `aria-label="词书"` or equivalent.
- It has a tooltip on hover/focus.
- It may show one small badge for current exam target or active book status, but it should not show long text.

The dock must not become a second navigation bar in V1. Do not add Collections, Settings, Account, or Progress icons yet.

## Route Design

### Today

Purpose:

- Give the user a calm starting point.
- Show current wordbook status and available actions without dictating one priority.

Content:

- Current wordbook compact status.
- Entry buttons for Learn, Review, and Chat.
- Active session continuation if present.
- Small progress summary.
- No forced daily decision.

### Learn

Purpose:

- Start or continue a Learn session.

Changes from current UI:

- Remove top wordbook switcher block.
- Remove repeated explanatory metric cards from the entry state.
- Keep session controls and active-session recovery.
- Read the active wordbook from the shared wordbook store.
- If the user needs to change wordbook or learn/review target count, point them to `/wordbook`.

### Review

Purpose:

- Start or continue a Review session.

Changes from current UI:

- Same shell treatment as Learn.
- No duplicate wordbook switching controls.
- Keep due-review and active-session semantics.
- Read active wordbook from the shared wordbook store.

### Chat

Purpose:

- Preserve the original chat-style lookup and comparison workspace as an explicit route.

Changes:

- Move the current root chat workspace to `/chat`.
- Root becomes Today, or `/today` becomes canonical with `/` redirecting/rendering Today.
- Keep chat answer behavior, provider flow, and FastAPI direct path unchanged.

### Wordbook

Purpose:

- Central place for wordbook selection, study settings, and progress data.

Content:

- Current active wordbook.
- Wordbook picker for Gaokao, CET-4, CET-6, and Postgrad.
- Active exam target derived from the selected wordbook.
- Learn target count and Review target count settings.
- Total word count.
- Unseen, learning, due review, scheduled review, review rescue, blocked content, and passed counts.
- Seen count / correct count / wrong count aggregates where meaningful.
- Daily activity curve.
- Link to Collections as a secondary study asset.

## Daily Activity Data

Current progress records include timestamps such as `lastSeenAt` and `updatedAt`, which can support a rough historical view. They do not provide an accurate event log for "how many new words did I learn on each day" or "how many review attempts happened on each day".

V1 should add a lightweight localStorage daily stats store:

Storage key:

- `enggo.wordbookDailyStats.v1`

Suggested record shape:

```ts
type WordbookDailyStatsRecord = {
  date: string; // local YYYY-MM-DD
  wordbookId: WordbookId;
  learnStartedCount: number;
  learnCompletedCount: number;
  reviewStartedCount: number;
  reviewCompletedCount: number;
  newWordsTouched: number;
  reviewCardsTouched: number;
  correctCount: number;
  wrongCount: number;
  updatedAt: string;
};
```

Rules:

- Increment from existing Learn / Review session actions.
- Do not rewrite the session state machine to support this.
- Merge records by `date + wordbookId`.
- Use local dates for user-facing daily charts.
- Do not backfill exact history from existing progress records. If a historical approximation is shown, label it as approximate or keep V1 chart empty until new stats accrue.

## Visual System

Typography:

- Keep Geist / Geist Mono.
- Remove default serif headings from the app shell and wordbook pages.
- Use compact app-scale headings, not landing-page hero type.

Color:

- Use one accent family, likely teal/cyan.
- Keep neutral slate/zinc surfaces.
- Avoid purple/blue gradient styling as a default app look.

Shape:

- Use one radius system.
- Buttons and icon buttons can be 10-14px radius.
- Large surfaces should avoid oversized 2rem rounded cards.

Cards and Panels:

- Use fewer cards.
- Prefer panels, dividers, and plain spacing for grouping.
- Do not place cards inside cards except for real repeated items or modal content.

Motion:

- Drawer open/close: short, restrained transition.
- Icon button active/pressed state: tactile but small.
- Respect reduced motion.

Icons:

- The project currently has no icon library dependency.
- Implementation should choose one icon family and use it consistently.
- Since the project already uses no icon package, V1 can add a small maintained icon package or use simple CSS-only placeholders only during mockup, but production should use real icons.
- Every icon-only button needs an accessible label and tooltip.

## Component Boundaries

Suggested frontend boundaries:

- `AppShell`: owns top bar, drawer, bottom wordbook tool icon, and main content frame.
- `AppDrawer`: drawer items and focus/close behavior.
- `WordbookToolButton`: bottom icon link to `/wordbook`.
- `TodayPage`: current status and non-forced action entries.
- `WordbookPage`: management and data dashboard.
- `WordbookDailyStatsStore`: localStorage store for daily activity.
- `WordbookActivityChart`: compact local chart component.

Existing code to reuse:

- `buildWordbookProgressSnapshot`
- `buildWordbookProgressExplanations`
- `loadActiveWordbook`
- `saveActiveWordbookId`
- `loadWordbookStudySettings`
- `WordbookStudySettingsPanel`
- active session store helpers
- existing Learn / Review `StudySession` behavior

## Accessibility

- Hamburger button must have an accessible name.
- Drawer should close on Escape and on backdrop click.
- Drawer focus order should be predictable.
- Icon-only wordbook button needs `aria-label` and tooltip.
- Active route should not rely on color alone.
- Bottom wordbook icon must not obscure primary controls at 390px width.
- Chart needs a text summary for screen readers.

## Responsive Behavior

Mobile:

- Top bar with hamburger.
- Drawer overlays content.
- Bottom wordbook icon/dock remains compact.
- Content uses single-column app panels.

Desktop:

- Still use the same app shell concept.
- Drawer can remain overlay rather than persistent sidebar for V1, matching the user's preference that navigation should not always be visible.
- Content can widen and use two-column summaries where useful.

## Migration Notes

- Root route changes from Chat workspace to Today.
- Chat workspace moves to `/chat`.
- Existing `/learn` and `/review` remain.
- `/progress` should no longer be in primary navigation. Prefer redirect or compatibility page pointing to `/wordbook`.
- Existing localStorage keys remain valid:
  - `enggo.wordbookProgress.v1`
  - `enggo.wordbookStudySettings.v1`
  - `enggo.activeStudySessions.v1`
- Add `enggo.wordbookDailyStats.v1` for future daily chart accuracy.

## Verification Plan

Focused tests:

- App shell renders page title, hamburger, and wordbook icon.
- Drawer contains only Today / Learn / Review / Chat.
- Wordbook icon links to `/wordbook`.
- Learn / Review no longer render active wordbook switcher controls.
- Wordbook page can switch active wordbook and update settings.
- Daily stats store normalizes malformed localStorage and merges by date + wordbook.
- Daily activity chart handles empty, single-day, and multi-day data.

Browser QA:

- `http://localhost:3000` desktop.
- 390px mobile viewport.
- Open/close drawer by hamburger.
- Navigate Today -> Learn -> Review -> Chat.
- Open Wordbook from bottom icon.
- Switch wordbook and confirm Learn/Review read the same active wordbook.
- Check no horizontal overflow.
- Check bottom icon does not cover input/session controls.

Docs-only design gate:

- No implementation begins until this design is reviewed and an implementation plan is written.

## Open Implementation Decisions

- Whether `/today` is a physical route or `/` only renders Today.
- Which icon package to add, if any.
- Whether `/progress` redirects to `/wordbook` or remains as a thin compatibility page for one cycle.
- Whether left-edge swipe is included in V1 or deferred after hamburger drawer works reliably.

## References

- Material Design navigation drawer overview: https://m3.material.io/components/navigation-drawer/overview
- Material Design icon buttons overview: https://m3.material.io/components/icon-buttons/overview
- Material Design tooltips overview: https://m3.material.io/components/tooltips/overview
