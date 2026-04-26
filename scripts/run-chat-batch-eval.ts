import "dotenv/config";

type SupportedCase = {
  category: string;
  name: string;
  query: string;
  activeExamTarget: "gaokao" | "cet4" | "cet6" | "postgrad";
  expectedMainAnswerIncludes?: string[];
  minMainHits?: number;
  expectedGroundingIncludes?: string[];
  minGroundingHits?: number;
};

type UnsupportedCase = {
  category: string;
  name: string;
  query: string;
  activeExamTarget: "gaokao" | "cet4" | "cet6" | "postgrad";
  expectNoGrounding: true;
};

type TestCase = SupportedCase | UnsupportedCase;

type ChatResponse = {
  answer?: string;
  requestId?: string;
  providerRequestId?: string | null;
  error?: {
    code?: string;
    message?: string;
  };
  grounding?: {
    queryMode?: string;
    mainAnswer?: Array<{ lemma?: string }>;
    confusionBoundary?: Array<{ lemma?: string }>;
  };
};

type BatchCaseResult = TestCase & {
  status: number | null;
  elapsedMs: number | null;
  verdict: "pass" | "fail" | "error" | "manual";
  requestId: string | null;
  providerRequestId: string | null;
  queryMode: string | null;
  mainHits: number;
  groundingHits: number;
  mainAnswer: string[];
  confusionBoundary: string[];
  allGrounding: string[];
  answerPreview: string | null;
  error: ChatResponse["error"] | { code: string; message: string } | null;
};

