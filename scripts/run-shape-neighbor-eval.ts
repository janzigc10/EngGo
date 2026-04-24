import "dotenv/config";

import { createChatService } from "../src/features/answering/chat-service";
import { db } from "../src/lib/db";
import { retrieveCandidates } from "../src/features/retrieval/retrieve-candidates";
import type { ExamScopeCode } from "../src/features/content/import-types";
import type {
  QueryMode,
  RetrievalResolution,
  RetrievalResult,
} from "../src/features/retrieval/types";

type EvalCase = {
  name: string;
  query: string;
  activeExamTarget: ExamScopeCode;
  expectedQueryMode: QueryMode;
  expectedResolution: RetrievalResolution;
  expectedGroundingIncludes?: string[];
  expectedComparisonViewId?: string;
  expectedPromptIncludes?: string[];
};

type CaseResult = {
  name: string;
  query: string;
  activeExamTarget: ExamScopeCode;
  queryMode: QueryMode;
  resolution: RetrievalResolution;
  elapsedMs: number;
  verdict: "pass" | "fail";
  failures: string[];
  groundingLemmas: string[];
  comparisonViewId: string | null;
  providerCalled: boolean;
};

const cases: EvalCase[] = [
  {
    name: "shape list: recent neighbors",
    query: "跟 recent 很像的词有哪些",
    activeExamTarget: "cet6",
    expectedQueryMode: "shape_neighbor_search",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["recent", "resent"],
    expectedComparisonViewId: "recent-resent",
    expectedPromptIncludes: ["形近词簇"],
  },
  {
    name: "shape misread: recent",
    query: "容易把 recent 看错成什么",
    activeExamTarget: "cet6",
    expectedQueryMode: "shape_neighbor_search",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["recent", "resent"],
    expectedComparisonViewId: "recent-resent",
    expectedPromptIncludes: ["形近词簇"],
  },
  {
    name: "direct compare: recent/resent",
    query: "recent 和 resent 的区别",
    activeExamTarget: "cet6",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["recent", "resent"],
    expectedComparisonViewId: "recent-resent",
  },
  {
    name: "direct compare: adapt/adopt",
    query: "adapt 和 adopt 的区别",
    activeExamTarget: "cet4",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["adapt", "adopt"],
    expectedComparisonViewId: "adapt-adopt",
  },
  {
    name: "direct compare: quiet/quite",
    query: "quiet 和 quite 的区别",
    activeExamTarget: "cet4",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["quiet", "quite"],
    expectedComparisonViewId: "quiet-quite",
  },
  {
    name: "P0 shape list: access neighbors",
    query: "跟 access 很像的词有哪些",
    activeExamTarget: "cet6",
    expectedQueryMode: "shape_neighbor_search",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["access", "assess", "excess"],
    expectedComparisonViewId: "access-assess-excess",
    expectedPromptIncludes: ["形近词簇"],
  },
  {
    name: "P0 shape misread: advice",
    query: "容易把 advice 看错成什么",
    activeExamTarget: "cet4",
    expectedQueryMode: "shape_neighbor_search",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["advice", "advise"],
    expectedComparisonViewId: "advice-advise",
    expectedPromptIncludes: ["形近词簇"],
  },
  {
    name: "P0 shape list: angel neighbors",
    query: "跟 angel 很像的词有哪些",
    activeExamTarget: "gaokao",
    expectedQueryMode: "shape_neighbor_search",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["angel", "angle", "ankle"],
    expectedComparisonViewId: "angel-angle-ankle",
    expectedPromptIncludes: ["形近词簇"],
  },
  {
    name: "P0 shape misread: assure",
    query: "容易把 assure 看成什么",
    activeExamTarget: "cet6",
    expectedQueryMode: "shape_neighbor_search",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["assure", "ensure", "insure"],
    expectedComparisonViewId: "assure-ensure-insure",
    expectedPromptIncludes: ["形近词簇"],
  },
  {
    name: "P0 shape list: breath neighbors",
    query: "跟 breath 很像的词有哪些",
    activeExamTarget: "cet4",
    expectedQueryMode: "shape_neighbor_search",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["breath", "breathe"],
    expectedComparisonViewId: "breath-breathe",
    expectedPromptIncludes: ["形近词簇"],
  },
  {
    name: "P0 direct compare: access/assess/excess",
    query: "access assess excess 怎么区分",
    activeExamTarget: "cet6",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["access", "assess", "excess"],
    expectedComparisonViewId: "access-assess-excess",
  },
  {
    name: "P0 direct compare: advice/advise",
    query: "advice 和 advise 的区别",
    activeExamTarget: "cet4",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["advice", "advise"],
    expectedComparisonViewId: "advice-advise",
  },
  {
    name: "P0 direct compare: accept/except",
    query: "accept 和 except 的区别",
    activeExamTarget: "cet4",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["accept", "except"],
    expectedComparisonViewId: "accept-except",
  },
  {
    name: "P0 direct compare: aboard/abroad",
    query: "aboard 和 abroad 的区别",
    activeExamTarget: "cet4",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["aboard", "abroad"],
    expectedComparisonViewId: "aboard-abroad",
  },
  {
    name: "P0 direct compare: angel/angle/ankle",
    query: "angel angle ankle 怎么区分",
    activeExamTarget: "gaokao",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["angel", "angle", "ankle"],
    expectedComparisonViewId: "angel-angle-ankle",
  },
  {
    name: "P0 direct compare: assure/ensure/insure",
    query: "assure ensure insure 怎么区分",
    activeExamTarget: "cet6",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["assure", "ensure", "insure"],
    expectedComparisonViewId: "assure-ensure-insure",
  },
  {
    name: "P0 direct compare: complement/compliment",
    query: "complement 和 compliment 的区别",
    activeExamTarget: "cet6",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["complement", "compliment"],
    expectedComparisonViewId: "complement-compliment",
  },
  {
    name: "P0 direct compare: principal/principle",
    query: "principal 和 principle 的区别",
    activeExamTarget: "cet4",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["principal", "principle"],
    expectedComparisonViewId: "principal-principle",
  },
  {
    name: "P0 direct compare: personal/personnel",
    query: "personal 和 personnel 的区别",
    activeExamTarget: "cet6",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["personal", "personnel"],
    expectedComparisonViewId: "personal-personnel",
  },
  {
    name: "P0 direct compare: economic/economical",
    query: "economic 和 economical 的区别",
    activeExamTarget: "cet6",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["economic", "economical"],
    expectedComparisonViewId: "economic-economical",
  },
  {
    name: "P0 direct compare: conscious/conscience",
    query: "conscious 和 conscience 的区别",
    activeExamTarget: "postgrad",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["conscious", "conscience"],
    expectedComparisonViewId: "conscious-conscience",
  },
  {
    name: "P0 direct compare: precede/proceed",
    query: "precede 和 proceed 的区别",
    activeExamTarget: "postgrad",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["precede", "proceed"],
    expectedComparisonViewId: "precede-proceed",
  },
  {
    name: "P0 direct compare: perspective/prospective",
    query: "perspective 和 prospective 的区别",
    activeExamTarget: "postgrad",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["perspective", "prospective"],
    expectedComparisonViewId: "perspective-prospective",
  },
  {
    name: "P0 direct compare: historic/historical",
    query: "historic 和 historical 的区别",
    activeExamTarget: "postgrad",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["historic", "historical"],
    expectedComparisonViewId: "historic-historical",
  },
  {
    name: "P0 direct compare: sensible/sensitive",
    query: "sensible 和 sensitive 的区别",
    activeExamTarget: "cet4",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["sensible", "sensitive"],
    expectedComparisonViewId: "sensible-sensitive",
  },
  {
    name: "P0 direct compare: considerable/considerate",
    query: "considerable 和 considerate 的区别",
    activeExamTarget: "cet6",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["considerable", "considerate"],
    expectedComparisonViewId: "considerable-considerate",
  },
  {
    name: "P0 direct compare: stationary/stationery",
    query: "stationary 和 stationery 的区别",
    activeExamTarget: "cet4",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["stationary", "stationery"],
    expectedComparisonViewId: "stationary-stationery",
  },
  {
    name: "P0 direct compare: device/devise",
    query: "device 和 devise 的区别",
    activeExamTarget: "cet6",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["device", "devise"],
    expectedComparisonViewId: "device-devise",
  },
  {
    name: "P0 direct compare: loose/lose",
    query: "loose 和 lose 的区别",
    activeExamTarget: "cet4",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["loose", "lose"],
    expectedComparisonViewId: "loose-lose",
  },
  {
    name: "P0 direct compare: breath/breathe",
    query: "breath 和 breathe 的区别",
    activeExamTarget: "cet4",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["breath", "breathe"],
    expectedComparisonViewId: "breath-breathe",
  },
  {
    name: "ordinary fuzzy recall stays separate",
    query: "有个像 institute 的词",
    activeExamTarget: "cet6",
    expectedQueryMode: "fuzzy_recall",
    expectedResolution: "resolved",
    expectedGroundingIncludes: ["institute", "institution"],
  },
  {
    name: "unknown shape neighbor stays no-match",
    query: "跟 zzzzword 很像的词有哪些",
    activeExamTarget: "cet6",
    expectedQueryMode: "shape_neighbor_search",
    expectedResolution: "no_match",
  },
  {
    name: "unknown compare stays no-match",
    query: "recent 和 consent 的区别",
    activeExamTarget: "cet6",
    expectedQueryMode: "direct_compare",
    expectedResolution: "no_match",
  },
  {
    name: "fragment input remains deferred",
    query: "re+con 的词根有什么词",
    activeExamTarget: "cet6",
    expectedQueryMode: "root_family_summary",
    expectedResolution: "no_match",
  },
];

