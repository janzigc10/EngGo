# ECDICT-grounded Direct Compare Design

## Product Decision

Direct compare should not depend on manually curated `quickDistinction`, confusion graph, or artificial pair/group metadata.

The default capability is:

1. Parse the user query as a focused compare.
2. Resolve the exact user-mentioned English terms.
3. Prefer ECDICT-backed candidates for those terms.
4. Ask the provider to write a short Chinese comparison grounded in those dictionary entries.
5. If provider generation is unavailable or fails, fall back to clean parallel dictionary lines.

Manual confusion groups can remain in historical data for older retrieval paths, but they are not a requirement for direct compare quality and should not be expanded as a product strategy.

## In Scope

- Replace the previous ECDICT-only deterministic "偏..." fallback with provider-generated compare when at least two exact terms resolve.
- Keep the provider prompt light:
  - explain the core difference in Chinese;
  - use the supplied dictionary meanings;
  - may add common usage/collocation intuition;
  - do not proactively introduce a third word unless the user asked for it.
- Prefer ECDICT candidates when `ecdict_lookup` is available.
- Keep the answer grounded and keep `mainAnswer` / conversation context available for follow-up questions.
- Fall back to deterministic parallel dictionary lines when no provider is configured, provider fails, or fewer than two terms resolve.

## Out of Scope

- Building or extending a systematic confusion graph.
- Batch authoring `quickDistinction`.
- Treating `quickDistinction` as the primary answer source.
- Changing Learn / Review state machines or wordbook storage.
- Changing context-choice follow-up behavior beyond preserving the current candidate context.

## Behavior

### Provider Available

For `restrain 和 constrain 的区别`, if both terms resolve from ECDICT, the service sends the two candidates and their meanings to the provider. The expected answer is a compact teacher-style explanation, not raw dictionary rows.

The answer should still return `answerKind="grounded"`, `queryMode="direct_compare"`, `answerStyle="confusion_untangle"`, and a non-null `providerRequestId`.

### Provider Unavailable

The service returns deterministic parallel dictionary lines, for example:

```text
restrain vt. 抑制；阻止；束缚
constrain vt. 强迫；限制；约束
```

It should not append a fake "当前没有人工易混组" distinction. That text overstates the capability without adding real information.

### Existing Manual Groups

The direct compare main path does not need to query or consume `quickDistinction`. If older data still contains manual groups, that should not change the provider-first behavior for exact compare.

## Verification

- Unit tests prove provider is called for resolved direct compare and receives ECDICT-grounded candidates.
- Unit tests prove no-provider and provider-error paths fall back to deterministic parallel dictionary lines.
- Contract tests prove `/api/chat` routes direct compare through provider when configured.
- Live browser E2E proves a real local chat query returns a provider-style compare, or a clean fallback if provider credentials are unavailable.
