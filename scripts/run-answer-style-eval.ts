import "dotenv/config";

import { createChatService } from "../src/features/answering/chat-service";
import { db } from "../src/lib/db";
import { retrieveCandidates } from "../src/features/retrieval/retrieve-candidates";
import type { ExamScopeCode } from "../src/features/content/import-types";
import type {
  AnswerStyle,
  ConfusionClusterLabel,
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
  expectedAnswerStyle: AnswerStyle;
  expectedRootFamilyViewId?: string | null;
  expectedComparisonViewId?: string | null;
  expectedComparisonLabels?: ConfusionClusterLabel[];
  expectedPromptIncludes?: string[];
  expectedGroundingIncludes?: string[];
};

type CaseResult = {
  name: string;
  query: string;
  activeExamTarget: ExamScopeCode;
  queryMode: QueryMode;
  resolution: RetrievalResolution;
  answerStyle: AnswerStyle;
  rootFamilyViewId: string | null;
  comparisonViewId: string | null;
  providerCalled: boolean;
  elapsedMs: number;
  verdict: "pass" | "fail";
  failures: string[];
};

const cases: EvalCase[] = [
  {
    name: "confusion: stationery choice",
    query: "stationary 和 stationery 哪个是文具",
    activeExamTarget: "cet4",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedAnswerStyle: "confusion_untangle",
    expectedPromptIncludes: ["范围内相似词", "词义速览", "做题抓手"],
    expectedGroundingIncludes: ["stationary", "stationery"],
  },
  {
    name: "confusion: access assess excess",
    query: "access assess excess 怎么区分",
    activeExamTarget: "cet6",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedAnswerStyle: "confusion_untangle",
    expectedComparisonViewId: "access-assess-excess",
    expectedComparisonLabels: ["shape_like", "exam_high_value"],
    expectedPromptIncludes: ["范围内相似词", "词义速览", "做题抓手", "形近"],
    expectedGroundingIncludes: ["access", "assess", "excess"],
  },
  {
    name: "confusion: comply conform defer",
    query: "comply conform defer 怎么区分",
    activeExamTarget: "cet6",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedAnswerStyle: "confusion_untangle",
    expectedPromptIncludes: ["范围内相似词", "词义速览", "做题抓手"],
    expectedGroundingIncludes: ["comply", "conform", "defer"],
  },
  {
    name: "confusion: respect family",
    query: "respect 那组词怎么分",
    activeExamTarget: "cet4",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedAnswerStyle: "confusion_untangle",
    expectedComparisonViewId: "respect-respective-respectful-respectable",
    expectedComparisonLabels: ["root_family", "shape_like"],
    expectedPromptIncludes: ["范围内相似词", "词义速览", "做题抓手", "同根"],
    expectedGroundingIncludes: ["respect", "respective", "respectful", "respectable"],
  },
  {
    name: "cluster: stitute direct compare",
    query: "institute substitute constitute 怎么分",
    activeExamTarget: "cet6",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedAnswerStyle: "confusion_untangle",
    expectedComparisonViewId: "root-stitute",
    expectedComparisonLabels: ["root_family", "shape_like"],
    expectedPromptIncludes: ["同根", "共同片段", "anchorPattern"],
    expectedGroundingIncludes: ["institute", "institution", "constitute", "substitute"],
  },
  {
    name: "cluster: institute memory group",
    query: "跟 institute 一样那几个词怎么记",
    activeExamTarget: "cet6",
    expectedQueryMode: "direct_compare",
    expectedResolution: "resolved",
    expectedAnswerStyle: "confusion_untangle",
    expectedComparisonViewId: "root-stitute",
    expectedComparisonLabels: ["root_family", "shape_like"],
    expectedPromptIncludes: ["同根", "共同片段", "anchorPattern"],
    expectedGroundingIncludes: ["institute", "institution", "constitute", "substitute"],
  },
  {
    name: "root: stitute",
    query: "stitute 是什么",
    activeExamTarget: "cet6",
    expectedQueryMode: "root_family_summary",
    expectedResolution: "resolved",
    expectedAnswerStyle: "root_family_summary",
    expectedRootFamilyViewId: "root-stitute",
    expectedComparisonViewId: "root-stitute",
    expectedPromptIncludes: ["词根家族地图", "优先背"],
    expectedGroundingIncludes: ["institute", "institution", "constitute"],
  },
  {
    name: "root: tempt",
    query: "tempt 这一族怎么记",
    activeExamTarget: "cet6",
    expectedQueryMode: "root_family_summary",
    expectedResolution: "resolved",
    expectedAnswerStyle: "root_family_summary",
    expectedRootFamilyViewId: "root-tempt",
    expectedComparisonViewId: "root-tempt",
    expectedPromptIncludes: ["词根家族地图", "不要硬凑"],
    expectedGroundingIncludes: ["tempt", "temptation", "attempt", "contempt"],
  },
  {
    name: "root: unsupported combination",
    query: "re+con 的词根有什么词",
    activeExamTarget: "cet6",
    expectedQueryMode: "root_family_summary",
    expectedResolution: "no_match",
    expectedAnswerStyle: "root_family_summary",
    expectedRootFamilyViewId: null,
  },
  {
    name: "typo: reqeust still no-match",
    query: "有个像 reqeust 的词",
    activeExamTarget: "cet4",
    expectedQueryMode: "fuzzy_recall",
    expectedResolution: "no_match",
    expectedAnswerStyle: "standard_lookup",
    expectedRootFamilyViewId: null,
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
    ...(result.rootFamilyView?.members.map((member) => member.lemma) ?? []),
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

async function runCase(item: EvalCase): Promise<CaseResult> {
  const startedAt = Date.now();
  const retrievalResult = await retrieveCandidates({
    activeExamTarget: item.activeExamTarget,
    query: item.query,
  });
  const groundingLemmas = collectGroundingLemmas(retrievalResult);
  const failures: string[] = [];
  let providerCalled = false;
  let systemPrompt = "";

  const service = createChatService({
    provider: {
      async generateAnswer(input) {
        providerCalled = true;
        systemPrompt = input.systemPrompt;

        return {
          answer: `stub answer for ${input.grounding.query}`,
          providerRequestId: "answer_style_eval_stub",
        };
      },
    },
    createRequestId: () => `answer_style_eval_${item.name.replace(/\W+/g, "_")}`,
  });

  const serviceResult = await service.answer({
    activeExamTarget: item.activeExamTarget,
    query: item.query,
    history: [],
    retrievalResult,
  });

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

  if (serviceResult.grounding.answerStyle !== item.expectedAnswerStyle) {
    failures.push(
      `answerStyle expected ${item.expectedAnswerStyle}, received ${serviceResult.grounding.answerStyle}`,
    );
  }

  if ((serviceResult.grounding.rootFamilyView?.id ?? null) !== (item.expectedRootFamilyViewId ?? null)) {
    failures.push(
      `rootFamilyView expected ${item.expectedRootFamilyViewId ?? "null"}, received ${
        serviceResult.grounding.rootFamilyView?.id ?? "null"
      }`,
    );
  }

  if ("expectedComparisonViewId" in item) {
    const actualComparisonViewId = serviceResult.grounding.comparisonView?.id ?? null;

    if (actualComparisonViewId !== (item.expectedComparisonViewId ?? null)) {
      failures.push(
        `comparisonView expected ${item.expectedComparisonViewId ?? "null"}, received ${
          actualComparisonViewId ?? "null"
        }`,
      );
    }
  }

  for (const expectedLabel of item.expectedComparisonLabels ?? []) {
    if (!serviceResult.grounding.comparisonView?.labels.includes(expectedLabel)) {
      failures.push(`comparison labels missing ${expectedLabel}`);
    }
  }

  assertIncludes(groundingLemmas, item.expectedGroundingIncludes, "grounding", failures);

  for (const expectedPromptText of item.expectedPromptIncludes ?? []) {
    if (!systemPrompt.includes(expectedPromptText)) {
      failures.push(`system prompt missing ${expectedPromptText}`);
    }
  }

  if (retrievalResult.resolution === "resolved" && !providerCalled) {
    failures.push("resolved case did not reach chat provider");
  }

  if (retrievalResult.resolution === "no_match" && providerCalled) {
    failures.push("no-match case should short-circuit chat provider");
  }

  return {
    name: item.name,
    query: item.query,
    activeExamTarget: item.activeExamTarget,
    queryMode: retrievalResult.queryMode,
    resolution: retrievalResult.resolution,
    answerStyle: serviceResult.grounding.answerStyle,
    rootFamilyViewId: serviceResult.grounding.rootFamilyView?.id ?? null,
    comparisonViewId: serviceResult.grounding.comparisonView?.id ?? null,
    providerCalled,
    elapsedMs: Date.now() - startedAt,
    verdict: failures.length === 0 ? "pass" : "fail",
    failures,
  };
}

async function main() {
  const results: CaseResult[] = [];

  for (const item of cases) {
    const result = await runCase(item);
    results.push(result);
    console.log(`[${result.verdict.toUpperCase()}] ${result.name} (${result.elapsedMs}ms)`);

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

  console.log("\n=== ANSWER STYLE EVAL SUMMARY ===");
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