const cases: TestCase[] = [
  {
    category: "知识库内-中文释义",
    name: "遵从",
    query: "遵从怎么说",
    activeExamTarget: "cet6",
    expectedMainAnswerIncludes: ["comply"],
    expectedGroundingIncludes: ["comply", "conform", "defer"],
    minGroundingHits: 2,
  },
  {
    category: "知识库内-直接对比",
    name: "comply vs conform vs defer",
    query: "comply、conform、defer 怎么区分",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["comply", "conform", "defer"],
    minGroundingHits: 3,
  },
  {
    category: "知识库内-直接对比",
    name: "restrain vs constrain",
    query: "restrain 和 constrain 的区别",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["restrain", "constrain", "curb"],
    minGroundingHits: 2,
  },
  {
    category: "知识库内-直接对比",
    name: "restrain vs constrain vs curb",
    query: "restrain、constrain、curb 怎么区分",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["restrain", "constrain", "curb"],
    minGroundingHits: 3,
  },
  {
    category: "知识库内-直接对比",
    name: "respect family",
    query: "respect、respective、respectful、respectable 怎么区分",
    activeExamTarget: "cet4",
    expectedGroundingIncludes: ["respect", "respective", "respectful", "respectable"],
    minGroundingHits: 4,
  },
  {
    category: "知识库内-直接对比",
    name: "institute vs institution vs establish",
    query: "institute、institution、establish 怎么区分",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["institute", "institution", "establish"],
    minGroundingHits: 3,
  },
  {
    category: "知识库内-直接对比",
    name: "affect vs effect vs impact",
    query: "affect、effect、impact 怎么区分",
    activeExamTarget: "cet4",
    expectedGroundingIncludes: ["affect", "effect", "impact"],
    minGroundingHits: 3,
  },
  {
    category: "知识库内-直接对比",
    name: "recommend vs suggest vs propose",
    query: "recommend suggest propose 怎么区分",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["recommend", "suggest", "propose"],
    minGroundingHits: 3,
  },
  {
    category: "知识库内-直接对比",
    name: "require vs demand vs request",
    query: "require demand request 的区别",
    activeExamTarget: "cet4",
    expectedGroundingIncludes: ["require", "demand", "request"],
    minGroundingHits: 3,
  },
  {
    category: "知识库内-直接对比",
    name: "adapt vs adjust vs accommodate",
    query: "adapt、adjust、accommodate 的区别",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["adapt", "adjust", "accommodate"],
    minGroundingHits: 3,
  },
  {
    category: "知识库内-使用场景",
    name: "建立机构",
    query: "建立机构一般用 institute 还是 establish",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["institute", "institution", "establish"],
    minGroundingHits: 2,
  },
  {
    category: "知识库内-使用场景",
    name: "适应环境",
    query: "适应环境用 adapt 还是 adjust",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["adapt", "adjust", "accommodate"],
    minGroundingHits: 2,
  },
  {
    category: "知识库内-使用场景",
    name: "建议别人做事",
    query: "建议别人做某事用 recommend 还是 suggest",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["recommend", "suggest", "propose"],
    minGroundingHits: 2,
  },
  {
    category: "知识库内-使用场景",
    name: "要求某人做事",
    query: "要求某人做某事用 require 还是 request",
    activeExamTarget: "cet4",
    expectedGroundingIncludes: ["require", "request", "demand"],
    minGroundingHits: 2,
  },
  {
    category: "知识库内-使用场景",
    name: "affect effect 词性",
    query: "affect 和 effect 哪个是动词",
    activeExamTarget: "cet4",
    expectedGroundingIncludes: ["affect", "effect", "impact"],
    minGroundingHits: 2,
  },
  {
    category: "知识库内-开放困惑",
    name: "comply conform 搞混",
    query: "为什么我总把 comply 和 conform 搞混",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["comply", "conform", "defer"],
    minGroundingHits: 2,
  },
  {
    category: "知识库内-词根家族",
    name: "respect 那组",
    query: "respect 那组词怎么分",
    activeExamTarget: "cet4",
    expectedMainAnswerIncludes: ["respect"],
    expectedGroundingIncludes: ["respect", "respective", "respectful", "respectable"],
    minGroundingHits: 4,
  },
  {
    category: "知识库内-模糊回忆",
    name: "像 institute 的词",
    query: "有个像 institute 的词",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["institute", "institution", "establish"],
    minGroundingHits: 2,
  },
  {
    category: "知识库内-模糊回忆",
    name: "拼错 institution",
    query: "有个像 instituton 的词",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["institute", "institution", "establish"],
    minGroundingHits: 2,
  },
  {
    category: "知识库内-模糊回忆",
    name: "拼错 request",
    query: "有个像 reqeust 的词",
    activeExamTarget: "cet4",
    expectedGroundingIncludes: ["request"],
    minGroundingHits: 1,
  },
  {
    category: "知识库内-模糊回忆",
    name: "拼错 recommend",
    query: "有个像 recomand 的词",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["recommend"],
    minGroundingHits: 1,
  },
  {
    category: "知识库内-形近词簇",
    name: "recent lookalikes",
    query: "跟 recent 很像的词有哪些",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["recent", "resent"],
    minGroundingHits: 2,
  },
  {
    category: "知识库内-形近词簇",
    name: "recent misread",
    query: "容易把 recent 看错成什么",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["recent", "resent"],
    minGroundingHits: 2,
  },
  {
    category: "知识库内-形近词簇",
    name: "adapt vs adopt",
    query: "adapt 和 adopt 的区别",
    activeExamTarget: "cet4",
    expectedGroundingIncludes: ["adapt", "adopt"],
    minGroundingHits: 2,
  },
  {
    category: "知识库内-形近词簇",
    name: "quiet vs quite",
    query: "quiet 和 quite 的区别",
    activeExamTarget: "cet4",
    expectedGroundingIncludes: ["quiet", "quite"],
    minGroundingHits: 2,
  },
  {
    category: "知识库外-形近词",
    name: "recent vs consent",
    query: "recent 和 consent 的区别",
    activeExamTarget: "cet6",
    expectNoGrounding: true,
  },
  {
    category: "知识库外-形近词",
    name: "consult vs result",
    query: "consult 和 result 的区别",
    activeExamTarget: "cet6",
    expectNoGrounding: true,
  },
  {
    category: "知识库内-词义查询",
    name: "recent meaning",
    query: "recent 这个词什么意思",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["recent", "resent"],
    minGroundingHits: 1,
  },
  {
    category: "知识库外-词义查询",
    name: "consult meaning",
    query: "consult 这个词什么意思",
    activeExamTarget: "cet6",
    expectNoGrounding: true,
  },
  {
    category: "知识库内-模糊回忆",
    name: "像 recent 的词",
    query: "有个像 recent 的词",
    activeExamTarget: "cet6",
    expectedGroundingIncludes: ["recent", "resent"],
    minGroundingHits: 1,
  },
  {
    category: "知识库外-模糊回忆",
    name: "像 consent 的词",
    query: "有个像 consent 的词",
    activeExamTarget: "cet6",
    expectNoGrounding: true,
  },
];

