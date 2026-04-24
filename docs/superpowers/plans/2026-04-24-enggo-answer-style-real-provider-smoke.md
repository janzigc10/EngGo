# EngGo Answer Style Real Provider Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate with a small real-provider smoke run that `confusion_untangle` and `root_family_summary` still produce recognizably EngGo-style answers end to end, without expanding root prototypes or loosening typo gates.

**Architecture:** Reuse the existing local `/api/chat` path so the smoke run exercises retrieval, grounding, prompt assembly, and the real OpenAI-compatible provider together. Add a small pure TypeScript smoke-eval library for bounded case definitions and hard-fail vs manual-review rules, then keep the CLI runner thin: serial HTTP requests, bounded retry for 429, concise previews, JSON summary, and explicit next-step signals.

**Tech Stack:** Next.js 16, TypeScript, Vitest, `tsx` scripts, local Prisma dev/PostgreSQL, local `/api/chat`, existing OpenAI-compatible provider wiring (`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`).

---

## Scope Boundaries

This plan starts after:

- `docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md`
- `scripts/run-answer-style-eval.ts`
- `scripts/run-chat-batch-eval.ts`

Do:

- add a bounded real-provider smoke set of 8-10 cases
- verify actual output shape for `confusion_untangle`, `root_family_summary`, and guarded `no_match`
- keep the smoke run serial and external-dependency-aware
- capture `providerRequestId`, retry-limited 429 behavior, answer previews, and manual-review notes
- write findings back to `progress.md`

Do not:

- expand the second batch of root prototypes
- add root-family Prisma tables or schema work
- relax `reqeust` / `recomand` typo handling
- add this smoke run to `corepack pnpm verify`
- run Prisma-backed verification commands in parallel with this smoke

## File Structure

- Create: `scripts/lib/answer-style-provider-smoke.ts`
  - Own the bounded case list, payload/result types, hard-fail checks, manual-review checklist, and summary helpers.
- Create: `scripts/lib/answer-style-provider-smoke.test.ts`
  - Lock the case set, verdict rules, no-match/provider expectations, and summary aggregation.
- Create: `scripts/run-answer-style-provider-smoke.ts`
  - Thin serial CLI runner against local `/api/chat`, with retry/backoff and concise operator output.
- Modify: `package.json`
  - Add the dedicated smoke command.
- Modify: `progress.md`
  - Record the new plan, command outcomes, provider context, and recommended next slice.
- Optional modify: `bugs.md`
  - Only if the smoke run confirms a new stable issue such as a repeatable 429 window or provider-format pitfall.
- Optional modify: `scripts/run-chat-batch-eval.ts`
  - Only if a tiny helper extraction is cleaner than duplicating the same local API request code.

## Smoke Case Set

Keep the first real-provider smoke set narrow and exam-shaped:

```ts
[
  "stationary 和 stationery 哪个是文具",
  "access assess excess 怎么区分",
  "跟 recent 很像的词有哪些",
  "comply conform defer 怎么区分",
  "respect 那组词怎么分",
  "stitute 是什么",
  "tempt 这一族怎么记",
  "re+con 的词根有什么词",
  "有个像 reqeust 的词",
]
```

Use three review lanes:

- hard fail
  - HTTP error, grounding/query-mode drift, missing expected grounding, unexpected provider call behavior on `no_match`, or empty answer for resolved cases
- manual review
  - answer sounds too dictionary-like, skips the decision entrance, omits root caution/priority language, or becomes too long/too diffuse
- pass
  - no hard failures and no meaningful manual-review concerns

### Task 1: Create The Smoke Case And Verdict Library

**Files:**
- Create: `scripts/lib/answer-style-provider-smoke.ts`
- Create: `scripts/lib/answer-style-provider-smoke.test.ts`

- [ ] **Step 1: Write failing tests for the bounded smoke set**

Add a test that locks the case list and expectations:

```ts
import {
  buildAnswerStyleProviderSmokeCases,
} from "../../scripts/lib/answer-style-provider-smoke";

it("defines the bounded answer-style smoke set", () => {
  const cases = buildAnswerStyleProviderSmokeCases();

  expect(cases.map((item) => item.query)).toEqual([
    "stationary 和 stationery 哪个是文具",
    "access assess excess 怎么区分",
    "跟 recent 很像的词有哪些",
    "comply conform defer 怎么区分",
    "respect 那组词怎么分",
    "stitute 是什么",
    "tempt 这一族怎么记",
    "re+con 的词根有什么词",
    "有个像 reqeust 的词",
  ]);
  expect(cases.every((item) => item.manualChecks.length > 0)).toBe(true);
});
```

