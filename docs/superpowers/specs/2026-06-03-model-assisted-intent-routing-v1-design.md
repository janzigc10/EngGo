# Model-assisted Intent Routing V1 Design

## Product Decision

EngGo should not jump from the current controlled tool router to a full ReAct agent. The next step is a rule-first, model-assisted intent routing layer:

```text
deterministic rule signals
  -> high-confidence route: execute current tools directly
  -> grey-zone route: ask the provider for a constrained intent/slot suggestion
  -> validate suggested slots against user text and conversation context
  -> execute existing controlled tools
  -> apply grounding / observation quality gates
  -> let the provider write only from accepted observation
```

The model can improve grey-zone intent understanding, but code still owns tool boundaries, parameter provenance, no-match behavior, and weak-candidate rejection.

## Current Problem

The controlled tool router already made tool boundaries explicit and stable. The latest no-match / weak-answer audit shows the next problem is not simply "too much no-match". The bigger risk is "weak resolved":

- `anti+dis 的词根有什么词` can resolve with weak candidates such as `antique / anew / attic...`.
- `跟 abandon 意思差不多的词`, `responsible 的同义词`, and `more formal way to say follow` are semantic expression requests, not word-family or shape-neighbor requests.
- `遵循的英文是什么 -> 还有更适合作文的吗` is a semantic style follow-up over prior candidates, not a plain `还有吗` request.

Regular expressions are strong for clear query types, but brittle for open-ended expression/style wording. A full agent would improve flexibility but would also let the model over-expand parameters and tool steps. V1 should take the middle path.

## Scope

In scope:

- Add a route confidence model for deterministic routes.
- Add a constrained grey-zone classifier using the existing provider interface.
- Validate classifier intent and slots before execution.
- Add a controlled semantic expression branch for synonym/style/formal-expression requests.
- Add a broad grounding quality gate so weak form/fragment candidates do not count as resolved.
- Add tests and a comparison matrix showing behavior before and after V1.

Out of scope:

- Full ReAct loops.
- Multi-step autonomous planning.
- Free-form model tool calling.
- Letting the provider invent tool parameters that are not in the user query or prior context.
- Learn / Review / Progress changes.
- Long-term memory or web search.

## Algorithm

### 1. Rule Route With Confidence

`normalize_query()` continues to produce `queryMode`, terms, compare terms, meaning hint, and `LearningIntentPlan`.

The router adds a confidence layer:

- `>= 0.85`: execute the deterministic route without provider classification.
- `0.55 - 0.85`: treat as grey zone and allow provider classification.
- `< 0.55`: clarify or bounded fallback unless the query is clearly learning-adjacent.

High-confidence examples:

- `access 是什么意思` -> `ordinary_lookup`, high confidence.
- `restrain vs constrain` -> `direct_compare`, high confidence.
- `response 的派生词` -> `advanced_lookup.word_family`, high confidence.

Grey-zone examples:

- `more formal way to say follow`.
- `跟 abandon 意思差不多的词`.
- `还有更适合作文的吗`.

### 2. Constrained Provider Classifier

The provider classifier only returns JSON. It does not call tools. Allowed intents:

- `ordinary_lookup`
- `direct_compare`
- `advanced_lookup`
- `semantic_expression`
- `semantic_style_followup`
- `bounded_plain`
- `clarification`

Allowed slots:

- `terms`: English terms from the user text or prior candidates.
- `meaningHint`: Chinese meaning from the user text.
- `style`: one of `formal`, `essay`, `spoken`, `common`, `exam`.
- `confidence`: model confidence.

If the provider fails, returns invalid JSON, returns low confidence, or suggests unverifiable slots, the router falls back to the deterministic route or clarification.

### 3. Slot Provenance Validation

Classifier slots must pass provenance validation:

- English `terms` must appear in the user text or in `conversationContext.candidates`.
- `semantic_style_followup` must have usable conversation context.
- `direct_compare` needs at least two verified terms.
- `semantic_expression` needs at least one verified term or a stable `meaningHint`.
- The model cannot add a third compare term that the user did not mention.

### 4. Tool Execution And Observation

Tool arguments are the user's requested object. Grounding is the tool observation: what the tool actually found and what the answer is allowed to rely on.

V1 keeps this separation:

```text
tool args = what to ask
tool observation / grounding = what evidence exists
answer = provider or template prose based only on accepted observation
```

### 5. Broad Grounding Quality Gate

Resolved broad answers must satisfy quality gates, not just candidate count:

- form filters need candidates that satisfy hard prefix/suffix/contains constraints.
- word-family needs exact seed or verified word-family evidence.
- shape-neighbor needs exact/edit/ngram/common-form evidence.
- semantic filter needs meaning evidence.
- root/fragment requests with only weak prefix/common-shape noise become no-match or clarification.

This specifically protects `anti+dis 的词根有什么词`.

## Expected Behavior

Improved:

- `anti+dis 的词根有什么词` no longer resolves to weak unrelated candidates.
- `more formal way to say follow` enters semantic expression handling instead of ordinary multi-token lookup.
- `跟 abandon 意思差不多的词` is recognized as semantic expression / synonym intent.
- `遵循的英文是什么 -> 还有更适合作文的吗` can be handled as candidate-bounded style follow-up.

Preserved:

- exact lookup remains deterministic.
- direct compare remains bounded to user-provided terms.
- random strings remain conservative no-match.
- provider output remains grounded and cannot introduce unverified candidates.

## Comparison Requirement

V1 must include a small before/after matrix. Each row records:

- query;
- previous behavior from the no-match / weak-answer audit;
- new route source (`rule` or `llm`);
- new intent/tool;
- new resolution;
- why this is a meaningful improvement or why behavior is intentionally unchanged.

The comparison should prove a real gain on grey-zone and weak-resolved cases, not just green unit tests.