function unique(values: string[]) {
  return [...new Set(values)];
}

function collectGroundingLemmas(result: RetrievalResult) {
  return unique([
    ...result.mainAnswer.map((candidate) => candidate.lemma),
    ...result.confusionBoundary.map((candidate) => candidate.lemma),
    ...(result.comparisonView?.members.map((member) => member.lemma) ?? []),
  ]);
}

function assertIncludes(
  actual: string[],
  expected: string[] | undefined,
  label: string,
  failures: string[],
) {
  if (!expected) {
    return;
  }

  for (const item of expected) {
    if (!actual.includes(item)) {
      failures.push(`${label} missing ${item}`);
    }
  }
}

async function runChatLevelCheck(item: EvalCase, retrievalResult: RetrievalResult) {
  let providerCalled = false;
  let systemPrompt = "";
  const service = createChatService({
    provider: {
      async generateAnswer(input) {
        providerCalled = true;
        systemPrompt = input.systemPrompt;

        return {
          answer: `stub answer for ${input.grounding.mainAnswer
            .map((candidate) => candidate.lemma)
            .join(" / ")}`,
          providerRequestId: "shape_eval_stub",
        };
      },
    },
    createRequestId: () => `shape_eval_${item.name.replace(/\W+/g, "_")}`,
  });

  await service.answer({
    activeExamTarget: item.activeExamTarget,
    query: item.query,
    history: [],
    retrievalResult,
  });

  return { providerCalled, systemPrompt };
}