Expected before implementation: FAIL because the helper module does not exist.

- [ ] **Step 2: Write failing tests for hard-fail and manual-review rules**

Add tests for:

```ts
const verdict = evaluateAnswerStyleProviderSmoke(caseDef, {
  status: 200,
  providerRequestId: "resp_123",
  grounding: {
    queryMode: "direct_compare",
    resolution: "resolved",
    answerStyle: "confusion_untangle",
    mainAnswer: [{ lemma: "stationery" }],
    confusionBoundary: [{ lemma: "stationary" }],
  },
  answer: "先问一句：这里说的是静止不动，还是文具？",
});

expect(verdict.autoVerdict).toBe("pass");
expect(verdict.hardFailures).toHaveLength(0);
expect(verdict.manualReview).toContain("检查回答是否先给判断入口，而不是先铺词典解释");
```

And:

```ts
const verdict = evaluateAnswerStyleProviderSmoke(noMatchCase, {
  status: 200,
  providerRequestId: "resp_should_not_exist",
  grounding: {
    queryMode: "root_family_summary",
    resolution: "no_match",
    answerStyle: "root_family_summary",
  },
  answer: "我猜你想问 re 和 con 的同根词。",
});

expect(verdict.autoVerdict).toBe("fail");
expect(verdict.hardFailures).toContain(
  "no_match case should not return providerRequestId",
);
```

Expected before implementation: FAIL because the evaluator does not exist.

- [ ] **Step 3: Run the failing smoke-library tests**

Run:

```powershell
corepack pnpm test scripts/lib/answer-style-provider-smoke.test.ts
```

Expected: FAIL for missing module/exports.

- [ ] **Step 4: Implement the pure smoke-eval library**

In `scripts/lib/answer-style-provider-smoke.ts`, add:

```ts
export type ProviderSmokeCase = {
  name: string;
  query: string;
  activeExamTarget: ExamScopeCode;
  expectedQueryMode: QueryMode;
  expectedResolution: RetrievalResolution;
  expectedAnswerStyle: AnswerStyle;
  expectedGroundingIncludes?: string[];
  expectedRootFamilyViewId?: string | null;
  maxAnswerChars: number;
  manualChecks: string[];
};

export type ProviderSmokePayload = {
  status: number;
  providerRequestId: string | null;
  answer?: string;
  error?: { code?: string; message?: string } | null;
  grounding?: {
    queryMode?: QueryMode;
    resolution?: RetrievalResolution;
    answerStyle?: AnswerStyle;
    mainAnswer?: Array<{ lemma?: string }>;
    confusionBoundary?: Array<{ lemma?: string }>;
    rootFamilyView?: { id?: string } | null;
  };
};
```

Implement:

- `buildAnswerStyleProviderSmokeCases()`
- `evaluateAnswerStyleProviderSmoke(caseDef, payload)`
- `summarizeAnswerStyleProviderSmoke(results)`

Hard-fail checks should cover:

- non-200 HTTP status
- missing/incorrect `queryMode`
- missing/incorrect `resolution`
- missing/incorrect `answerStyle`
- missing required grounding lemmas
- wrong root-family id when expected
- empty answer for resolved cases
- non-null `providerRequestId` for expected `no_match`

Manual-review notes should stay separate from hard failures.

- [ ] **Step 5: Run the smoke-library tests to green**

Run:

```powershell
corepack pnpm test scripts/lib/answer-style-provider-smoke.test.ts
```

Expected: PASS.

### Task 2: Add The Serial Real-Provider Smoke Runner

**Files:**
- Create: `scripts/run-answer-style-provider-smoke.ts`
- Modify: `package.json`
- Optional modify: `scripts/run-chat-batch-eval.ts`

- [ ] **Step 1: Extend the smoke-library test with summary coverage**

Add one more test:

```ts
const summary = summarizeAnswerStyleProviderSmoke([
  { name: "a", autoVerdict: "pass", hardFailures: [], manualReview: [] },
  { name: "b", autoVerdict: "manual", hardFailures: [], manualReview: ["too long"] },
  { name: "c", autoVerdict: "fail", hardFailures: ["status 429"], manualReview: [] },
]);

expect(summary).toEqual({
  total: 3,
  pass: 1,
  manual: 1,
  fail: 1,
});
```

Expected before implementation: FAIL until the summary helper exists.

- [ ] **Step 2: Run the failing smoke-library test again**

Run:

