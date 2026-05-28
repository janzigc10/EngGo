# Conversational Learning Context V2

## Goal
Ship the next conversational context slice: scope switching, show-more continuation, controlled study guidance, and collection-page follow-up closure. Keep the chat workspace as the main stage and do not add long-term memory, multi-topic state, review cards, cloud sync, or作文语境选择 in this round.

## Tasks
- [x] Step 1: Create this V2 implementation plan and use it as the active checklist.
- [x] Step 2: Extend the backend and frontend context contract with optional `sourceQuery`, `continuationCandidates`, and V2 action names.
- [x] Step 3: Implement V2 resolver behavior for scope switch, `还有吗`, and study guidance while preserving V1 protections.
- [x] Step 4: Add API action handlers for `switch_scope`, `show_more`, and provider-backed `study_guidance`.
- [x] Step 5: Close the frontend loop for scope sync and collection-page follow-up exam targets.
- [x] Step 6: Add/extend unit, contract, frontend, and smoke coverage for V2.
- [x] Step 7: Run focused verification and update `progress.md` with the V2 handoff.

## Acceptance
- `换成考研范围` can reuse the previous `sourceQuery`, answer in `postgrad`, and tell the frontend to sync the active target.
- `只看四级` without usable context returns a deterministic scope-switch acknowledgement.
- `还有吗` only uses stored continuation candidates; it does not ask the provider to invent more.
- `这组怎么背` and `第二个怎么记` become `study_guidance` actions with target refs locked before the provider is called.
- Collection-page continue links carry the word's exam target back to the chat page.
