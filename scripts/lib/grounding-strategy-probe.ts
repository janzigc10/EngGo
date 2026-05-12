import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ExamScopeCode } from "@/features/content/import-types";
import { loadSourceLemmaMemberships } from "@/features/content/source-lemma-sources";

export type ProbeCase = {
  category: string;
  name: string;
  query: string;
  activeExamTarget: ExamScopeCode;
  intent: string;
};

export type ProbeVocabularyEntry = {
  lemma: string;
  scopes: ExamScopeCode[];
  sourceKinds: Array<"structured" | "source_lemma">;
  partOfSpeech?: string;
  meaningsZh: string[];
};

export type LightGroundingCandidate = ProbeVocabularyEntry & {
  score: number;
  reasons: string[];
};

export type ProbeModelAnswer = {
  providerRequestId: string | null;
  answer: string | null;
  error: string | null;
};

export type CurrentGroundedAnswer = {
  status: number | null;
  providerRequestId: string | null;
  answer: string | null;
  groundingSummary: string;
  error: string | null;
};

export type ProbeCaseResult = ProbeCase & {
  candidates: LightGroundingCandidate[];
  current: CurrentGroundedAnswer | null;
  direct: ProbeModelAnswer;
  light: ProbeModelAnswer;
};

type SeedEntry = {
  lemma?: string;
  pos?: string[];
  meaningsZh?: string[];
  examScopes?: ExamScopeCode[];
};

const prefixHintPattern = /(开头|前缀|词根|同根|长得像|很像|像|看错|归类|整理)/;
const semanticHintGroups = [
  {
    pattern: /(要求|请求|别人做事|命令)/,
    keywords: ["要求", "请求", "需要", "命令", "规定"],
  },
  {
    pattern: /(评论|评价|评估|看法)/,
    keywords: ["评论", "评价", "评估", "看法", "批评"],
  },
  {
    pattern: /(推荐|称赞|表扬)/,
    keywords: ["推荐", "称赞", "表扬", "赞扬", "建议"],
  },
];

export const defaultProbeCases: ProbeCase[] = [
  {
    category: "形近显式三词",
    name: "commend comment command",
    query: "commend、comment、command 这几个很像，怎么区分",
    activeExamTarget: "cet6",
    intent: "学生知道几个长得像的词，但不知道核心区别。",
  },
  {
    category: "形近开放召回",
    name: "command lookalikes",
    query: "有没有和 command 长得很像、容易看错的词",
    activeExamTarget: "cet6",
    intent: "学生只记得一个锚点词，希望召回一圈相近词。",
  },
  {
    category: "前缀开放整理",
    name: "com prefix cluster",
    query: "com 开头那些词老是混，能不能帮我整理一下",
    activeExamTarget: "cet6",
    intent: "学生按开头字母和视觉印象提问，不知道具体该问哪一组。",
  },
  {
    category: "前缀开放整理",
    name: "con prefix cluster",
    query: "con 开头的词太多了，哪些最容易混在一起",
    activeExamTarget: "cet6",
    intent: "学生按 con 前缀泛问，测试候选边界和模型归类能力。",
  },
  {
    category: "前缀开放整理",
    name: "re prefix cluster",
    query: "re 开头的词有没有什么常见归类，哪些容易混",
    activeExamTarget: "cet6",
    intent: "学生按 re 前缀泛问，测试模型是否乱讲词根理论。",
  },
  {
    category: "前缀混合边界",
    name: "re con broad",
    query: "re/con 开头那些很像的单词怎么整理，别太理论",
    activeExamTarget: "cet6",
    intent: "学生把两个高频前缀混在一起问，要求学习可用而不是词源论文。",
  },
  {
    category: "形近显式两词",
    name: "recommend commend",
    query: "recommend 和 commend 是不是一组，怎么记",
    activeExamTarget: "cet6",
    intent: "学生用一个熟词联想到 source-only 词，测试是否能处理未结构化候选。",
  },
  {
    category: "语义相近泛问",
    name: "comment review remark",
    query: "表示评论、评价的词有哪些容易混",
    activeExamTarget: "cet6",
    intent: "学生按中文语义泛问，模型可能扩很多词。",
  },
  {
    category: "形近显式三词",
    name: "adapt adopt adept",
    query: "adapt、adopt、adept 这几个怎么分",
    activeExamTarget: "cet6",
    intent: "经典形近词，测试模型直答和候选约束的差距。",
  },
  {
    category: "形近开放召回",
    name: "recent lookalikes",
    query: "recent 这个词我总看错，附近有哪些像它的词",
    activeExamTarget: "cet6",
    intent: "学生从一个锚点词找视觉近邻。",
  },
  {
    category: "词根/片段边界",
    name: "spect words",
    query: "spect 这串字母相关的词怎么整理",
    activeExamTarget: "cet6",
    intent: "学生用片段提问，测试候选过滤和模型总结。",
  },
  {
    category: "词根/片段边界",
    name: "stitute words",
    query: "stitute 结尾那几个词我分不清，帮我按考试常见用法整理",
    activeExamTarget: "cet6",
    intent: "已有 root prototype 附近的问题，测试当前路径和轻候选差距。",
  },
  {
    category: "no-match 边界",
    name: "re plus con",
    query: "re+con 的词根有什么词",
    activeExamTarget: "cet6",
    intent: "历史保守边界，测试模型直答是否会讲得过度自信。",
  },
  {
    category: "中文召回泛问",
    name: "require request demand",
    query: "表示要求别人做事的词有哪些容易混",
    activeExamTarget: "cet6",
    intent: "学生按中文场景泛问，测试模型是否能收束到考试词。",
  },
];

