import "dotenv/config";

import { pathToFileURL } from "node:url";

import {
  buildAnswerStyleProviderSmokeCases,
  evaluateAnswerStyleProviderSmoke,
  summarizeAnswerStyleProviderSmoke,
  type ProviderSmokeCase,
  type ProviderSmokePayload,
  type ProviderSmokeResult,
} from "./lib/answer-style-provider-smoke";

type ChatApiResponse = {
  answer?: string;
  requestId?: string;
  providerRequestId?: string | null;
  error?: {
    code?: string;
    message?: string;
  } | null;
  grounding?: ProviderSmokePayload["grounding"];
};

type ChatSmokeResponse = {
  status: number;
  payload: ChatApiResponse;
};

export type ChatSmokeTransport = (args: {
  item: ProviderSmokeCase;
  attempt: number;
  baseUrl: string;
  signal?: AbortSignal;
}) => Promise<ChatSmokeResponse>;

export type RunnerCaseResult = ProviderSmokeResult & {
  status: number;
  queryMode: string | null;
  resolution: string | null;
  answerStyle: string | null;
  providerRequestId: string | null;
  errorCode: string | null;
  elapsedMs: number;
  answerChars: number;
  maxAnswerChars: number;
  groundingSummary: string;
  answerPreview: string;
  errorMessage: string | null;
};

type AnswerLengthStats = {
  count: number;
  min: number;
  max: number;
  average: number;
  p50: number;
  p90: number;
  warnings: number;
};

export type RunnerSummary = ReturnType<typeof summarizeAnswerStyleProviderSmoke> & {
  resolved: number;
  no_match: number;
  providerCalled: number;
  providerSkipped: number;
  providerUnknown: number;
  avgElapsedMs: number;
  maxElapsedMs: number;
  answerLengthByStyle: Record<string, AnswerLengthStats>;
  nextStep: string;
};

type RunAnswerStyleProviderSmokeOptions = {
  cases?: ProviderSmokeCase[];
  baseUrl?: string;
  requestChat?: ChatSmokeTransport;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
};

const DEFAULT_BASE_URL =
  process.env.ENGGO_CHAT_BASE_URL ?? "http://127.0.0.1:8000";
const MAX_429_RETRIES = 2;
const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;
const REQUEST_TIMEOUT_ENV = "ENGGO_PROVIDER_SMOKE_TIMEOUT_MS";

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function resolveRequestTimeoutMs() {
  const rawValue = process.env[REQUEST_TIMEOUT_ENV];

  if (!rawValue) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  return Math.round(parsedValue);
}

function normalizeText(value: string | undefined | null, maxLength: number) {
  const compact = (value ?? "").replace(/\s+/g, " ").trim();

  if (!compact) {
    return "-";
  }

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1)}…`;
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function summarizeGrounding(payload: ChatApiResponse) {
  const lemmas = unique([
    ...(payload.grounding?.mainAnswer?.map((item) => item.lemma) ?? []),
    ...(payload.grounding?.confusionBoundary?.map((item) => item.lemma) ?? []),
    ...(payload.grounding?.comparisonView?.members?.map((item) => item.lemma) ?? []),
    ...(payload.grounding?.rootFamilyView?.members?.map((item) => item.lemma) ?? []),
  ]);

  if (lemmas.length === 0) {
    return "-";
  }

  return normalizeText(lemmas.slice(0, 4).join("/"), 80);
}

function toProviderSmokePayload(
  status: number,
  payload: ChatApiResponse,
): ProviderSmokePayload {
  return {
    status,
    providerRequestId: payload.providerRequestId ?? null,
    answer: payload.answer,
    error: payload.error ?? null,
    grounding: payload.grounding,
  };
}

async function defaultRequestChat({
  item,
  baseUrl,
  signal,
}: Parameters<ChatSmokeTransport>[0]): Promise<ChatSmokeResponse> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      activeExamTarget: item.activeExamTarget,
      query: item.query,
      history: [],
    }),
    signal,
  });
  const payload = (await response.json()) as ChatApiResponse;

  return {
    status: response.status,
    payload,
  };
}

async function requestChatWithRetry({
  item,
  baseUrl,
  requestChat,
  sleep: sleepImpl,
  timeoutMs,
}: {
  item: ProviderSmokeCase;
  baseUrl: string;
  requestChat: ChatSmokeTransport;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
}) {
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt += 1) {
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new Error(`request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    let result: ChatSmokeResponse;

    try {
      result = await Promise.race([
        requestChat({
          item,
          attempt,
          baseUrl,
          signal: controller.signal,
        }),
        timeoutPromise,
      ]);
    } catch (error) {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      if (
        error instanceof Error
        && (error.name === "AbortError" || controller.signal.aborted)
      ) {
        throw new Error(`request timed out after ${timeoutMs}ms`);
      }

      throw error;
    }

    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    if (result.status !== 429 || attempt === MAX_429_RETRIES) {
      return result;
    }

    await sleepImpl((attempt + 1) * 1500);
  }

  throw new Error("unreachable");
}

