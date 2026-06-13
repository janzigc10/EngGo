# App Shell Redesign V1 Implementation Plan

## Source Spec

- `docs/superpowers/specs/2026-06-12-app-shell-redesign-v1-design.md`

## Acceptance Standard

The implementation is complete only when:

- The app uses the confirmed Ink Amber visual system.
- The top persistent pill navigation is gone.
- The hamburger drawer contains only `Today / Learn / Review / Chat`.
- A bottom wordbook icon links to `/wordbook` and is not part of the drawer.
- `/` renders Today, and Chat is available at `/chat`.
- Learn and Review focus on starting/continuing sessions and do not contain the old wordbook switcher block.
- `/wordbook` owns wordbook switching, study settings, progress metrics, and daily activity.
- `/progress` no longer behaves as a primary app page; it redirects or points users to `/wordbook`.
- Focused tests, lint, build, and browser/Computer Use QA pass.
- Browser QA covers desktop and 390px mobile, confirming pages align visually, do not feel abrupt, and main functions work.

## Tasks

- [x] Task 1: Build the app shell foundation.
  - Replace the old card header and top pill nav with an Ink Amber shell.
  - Add page-title-aware top bar, hamburger drawer, and bottom wordbook icon.
  - Drawer items are exactly Today, Learn, Review, Chat.
  - Keep `/collections` out of primary navigation.

- [x] Task 2: Migrate route IA.
  - Change `/` to Today.
  - Add `/chat` for the existing chat workspace.
  - Add `/wordbook` for wordbook management.
  - Retire `/progress` as a primary page, preferably with a redirect/compatibility route to `/wordbook`.

- [x] Task 3: Build Today using existing wordbook state.
  - Reuse `buildWordbookProgressSnapshot`, active wordbook, settings, and active session stores.
  - Show non-forced entries for Learn, Review, and Chat.
  - Do not introduce a single daily priority.

- [x] Task 4: Split wordbook management from Learn/Review.
  - Move active wordbook switching and study settings to `/wordbook`.
  - Simplify Learn/Review entry UI so those pages focus on session start/continue.
  - Preserve existing Learn/Review session state machine behavior.

- [x] Task 5: Add daily stats and wordbook data dashboard.
  - Add `enggo.wordbookDailyStats.v1` localStorage store.
  - Increment stats from Learn/Review session activity without rewriting the state machine.
  - Add compact activity chart and accessible text summary.
  - Handle empty/malformed data.

- [x] Task 6: Add focused test coverage.
  - Shell: drawer items, active route, wordbook icon link.
  - Today: free-choice entries and active session state.
  - Wordbook: switching/settings/progress metrics.
  - Daily stats: normalization, merge by date + wordbook, chart empty/multi-day states.
  - Learn/Review: no old wordbook switcher block.

- [x] Task 7: Verify end to end.
  - Run focused tests, unit tests if needed, lint, build, and `git diff --check`.
  - Use Browser/Computer Use at `http://localhost:3000`.
  - QA desktop pages: Today, Learn, Review, Chat, Wordbook, Collections compatibility, Progress compatibility.
  - QA 390px mobile: drawer open/close, navigation, wordbook icon, no horizontal overflow, no controls hidden under bottom icon.
  - Confirm pages share the same Ink Amber visual language and do not look abrupt between routes.

## Notes

- Keep implementation client-only.
- Do not change provider/chat backend behavior.
- Do not add account/cloud sync.
- Avoid custom gesture complexity until hamburger drawer is reliable; left-edge swipe can be deferred if it becomes risky.