function normalizeLemma(value: string) {
  return value.trim().toLowerCase();
}

function normalizeScopes(scopes: ExamScopeCode[]) {
  const order: ExamScopeCode[] = ["gaokao", "cet4", "cet6", "postgrad"];
  const uniqueScopes = new Set(scopes);

  return order.filter((scope) => uniqueScopes.has(scope));
}

function normalizePartOfSpeech(parts: string[] | undefined) {
  if (!parts || parts.length === 0) {
    return undefined;
  }

  return parts.join("/");
}

function mergeEntry(
  entriesByLemma: Map<string, ProbeVocabularyEntry>,
  entry: ProbeVocabularyEntry,
) {
  const lemma = normalizeLemma(entry.lemma);
  const existing = entriesByLemma.get(lemma);

  if (!existing) {
    entriesByLemma.set(lemma, {
      ...entry,
      lemma,
      scopes: normalizeScopes(entry.scopes),
      meaningsZh: [...new Set(entry.meaningsZh)],
      sourceKinds: [...new Set(entry.sourceKinds)],
    });
    return;
  }

  entriesByLemma.set(lemma, {
    ...existing,
    scopes: normalizeScopes([...existing.scopes, ...entry.scopes]),
    sourceKinds: [...new Set([...existing.sourceKinds, ...entry.sourceKinds])],
    partOfSpeech: existing.partOfSpeech ?? entry.partOfSpeech,
    meaningsZh: [...new Set([...existing.meaningsZh, ...entry.meaningsZh])],
  });
}

export async function loadProbeVocabulary({
  datasetDir = path.join(process.cwd(), "data", "exam-vocab", "real-smoke"),
  sourceLemmaBaseDir = path.join(process.cwd(), "data", "exam-vocab"),
}: {
  datasetDir?: string;
  sourceLemmaBaseDir?: string;
} = {}) {
  const entriesByLemma = new Map<string, ProbeVocabularyEntry>();
  const [rawEntries, sourceMemberships] = await Promise.all([
    readFile(path.join(datasetDir, "entries.json"), "utf8"),
    loadSourceLemmaMemberships({ baseDir: sourceLemmaBaseDir }),
  ]);
  const structuredEntries = JSON.parse(rawEntries) as SeedEntry[];

  for (const entry of structuredEntries) {
    if (!entry.lemma) {
      continue;
    }

    mergeEntry(entriesByLemma, {
      lemma: entry.lemma,
      scopes: entry.examScopes ?? [],
      sourceKinds: ["structured"],
      partOfSpeech: normalizePartOfSpeech(entry.pos),
      meaningsZh: entry.meaningsZh ?? [],
    });
  }

  for (const membership of sourceMemberships) {
    mergeEntry(entriesByLemma, {
      lemma: membership.lemma,
      scopes: [membership.scopeCode],
      sourceKinds: ["source_lemma"],
      meaningsZh: [],
    });
  }

  return [...entriesByLemma.values()].sort((left, right) =>
    left.lemma.localeCompare(right.lemma),
  );
}

export function extractEnglishTokens(query: string) {
  return [...query.toLowerCase().matchAll(/[a-z]+(?:-[a-z]+)?/g)]
    .map((match) => match[0])
    .filter((token) => token.length >= 2);
}

function commonPrefixLength(left: string, right: string) {
  const maxLength = Math.min(left.length, right.length);
  let length = 0;

  while (length < maxLength && left[length] === right[length]) {
    length += 1;
  }

  return length;
}

