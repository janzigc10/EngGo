# Controlled Tool Router V1 Design

## Product Decision

EngGo should keep moving toward an agent-like learning assistant, but the next step should be a controlled internal tool router rather than a full LangChain / LangGraph agent.

The product problem is not that the backend lacks a framework. The problem is that intent selection is still too implicit: `/api/chat` asks each service in order, and a missed or weak route can still feel like a hard no-match to the user. V1 should make the available capabilities explicit as internal tools, then route to them through one bounded protocol.

This keeps the high-precision parts of the current system while making the architecture ready for later model-assisted intent classification.

## Problems To Fix

### Hidden Tool Boundaries

Ordinary lookup, direct compare, and advanced lookup already behave like tools, but the API route calls them as ad hoc services. There is no single place that says which capability is available, when it should be tried, what query it receives, or how no-match recovery should be attached.

### Low-signal Service Loop

The current service loop relies on `UnsupportedQueryMode` to skip tools. That works, but it makes routing correctness hard to test directly. A direct compare request still starts from the ordinary lookup slot and only reaches compare after rejection.

### Model Classification Risk

Letting the provider classify every turn before routing would be more agent-like, but it would also add latency, cost, and a new failure mode on every message. V1 should not introduce that cost until the internal tool protocol is stable.

## V1 Scope

In scope:

- Add a backend internal tool protocol for existing chat capabilities.
- Add a router that maps the normalized query mode to an ordered list of tools.
- Keep deterministic follow-up actions, context continuation, and no-match recovery from the current orchestrator.
- Route direct compare, ordinary lookup, and advanced lookup explicitly instead of relying only on service order.
- Keep provider use bounded to existing generation / continuation / no-match recovery paths.
- Add tests proving tool order, no-match recovery, and stable lookup / compare behavior.

Out of scope:

- Full LangChain / LangGraph integration.
- Free-form model tool calling.
- A provider call before every user message.
- Multi-step autonomous planning or tool loops.
- Learn / Review / Progress state-machine changes.
- Long-term memory, web search, account sync, or notebook-style document ingestion.

## Architecture

The V1 request flow becomes:

```text
User query + conversationContext
  -> bounded direct chat answer
  -> natural context continuation
  -> deterministic follow-up resolver
  -> controlled tool route plan
  -> execute selected internal tools in order
  -> attach no-match recovery if selected tool misses
  -> attach conversationContext for grounded results
```

The internal tools are:

- `ordinary_lookup`: exact lookup and spelling / fuzzy recall.
- `direct_compare`: explicit A/B/C distinction.
- `advanced_lookup`: meaning lookup, shape neighbors, broad vocab, root / family lookup.

The router is rule-first:

- `direct_lookup` / `fuzzy_recall` -> `ordinary_lookup`.
- `direct_compare` -> `direct_compare`.
- `meaning_lookup` / `shape_neighbor_search` / `root_family_summary` -> `advanced_lookup`.
- unknown or future modes -> conservative fallback order.

Each tool keeps using its existing service implementation. The new layer owns selection and common post-processing, not retrieval internals.

## Provider Boundary

V1 does not ask the provider to choose tools for every turn. The provider remains downstream of grounding:

- direct compare provider generation uses ECDICT-backed grounding;
- context continuation uses locked previous candidates;
- no-match recovery uses service no-match metadata and optional context candidates.

This is deliberate. Once the internal tool protocol is stable and tests show where rule-first routing still misses, V2 can add a provider classifier only for ambiguous inputs.

## Expected Behavior

Stable paths should remain stable:

- `access 是什么意思` still returns ordinary grounded lookup.
- `restrain 和 constrain 的区别` still returns grounded direct compare.
- `给我几个跟 evaluate 易混的单词` still returns advanced shape-neighbor grounding.
- `response 的派生词` still returns advanced word-family grounding.

Improved architecture should be visible in tests:

- direct compare no longer depends on ordinary lookup rejecting first;
- root / shape / meaning requests go straight to advanced lookup;
- no-match recovery is attached after tool execution in one place;
- unsupported tools fall through predictably without leaking internal errors.

## Verification

- Unit tests for route planning from normalized query mode to tool order.
- Contract tests proving direct compare and advanced lookup are selected without ordinary lookup preflight.
- Existing chat contract tests stay green.
- Existing conversation smoke stays green.
- Real browser E2E verifies:
  - first-turn compare;
  - natural continuation;
  - learning-adjacent no-match recovery;
  - a stable ordinary lookup after router insertion.
