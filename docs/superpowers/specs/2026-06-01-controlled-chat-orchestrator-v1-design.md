# Controlled Chat Orchestrator V1 Design

## Product Decision

EngGo should move the fragile parts of chat answering from hard `if/else` routing toward a controlled tool-orchestrated learning assistant.

The goal is not to build a fully autonomous agent. The goal is to make the app behave more like an English teacher with internal lookup tools:

1. Understand whether the user is asking a learning question, continuing the previous turn, or asking something unrelated.
2. Use existing lookup / compare / meaning / shape / context capabilities as bounded internal tools.
3. Give the provider grounding before falling back to no-match.
4. Preserve useful conversation context for the next turn.

No-match should be the last safe outcome after tool recovery and clarification fail, not the first outcome when one deterministic branch misses.

## Problems To Fix

### Early No-match

Current services can return `resolution="no_match"` before the provider sees candidate evidence or the router tries a second interpretation. This is especially visible for natural questions that do not match the existing deterministic wording.

### Weak Continuation

The existing follow-up resolver handles known phrases such as `还有吗`, `怎么背`, and `哪个更正式`, but many natural continuations like `这几个具体怎么用`, `和刚才那个比呢`, or `有没有更口语的` can drop back into normal lookup and lose context.

### Router-first Structure

`normalize_query` chooses one query mode early. If that mode is wrong, later services often never get a chance to recover.

## V1 Scope

Controlled Chat Orchestrator V1 is a narrow compatibility layer around the existing services.

In scope:

- Add a backend orchestrator that can run after deterministic follow-up resolution but before returning a hard service no-match.
- Treat existing services as internal tools:
  - ordinary lookup;
  - direct compare;
  - advanced lookup;
  - conversation-context candidate reuse.
- Add provider-backed recovery for service no-match when the query appears to be an English-learning question and grounding or context exists.
- Add provider-backed continuation for context-bearing follow-up questions that the deterministic resolver does not currently rewrite.
- Keep existing exact lookup and provider-backed direct compare behavior intact.
- Keep all returned answers bounded: no unsupported wordbook claims, no fake curated confusion graph, no uncontrolled third-word expansion.

Out of scope:

- LangChain / LangGraph integration.
- Open-ended web search.
- Long-term memory or multi-topic memory.
- Account sync, backend wordbook storage, or SRS redesign.
- Rebuilding Learn / Review / Progress.
- Replacing all deterministic routing in one pass.

## Architecture

The V1 request flow is:

```text
User query + current conversationContext
  -> direct bounded chat answers
  -> deterministic follow-up resolver
  -> existing services as primary tools
  -> orchestrator recovery if the primary result is no-match or weak plain fallback
  -> provider answer / clarification / final no-match
  -> conversationContext update
```

The orchestrator should not invent vocabulary evidence. It can only use:

- grounding returned by an existing service;
- candidates stored in `conversationContext`;
- deterministic fallback text for provider-unavailable environments.

## Behavior

### Provider Available

If a no-match result has context candidates or service candidates, the orchestrator sends the user query, context candidates, and no-match metadata to the provider. The provider can:

- answer based on target candidates;
- ask a short clarification;
- say the current evidence is insufficient.

The response should be `answerKind="plain"` when it is teacher-style recovery rather than a grounded lookup result. It should include `providerRequestId` and preserve/update `conversationContext` when candidate context is available.

### Provider Unavailable

The orchestrator returns deterministic bounded fallback text. It should still avoid the old harsh no-match tone when context exists, for example:

```text
我先按刚才这组词接着说：access / assess / excess。当前没有生成服务参与，所以这次先不扩展；你可以问“哪个更正式”或指定其中一个词。
```

### Context Continuation

For a query like `这几个具体怎么用` with a valid previous candidate context, V1 should not send the query into ordinary lookup. It should answer or clarify based on the previous candidates.

### True Non-learning Queries

For unrelated user input, V1 should return a bounded plain response instead of a grounded no-match. It should not try to answer open-domain questions as a general chatbot.

## Verification

- Unit / contract tests prove service no-match can be recovered before final response.
- Unit / contract tests prove context continuation can use previous candidates even when deterministic resolver does not rewrite the query.
- Existing exact lookup, direct compare, context-choice, show-more, and study-guidance tests remain green.
- A smoke script or focused HTTP check covers:
  - natural continuation;
  - no-match recovery;
  - unrelated / bounded chat fallback;
  - stable exact lookup;
  - stable direct compare.
- Real browser E2E through the in-app Browser proves the user-visible app can:
  - answer a first-turn compare;
  - answer a natural continuation;
  - avoid hard no-match for an unsupported but learning-adjacent query.