function buildNextStep(summary: Omit<RunnerSummary, "nextStep">) {
  if (summary.fail > 0) {
    return "先处理 hard fail，再决定是否继续真实 smoke。";
  }

  if (summary.manual > 0) {
    return "先复查 manual 案例；如果问题重复出现，优先调 prompt guardrail。";
  }

  return "当前 smoke 可继续保持小批次，下一步按计划决定是扩 root prototype 还是补 prompt 验收。";
}

function wasProviderSkipped(result: RunnerCaseResult) {
  return (
    result.status === 200
    && !result.errorCode
    && !result.providerRequestId
  );
}

function wasProviderCalled(result: RunnerCaseResult) {
  return (
    Boolean(result.providerRequestId)
    || result.errorCode === "chat_generation_failed"
  );
}

function percentileNearestRank(sortedValues: number[], percentile: number) {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sortedValues.length) - 1),
  );

  return sortedValues[index] ?? 0;
}

function summarizeAnswerLengthsByStyle(
  results: RunnerCaseResult[],
): Record<string, AnswerLengthStats> {
  const buckets = new Map<string, { values: number[]; warnings: number }>();

  for (const result of results) {
    const key = result.answerStyle ?? "missing";
    const bucket = buckets.get(key) ?? { values: [], warnings: 0 };

    bucket.values.push(result.answerChars);

    if (
      result.manualFlags.some((flag) =>
        flag.startsWith("answer may be too long:")
      )
    ) {
      bucket.warnings += 1;
    }

    buckets.set(key, bucket);
  }

  return Object.fromEntries(
    [...buckets.entries()].map(([style, bucket]) => {
      const sortedValues = [...bucket.values].sort((a, b) => a - b);
      const total = sortedValues.reduce((sum, value) => sum + value, 0);

      return [
        style,
        {
          count: sortedValues.length,
          min: sortedValues[0] ?? 0,
          max: sortedValues.at(-1) ?? 0,
          average: sortedValues.length === 0
            ? 0
            : Math.round(total / sortedValues.length),
          p50: percentileNearestRank(sortedValues, 50),
          p90: percentileNearestRank(sortedValues, 90),
          warnings: bucket.warnings,
        },
      ];
    }),
  );
}

function buildRunnerSummary(results: RunnerCaseResult[]): RunnerSummary {
  const baseSummary = summarizeAnswerStyleProviderSmoke(results);
  const totalElapsedMs = results.reduce((sum, item) => sum + item.elapsedMs, 0);
  const summaryWithoutNextStep = {
    ...baseSummary,
    resolved: results.filter((item) => item.resolution === "resolved").length,
    no_match: results.filter((item) => item.resolution === "no_match").length,
    providerCalled: results.filter(wasProviderCalled).length,
    providerSkipped: results.filter(wasProviderSkipped).length,
    providerUnknown: results.filter(
      (item) => !wasProviderCalled(item) && !wasProviderSkipped(item),
    ).length,
    avgElapsedMs: results.length === 0 ? 0 : Math.round(totalElapsedMs / results.length),
    maxElapsedMs: results.reduce(
      (max, item) => Math.max(max, item.elapsedMs),
      0,
    ),
    answerLengthByStyle: summarizeAnswerLengthsByStyle(results),
  };

  return {
    ...summaryWithoutNextStep,
    nextStep: buildNextStep(summaryWithoutNextStep),
  };
}

