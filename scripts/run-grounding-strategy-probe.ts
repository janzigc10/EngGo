import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createOpenAiChatProvider } from "../src/features/answering/chat-provider";
import {
  createEcdictBasicProfileLookup,
  type EcdictBasicProfileLookup,
} from "../src/features/content/ecdict-basic-profiles";
import {
  buildDirectSystemPrompt,
  buildLightGroundingCandidates,
  buildLightGroundingSystemPrompt,
  buildProbeMarkdownReport,
  defaultProbeCases,
  loadProbeVocabulary,
  summarizeGrounding,
  type CurrentGroundedAnswer,
  type LightGroundingCandidate,
  type ProbeCase,
  type ProbeCaseResult,
  type ProbeModelAnswer,
  type ProbeVocabularyEntry,
} from "./lib/grounding-strategy-probe";

type ChatApiResponse = {
  answer?: string;
  providerRequestId?: string | null;
  error?: {
    code?: string;
    message?: string;
  } | null;
  grounding?: Parameters<typeof summarizeGrounding>[0]["grounding"];
};

type ProbeOptions = {
  currentBaseUrl: string | null;
  reportName: string;
  limit: number;
  timeoutMs: number;
};

const defaultOutputDir = path.join(process.cwd(), "output", "grounding-strategy-probe");

function parseArgs(argv: string[]): ProbeOptions {
  const options: ProbeOptions = {
    currentBaseUrl: null,
    reportName: `probe-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    limit: defaultProbeCases.length,
    timeoutMs: 60_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--current-base-url" && next) {
      options.currentBaseUrl = next.replace(/\/+$/, "");
      index += 1;
      continue;
    }

    if (arg === "--report-name" && next) {
      options.reportName = next;
      index += 1;
      continue;
    }

    if (arg === "--limit" && next) {
      const parsed = Number(next);

      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = Math.round(parsed);
      }

      index += 1;
      continue;
    }

    if (arg === "--timeout-ms" && next) {
      const parsed = Number(next);

      if (Number.isFinite(parsed) && parsed > 0) {
        options.timeoutMs = Math.round(parsed);
      }

      index += 1;
    }
  }

  return options;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function callProvider({
  query,
  requestId,
  systemPrompt,
}: {
  query: string;
  requestId: string;
  systemPrompt: string;
}): Promise<ProbeModelAnswer> {
  const provider = createOpenAiChatProvider();

  try {
    const result = await provider.generateAnswer({
      query,
      history: [],
      requestId,
      systemPrompt,
    });

    return {
      providerRequestId: result.providerRequestId,
      answer: result.answer,
      error: null,
    };
  } catch (error) {
    return {
      providerRequestId: null,
      answer: null,
      error: errorMessage(error),
    };
  }
}

async function callCurrentGrounded({
  probeCase,
  baseUrl,
  timeoutMs,
}: {
  probeCase: ProbeCase;
  baseUrl: string;
  timeoutMs: number;
}): Promise<CurrentGroundedAnswer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        activeExamTarget: probeCase.activeExamTarget,
        query: probeCase.query,
        history: [],
      }),
      signal: controller.signal,
    });
    const payload = (await response.json()) as ChatApiResponse;

    return {
      status: response.status,
      providerRequestId: payload.providerRequestId ?? null,
      answer: payload.answer ?? null,
      groundingSummary: summarizeGrounding(payload),
      error: payload.error?.message ?? null,
    };
  } catch (error) {
    return {
      status: null,
      providerRequestId: null,
      answer: null,
      groundingSummary: "-",
      error: errorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichCandidatesWithEcdict(
  candidates: LightGroundingCandidate[],
  lookup: EcdictBasicProfileLookup,
) {
  return Promise.all(
    candidates.map(async (candidate) => {
      if (candidate.meaningsZh.length > 0) {
        return candidate;
      }

      const profile = await lookup(candidate.lemma);

      return {
        ...candidate,
        meaningsZh: profile?.meanings.slice(0, 2) ?? [],
      };
    }),
  );
}

async function runProbeCase({
  probeCase,
  vocabulary,
  ecdictLookup,
  currentBaseUrl,
  timeoutMs,
}: {
  probeCase: ProbeCase;
  vocabulary: ProbeVocabularyEntry[];
  ecdictLookup: EcdictBasicProfileLookup;
  currentBaseUrl: string | null;
  timeoutMs: number;
}): Promise<ProbeCaseResult> {
  const candidates = await enrichCandidatesWithEcdict(
    buildLightGroundingCandidates({
      vocabulary,
      probeCase,
      limit: 18,
    }),
    ecdictLookup,
  );
  const [current, direct, light] = await Promise.all([
    currentBaseUrl
      ? callCurrentGrounded({
        probeCase,
        baseUrl: currentBaseUrl,
        timeoutMs,
      })
      : Promise.resolve(null),
    callProvider({
      query: probeCase.query,
      requestId: `direct_${probeCase.name.replace(/\W+/g, "_")}`,
      systemPrompt: buildDirectSystemPrompt(probeCase.activeExamTarget),
    }),
    callProvider({
      query: probeCase.query,
      requestId: `light_${probeCase.name.replace(/\W+/g, "_")}`,
      systemPrompt: buildLightGroundingSystemPrompt({
        activeExamTarget: probeCase.activeExamTarget,
        candidates,
      }),
    }),
  ]);

  return {
    ...probeCase,
    candidates,
    current,
    direct,
    light,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cases = defaultProbeCases.slice(0, options.limit);
  const generatedAt = new Date().toISOString();
  const results: ProbeCaseResult[] = [];
  const vocabulary = await loadProbeVocabulary();
  const ecdictLookup = createEcdictBasicProfileLookup();

  for (const probeCase of cases) {
    const result = await runProbeCase({
      probeCase,
      vocabulary,
      ecdictLookup,
      currentBaseUrl: options.currentBaseUrl,
      timeoutMs: options.timeoutMs,
    });

    results.push(result);
    console.log(
      [
        `[${results.length}/${cases.length}]`,
        probeCase.name,
        `candidates=${result.candidates.map((candidate) => candidate.lemma).slice(0, 6).join("/") || "-"}`,
        `current=${result.current?.status ?? "skipped"}`,
        `direct=${result.direct.error ? "error" : "ok"}`,
        `light=${result.light.error ? "error" : "ok"}`,
      ].join(" | "),
    );
  }

  await mkdir(defaultOutputDir, { recursive: true });

  const jsonPath = path.join(defaultOutputDir, `${options.reportName}.json`);
  const markdownPath = path.join(defaultOutputDir, `${options.reportName}.md`);
  const report = {
    generatedAt,
    options,
    results,
  };

  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, buildProbeMarkdownReport({ generatedAt, results }), "utf8"),
  ]);

  console.log("\n=== GROUNDING STRATEGY PROBE ===");
  console.log(`JSON: ${jsonPath}`);
  console.log(`Markdown: ${markdownPath}`);
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