async function runCase(item: EvalCase): Promise<CaseResult> {
  const startedAt = Date.now();
  const retrievalResult = await retrieveCandidates({
    activeExamTarget: item.activeExamTarget,
    query: item.query,
  });
  const groundingLemmas = collectGroundingLemmas(retrievalResult);
  const failures: string[] = [];

  if (retrievalResult.queryMode !== item.expectedQueryMode) {
    failures.push(
      `queryMode expected ${item.expectedQueryMode}, received ${retrievalResult.queryMode}`,
    );
  }

  if (retrievalResult.resolution !== item.expectedResolution) {
    failures.push(
      `resolution expected ${item.expectedResolution}, received ${retrievalResult.resolution}`,
    );
  }

  assertIncludes(
    groundingLemmas,
    item.expectedGroundingIncludes,
    "grounding",
    failures,
  );

  if (
    item.expectedComparisonViewId
    && retrievalResult.comparisonView?.id !== item.expectedComparisonViewId
  ) {
    failures.push(
      `comparisonView expected ${item.expectedComparisonViewId}, received ${
        retrievalResult.comparisonView?.id ?? "null"
      }`,
    );
  }

  const chatCheck = await runChatLevelCheck(item, retrievalResult);

  if (retrievalResult.resolution === "resolved" && !chatCheck.providerCalled) {
    failures.push("resolved case did not reach chat provider");
  }

  if (retrievalResult.resolution === "no_match" && chatCheck.providerCalled) {
    failures.push("no-match case should short-circuit chat provider");
  }

  for (const expectedPromptText of item.expectedPromptIncludes ?? []) {
    if (!chatCheck.systemPrompt.includes(expectedPromptText)) {
      failures.push(`system prompt missing ${expectedPromptText}`);
    }
  }

  return {
    name: item.name,
    query: item.query,
    activeExamTarget: item.activeExamTarget,
    queryMode: retrievalResult.queryMode,
    resolution: retrievalResult.resolution,
    elapsedMs: Date.now() - startedAt,
    verdict: failures.length === 0 ? "pass" : "fail",
    failures,
    groundingLemmas,
    comparisonViewId: retrievalResult.comparisonView?.id ?? null,
    providerCalled: chatCheck.providerCalled,
  };
}

async function main() {
  const results: CaseResult[] = [];

  for (const item of cases) {
    const result = await runCase(item);
    results.push(result);
    console.log(
      `[${result.verdict.toUpperCase()}] ${result.name} (${result.elapsedMs}ms)`,
    );

    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
  }

  const failed = results.filter((result) => result.verdict === "fail");
  const summary = {
    total: results.length,
    pass: results.length - failed.length,
    fail: failed.length,
    averageElapsedMs: Math.round(
      results.reduce((total, result) => total + result.elapsedMs, 0) / results.length,
    ),
  };

  console.log("\n=== SHAPE NEIGHBOR EVAL SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  if (failed.length > 0) {
    console.log("\n=== FAILURES ===");
    console.log(JSON.stringify(failed, null, 2));
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