```powershell
corepack pnpm test scripts/lib/answer-style-provider-smoke.test.ts
```

Expected: FAIL if the summary helper is still missing or incomplete.

- [ ] **Step 3: Implement the runner against local `/api/chat`**

Create `scripts/run-answer-style-provider-smoke.ts` as a thin CLI wrapper:

```ts
const baseUrl = process.env.ENGGO_CHAT_BASE_URL ?? "http://127.0.0.1:3000";

async function requestChat(item: ProviderSmokeCase, attempt = 0) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      activeExamTarget: item.activeExamTarget,
      query: item.query,
      history: [],
    }),
  });

  if (response.status === 429 && attempt < 2) {
    await sleep((attempt + 1) * 12000);
    return requestChat(item, attempt + 1);
  }

  return {
    status: response.status,
    payload: await response.json(),
  };
}
```

The runner should:

- execute cases strictly serially
- print one concise line per case
- keep an answer preview for manual review
- show `providerRequestId`
- exit with code `1` only when hard fails exist

- [ ] **Step 4: Add the package script**

In `package.json`, add:

```json
"eval:answer-style:provider": "tsx scripts/run-answer-style-provider-smoke.ts"
```

- [ ] **Step 5: Run smoke-library tests to green after runner wiring**

Run:

```powershell
corepack pnpm test scripts/lib/answer-style-provider-smoke.test.ts
```

Expected: PASS.

### Task 3: Run Serial Preflight And Real Smoke

**Files:**
- Modify: `progress.md`
- Optional modify: `bugs.md`

- [ ] **Step 1: Run serial preflight checks before touching the real provider**

Run:

```powershell
corepack pnpm exec prisma dev ls
corepack pnpm eval:answer-style
```

Expected:

- `enggo` is still `running`
- fake-provider answer-style eval still passes before the external smoke begins

Do not proceed if these fail.

- [ ] **Step 2: Start the local app and confirm the chat endpoint is reachable**

In a separate shell:

```powershell
corepack pnpm dev
```

Then check:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000
```

Expected: the local app responds and `/api/chat` is ready to accept requests.

- [ ] **Step 3: Run the real-provider smoke serially**

Run:

```powershell
corepack pnpm eval:answer-style:provider
```

Expected:

- summary JSON is printed
- `fail: 0`
- `manual` may be non-zero if wording needs review, but those cases are surfaced clearly

This command is allowed to take longer than local fake eval because of real-provider latency and bounded 429 backoff.

- [ ] **Step 4: Review the manual-review flags and answer previews**

For each `manual` case, answer these questions:

- does the answer sound like EngGo rather than a generic dictionary article?
- for `confusion_untangle`, does it give a decision entrance before long explanation?
- for `root_family_summary`, does it explain fragment + prefix direction + priority + caution?
- for guarded `no_match`, does it avoid hard-guessing?

If multiple cases miss the same style requirement, record that as the next prompt-tuning target instead of immediately changing retrieval/data.

- [ ] **Step 5: Record the smoke outcome in handoff docs**

Update `progress.md` with:

- exact command used
- provider context (`OPENAI_BASE_URL` / `OPENAI_MODEL` if relevant)
- summary counts
- which cases were `manual`
- whether the next plan should be:
  - prompt guardrail tuning
  - provider adapter shaping
  - or second-batch root prototype work

Only update `bugs.md` if the smoke confirms a stable, repeatable issue such as:

- repeatable MiniMax 429 window on small batches
- provider-specific formatting that breaks answer parsing
- a local app prerequisite that is not already documented

### Task 4: Keep The Completion Gate Tight

**Files:**
- Modify: `progress.md`
- Optional modify: `bugs.md`

- [ ] **Step 1: Do not add this smoke run to `verify`**

Keep:

```json
"verify": "corepack pnpm lint && corepack pnpm test:unit && corepack pnpm test:integration && corepack pnpm test:e2e"
```

Expected: external-provider smoke remains an explicit operator command, not a default gate.

- [ ] **Step 2: Keep verification serial**

Do not run these in parallel:

```powershell
corepack pnpm verify
corepack pnpm eval:shape
corepack pnpm eval:answer-style
corepack pnpm eval:answer-style:provider
```

Expected: no new Prisma dev instability caused by parallel local-db access.

- [ ] **Step 3: Mark this plan step-by-step during execution**

As each step finishes, immediately change its checkbox from `- [ ]` to `- [x]`.

Do not mark smoke execution complete until the real-provider command has actually been run and its outcome is written to `progress.md`.