function boundedEditDistance(source: string, target: string, maxDistance = 3) {
  if (Math.abs(source.length - target.length) > maxDistance) {
    return maxDistance + 1;
  }

  let previousRow = Array.from({ length: target.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= source.length; leftIndex += 1) {
    const currentRow = [leftIndex];
    let rowMinimum = currentRow[0] ?? 0;

    for (let rightIndex = 1; rightIndex <= target.length; rightIndex += 1) {
      const substitutionCost = source[leftIndex - 1] === target[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        (previousRow[rightIndex] ?? 0) + 1,
        (currentRow[rightIndex - 1] ?? 0) + 1,
        (previousRow[rightIndex - 1] ?? 0) + substitutionCost,
      );

      currentRow.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }

    if (rowMinimum > maxDistance) {
      return maxDistance + 1;
    }

    previousRow = currentRow;
  }

  return previousRow[target.length] ?? maxDistance + 1;
}

function hasActiveScope(entry: ProbeVocabularyEntry, activeExamTarget: ExamScopeCode) {
  return entry.scopes.includes(activeExamTarget);
}

function scoreEntry({
  entry,
  query,
  tokens,
  activeExamTarget,
}: {
  entry: ProbeVocabularyEntry;
  query: string;
  tokens: string[];
  activeExamTarget: ExamScopeCode;
}) {
  let score = hasActiveScope(entry, activeExamTarget) ? 30 : 0;
  const reasons: string[] = [];
  const hasPrefixHint = prefixHintPattern.test(query);

  if (entry.sourceKinds.includes("structured")) {
    score += 6;
    reasons.push("structured");
  }

  for (const token of tokens) {
    const prefixLength = commonPrefixLength(entry.lemma, token);

    if (entry.lemma === token) {
      score += 120;
      reasons.push(`exact:${token}`);
      continue;
    }

    if (hasPrefixHint && entry.lemma.startsWith(token)) {
      score += token.length <= 2 ? 35 : 55;
      reasons.push(`prefix:${token}`);
    }

    if (token.length >= 3 && entry.lemma.includes(token)) {
      score += 22;
      reasons.push(`contains:${token}`);
    }

    if (token.length >= 4 && entry.lemma.length >= 4) {
      const distance = boundedEditDistance(token, entry.lemma, 3);

      if (distance <= 3) {
        score += Math.max(0, 58 - distance * 14);
        reasons.push(`edit${distance}:${token}`);
      }
    }

    if (prefixLength >= 3 && token.length >= 4) {
      score += 18 + prefixLength * 2;
      reasons.push(`common-prefix:${token}`);
    }
  }

  for (const group of semanticHintGroups) {
    if (!group.pattern.test(query)) {
      continue;
    }

    const matchedKeyword = group.keywords.find((keyword) =>
      entry.meaningsZh.some((meaning) => meaning.includes(keyword)),
    );

    if (matchedKeyword) {
      score += 70;
      reasons.push(`meaning:${matchedKeyword}`);
    }
  }

  return {
    score,
    reasons,
  };
}

function sortCandidates(left: LightGroundingCandidate, right: LightGroundingCandidate) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (left.sourceKinds.includes("structured") !== right.sourceKinds.includes("structured")) {
    return left.sourceKinds.includes("structured") ? -1 : 1;
  }

  if (left.lemma.length !== right.lemma.length) {
    return left.lemma.length - right.lemma.length;
  }

  return left.lemma.localeCompare(right.lemma);
}

function reasonsMentionToken(candidate: LightGroundingCandidate, token: string) {
  return candidate.reasons.some((reason) => reason.endsWith(`:${token}`));
}

export function buildLightGroundingCandidates({
  vocabulary,
  probeCase,
  limit = 18,
}: {
  vocabulary: ProbeVocabularyEntry[];
  probeCase: ProbeCase;
  limit?: number;
}) {
  const tokens = extractEnglishTokens(probeCase.query);

  const scoredCandidates = vocabulary
    .map((entry) => ({
      ...entry,
      ...scoreEntry({
        entry,
        query: probeCase.query,
        tokens,
        activeExamTarget: probeCase.activeExamTarget,
      }),
    }))
    .filter((candidate) => candidate.score >= 45)
    .sort(sortCandidates);
  const selected = new Map<string, LightGroundingCandidate>();
  const perTokenLimit = Math.max(2, Math.floor(limit / Math.max(1, tokens.length)));

  for (const token of tokens) {
    for (const candidate of scoredCandidates
      .filter((item) => reasonsMentionToken(item, token))
      .slice(0, perTokenLimit)) {
      selected.set(candidate.lemma, candidate);
    }
  }

  for (const candidate of scoredCandidates) {
    selected.set(candidate.lemma, candidate);

    if (selected.size >= limit) {
      break;
    }
  }

  return [...selected.values()].sort(sortCandidates).slice(0, limit);
}