function countOverlap(actual: string[], expected: string[] | undefined) {
  if (!expected || expected.length === 0) {
    return 0;
  }

  return expected.filter((item) => actual.includes(item)).length;
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestChat(
  item: TestCase,
  attempt = 0,
): Promise<{ response: Response; payload: ChatResponse }> {
  const response = await fetch("http://127.0.0.1:3000/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      activeExamTarget: item.activeExamTarget,
      query: item.query,
      history: [],
    }),
  });
  const payload = (await response.json()) as ChatResponse;

  if (response.status === 429 && attempt < 4) {
    await sleep((attempt + 1) * 12000);
    return requestChat(item, attempt + 1);
  }

  return { response, payload };
}

async function runCase(item: TestCase): Promise<BatchCaseResult> {
  const startedAt = Date.now();
  const { response, payload } = await requestChat(item);
  const mainAnswer = unique(payload.grounding?.mainAnswer?.map((entry) => entry.lemma) ?? []);
  const confusionBoundary = unique(
    payload.grounding?.confusionBoundary?.map((entry) => entry.lemma) ?? [],
  );
  const allGrounding = unique([...mainAnswer, ...confusionBoundary]);

  let verdict: BatchCaseResult["verdict"] = "manual";
  let mainHits = 0;
  let groundingHits = 0;

  if ("expectNoGrounding" in item) {
    verdict = allGrounding.length === 0 ? "pass" : "fail";
  } else {
    mainHits = countOverlap(mainAnswer, item.expectedMainAnswerIncludes);
    groundingHits = countOverlap(allGrounding, item.expectedGroundingIncludes);

    const mainOk = !item.expectedMainAnswerIncludes
      || mainHits >= (item.minMainHits ?? 1);
    const groundingOk = !item.expectedGroundingIncludes
      || groundingHits >= (item.minGroundingHits ?? 1);

    verdict = response.ok && !payload.error && mainOk && groundingOk ? "pass" : "fail";
  }

  return {
    ...item,
    status: response.status,
    elapsedMs: Date.now() - startedAt,
    verdict,
    requestId: payload.requestId ?? null,
    providerRequestId: payload.providerRequestId ?? null,
    queryMode: payload.grounding?.queryMode ?? null,
    mainHits,
    groundingHits,
    mainAnswer,
    confusionBoundary,
    allGrounding,
    answerPreview: typeof payload.answer === "string" ? payload.answer.slice(0, 240) : null,
    error: payload.error ?? null,
  };
}

async function main() {
  const results: BatchCaseResult[] = [];

  for (const item of cases) {
    try {
      const result = await runCase(item);
      results.push(result);
      console.log(
        `[${result.verdict.toUpperCase()}] ${item.category} / ${item.name} (${result.elapsedMs}ms)`,
      );
    } catch (error) {
      results.push({
        ...item,
        status: null,
        elapsedMs: null,
        verdict: "error",
        requestId: null,
        providerRequestId: null,
        queryMode: null,
        mainHits: 0,
        groundingHits: 0,
        mainAnswer: [],
        confusionBoundary: [],
        allGrounding: [],
        answerPreview: null,
        error: {
          code: "script_error",
          message: error instanceof Error ? error.message : String(error),
        },
      });
      console.log(`[ERROR] ${item.category} / ${item.name}`);
    }
  }

  const summary = {
    total: results.length,
    pass: results.filter((item) => item.verdict === "pass").length,
    fail: results.filter((item) => item.verdict === "fail").length,
    error: results.filter((item) => item.verdict === "error").length,
    byCategory: Object.fromEntries(
      [...new Set(results.map((item) => item.category))].map((category) => [
        category,
        {
          total: results.filter((item) => item.category === category).length,
          pass: results.filter((item) => item.category === category && item.verdict === "pass")
            .length,
          fail: results.filter((item) => item.category === category && item.verdict === "fail")
            .length,
          error: results.filter((item) => item.category === category && item.verdict === "error")
            .length,
        },
      ]),
    ),
  };

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\n=== RESULTS ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