export function formatAnswerStyleProviderSmokeLine(result: RunnerCaseResult) {
  return [
    `[${result.autoVerdict.toUpperCase()}]`,
    result.name,
    `${result.queryMode ?? "missing"}/${result.resolution ?? "missing"}/${result.answerStyle ?? "missing"}`,
    `provider=${result.providerRequestId ?? "-"}`,
    `elapsed=${result.elapsedMs}ms`,
    `chars=${result.answerChars}/${result.maxAnswerChars}`,
    `grounding=${result.groundingSummary}`,
    `answer=${result.answerPreview}`,
  ].join(" | ");
}

function printExpandedDetails(result: RunnerCaseResult) {
  if (result.hardFailures.length > 0) {
    console.log(`  hardFailures: ${JSON.stringify(result.hardFailures)}`);
  }

  if (result.manualChecks.length > 0) {
    console.log(`  manualChecks: ${JSON.stringify(result.manualChecks)}`);
  }

  if (result.manualFlags.length > 0) {
    console.log(`  manualFlags: ${JSON.stringify(result.manualFlags)}`);
  }

  if (result.errorMessage) {
    console.log(`  error: ${result.errorMessage}`);
  }
}

export async function runAnswerStyleProviderSmoke(
  options: RunAnswerStyleProviderSmokeOptions = {},
) {
  const cases = options.cases ?? buildAnswerStyleProviderSmokeCases();
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const requestChat = options.requestChat ?? defaultRequestChat;
  const sleepImpl = options.sleep ?? sleep;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? resolveRequestTimeoutMs();
  const results: RunnerCaseResult[] = [];

  for (const item of cases) {
    const startedAt = now();
    let status = 0;
    let payload: ChatApiResponse = {
      providerRequestId: null,
      error: null,
    };

    try {
      const response = await requestChatWithRetry({
        item,
        baseUrl,
        requestChat,
        sleep: sleepImpl,
        timeoutMs,
      });
      status = response.status;
      payload = response.payload;
    } catch (error) {
      payload = {
        providerRequestId: null,
        error: {
          code: "request_error",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }

    const verdict = evaluateAnswerStyleProviderSmoke(
      item,
      toProviderSmokePayload(status, payload),
    );
    const result: RunnerCaseResult = {
      ...verdict,
      status,
      queryMode: payload.grounding?.queryMode ?? null,
      resolution: payload.grounding?.resolution ?? null,
      answerStyle: payload.grounding?.answerStyle ?? null,
      providerRequestId: payload.providerRequestId ?? null,
      errorCode: payload.error?.code ?? null,
      elapsedMs: now() - startedAt,
      answerChars: (payload.answer?.trim() ?? "").length,
      maxAnswerChars: item.maxAnswerChars,
      groundingSummary: summarizeGrounding(payload),
      answerPreview: normalizeText(payload.answer, 88),
      errorMessage: payload.error?.message ?? null,
    };

    results.push(result);
    console.log(formatAnswerStyleProviderSmokeLine(result));

    if (result.autoVerdict !== "pass") {
      printExpandedDetails(result);
    }
  }

  const summary = buildRunnerSummary(results);

  return {
    results,
    summary,
  };
}

async function main() {
  const { results, summary } = await runAnswerStyleProviderSmoke();

  console.log("\n=== ANSWER STYLE PROVIDER SMOKE SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  if (results.some((item) => item.autoVerdict === "fail")) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