export function formatCandidateForPrompt(candidate: LightGroundingCandidate) {
  const source = candidate.sourceKinds.includes("structured")
    ? "structured"
    : "source_lemma";
  const meanings = candidate.meaningsZh.length > 0
    ? candidate.meaningsZh.slice(0, 3).join("；")
    : "暂无结构化中文释义";
  const partOfSpeech = candidate.partOfSpeech ? ` ${candidate.partOfSpeech}` : "";

  return `- ${candidate.lemma}${partOfSpeech} | ${meanings} | scopes=${candidate.scopes.join(",") || "-"} | source=${source}`;
}

export function buildDirectSystemPrompt(activeExamTarget: ExamScopeCode) {
  return [
    "你是一个面向中国学生备考的英语学习助手。",
    `当前考试目标是 ${activeExamTarget}。`,
    "用户的问题可能很泛、很口语化，像一个学生在描述自己哪里混了。",
    "请直接回答，不要声称你看到了 EngGo 词库或内部 grounding。",
    "优先给出学生能记住的区分方式；如果不确定，明确说不确定。",
    "不要堆太多词，回答控制在 180-260 个中文字符左右。",
  ].join("\n");
}

export function buildLightGroundingSystemPrompt({
  activeExamTarget,
  candidates,
}: {
  activeExamTarget: ExamScopeCode;
  candidates: LightGroundingCandidate[];
}) {
  return [
    "你是 EngGo 的轻 grounding 实验助手。",
    `当前考试目标是 ${activeExamTarget}。`,
    "下面候选来自考试词表和少量结构化词条，不代表完整人工易混组。",
    "请先从候选里挑最值得给学生讲的 3-6 个词；候选不足时可以少讲。",
    "不要把候选外词作为主要答案。若必须补充候选外词，请明确标为“额外补充”。",
    "回答要像学习建议，不要像技术日志；控制在 220-320 个中文字符左右。",
    "",
    "候选池：",
    candidates.length > 0
      ? candidates.map(formatCandidateForPrompt).join("\n")
      : "- 候选池为空",
  ].join("\n");
}

export function summarizeGrounding(payload: {
  grounding?: {
    queryMode?: string;
    resolution?: string;
    answerStyle?: string;
    matchType?: string | null;
    mainAnswer?: Array<{ lemma?: string }>;
    confusionBoundary?: Array<{ lemma?: string }>;
    comparisonView?: { members?: Array<{ lemma?: string }> } | null;
    rootFamilyView?: { members?: Array<{ lemma?: string }> } | null;
  };
}) {
  const grounding = payload.grounding;

  if (!grounding) {
    return "-";
  }

  const lemmas = [
    ...(grounding.mainAnswer?.map((item) => item.lemma) ?? []),
    ...(grounding.confusionBoundary?.map((item) => item.lemma) ?? []),
    ...(grounding.comparisonView?.members?.map((item) => item.lemma) ?? []),
    ...(grounding.rootFamilyView?.members?.map((item) => item.lemma) ?? []),
  ].filter((lemma): lemma is string => Boolean(lemma));

  return [
    grounding.queryMode,
    grounding.resolution,
    grounding.answerStyle,
    grounding.matchType,
    lemmas.length > 0 ? [...new Set(lemmas)].slice(0, 8).join("/") : "-",
  ].filter(Boolean).join(" | ");
}

function compact(value: string | null, maxLength: number) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "-";
  }

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1)}…`;
}

export function buildProbeMarkdownReport({
  generatedAt,
  results,
}: {
  generatedAt: string;
  results: ProbeCaseResult[];
}) {
  const lines = [
    "# Grounding Strategy Probe",
    "",
    `Generated at: ${generatedAt}`,
    "",
    "## Summary",
    "",
    `- Cases: ${results.length}`,
    `- Current grounded included: ${results.filter((result) => result.current).length}`,
    `- Direct model errors: ${results.filter((result) => result.direct.error).length}`,
    `- Light-grounding errors: ${results.filter((result) => result.light.error).length}`,
    "",
    "## Case Results",
    "",
  ];

  for (const result of results) {
    lines.push(
      `### ${result.name}`,
      "",
      `- Category: ${result.category}`,
      `- Query: ${result.query}`,
      `- Intent: ${result.intent}`,
      `- Candidates: ${result.candidates.map((candidate) => candidate.lemma).join(", ") || "-"}`,
      `- Current grounding: ${result.current?.groundingSummary ?? "skipped"}`,
      "",
      "**Current grounded**",
      "",
      compact(result.current?.answer ?? null, 700),
      "",
      "**Model direct**",
      "",
      result.direct.error ? `ERROR: ${result.direct.error}` : compact(result.direct.answer, 900),
      "",
      "**Light grounding + model**",
      "",
      result.light.error ? `ERROR: ${result.light.error}` : compact(result.light.answer, 900),
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}
