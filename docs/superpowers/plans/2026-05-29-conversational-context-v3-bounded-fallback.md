# Conversational Context V3: Bounded Fallback + Context Choice

## Goal
Ship V3 as a bounded chat fallback and candidate-in-context choice layer. The product should respond to normal human chat, capability questions, and learning-adjacent prompts instead of surfacing no-feedback / 501 behavior, while keeping retrieval no-match and random text conservative. Also support follow-ups like `哪个更正式` and `哪个更适合考试表达` only within the previous candidate set.

## Tasks
- [x] Step 1: Create this V3 implementation plan and use it as the active checklist.
- [x] Step 2: Extend conversation context with `context_choice` availability and resolver behavior.
- [x] Step 3: Add API handlers for bounded fallback and provider-backed `context_choice`.
- [x] Step 4: Update frontend action typing and readable error propagation.
- [x] Step 5: Add backend, frontend, and smoke coverage for V3.
- [x] Step 6: Run focused verification and update handoff docs.

## Acceptance
- `哪个更正式` without context returns clarification and does not call provider.
- `遵循的英文是什么 -> 哪个更正式` resolves to `context_choice`, locks target refs, and provider grounding contains only target refs and rules.
- `access assess excess 怎么区分 -> 哪个更适合考试表达` answers only within the three candidates.
- `你好`, `你能干嘛`, and `我今天不想背词` return 200 plain responses.
- Unsupported but normal chat no longer returns `not_implemented`; random blobs and true no-match still stay conservative.
- Frontend can carry `context_choice` in the transcript and surfaces readable server error messages when available.
