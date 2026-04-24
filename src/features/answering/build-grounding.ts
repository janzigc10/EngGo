import type { ExamScopeCode } from "@/features/content/import-types";
import type {
  AnswerStyle,
  ComparisonView,
  NoMatchReason,
  QueryMode,
  RootFamilyView,
  RetrievalResolution,
  RetrievalCandidate,
} from "@/features/retrieval/types";

const examTargetLabels: Record<ExamScopeCode, string> = {
  gaokao: "高考",
  cet4: "CET-4",
  cet6: "CET-6",
  postgrad: "考研",
};

export type AnswerGrounding = {
  activeExamTarget: ExamScopeCode;
  activeExamTargetLabel: string;
  query: string;
  queryMode: QueryMode;
  answerStyle: AnswerStyle;
  resolution: RetrievalResolution;
  noMatchReason: NoMatchReason | null;
  mainAnswer: RetrievalCandidate[];
  confusionBoundary: RetrievalCandidate[];
  scopeReminder: string;
  followUpPrompt: string;
  comparisonView: ComparisonView | null;
  rootFamilyView: RootFamilyView | null;
};

type BuildGroundingInput = {
  activeExamTarget: ExamScopeCode;
  query: string;
  queryMode: QueryMode;
  resolution: RetrievalResolution;
  noMatchReason: NoMatchReason | null;
  mainAnswer: RetrievalCandidate[];
  confusionBoundary: RetrievalCandidate[];
  comparisonView: ComparisonView | null;
  rootFamilyView?: RootFamilyView | null;
};

function deriveAnswerStyle(
  queryMode: QueryMode,
  comparisonView: ComparisonView | null,
): AnswerStyle {
  if (queryMode === "root_family_summary") {
    return "root_family_summary";
  }

  if (queryMode === "shape_neighbor_search") {
    return "confusion_untangle";
  }

  if (comparisonView) {
    return "confusion_untangle";
  }

  return "standard_lookup";
}

function buildScopeReminder(
  activeExamTarget: ExamScopeCode,
  selectedCandidates: RetrievalCandidate[],
  resolution: RetrievalResolution,
) {
  const activeExamTargetLabel = examTargetLabels[activeExamTarget];

  if (resolution === "no_match") {
    return `这次我会继续优先按 ${activeExamTargetLabel} 范围帮你缩小候选，不随意扩到范围外。`;
  }

  const outOfScopeCandidates = selectedCandidates.filter((candidate) => !candidate.inScope);

  if (outOfScopeCandidates.length === 0) {
    return `这次回答已优先锁定在 ${activeExamTargetLabel} 范围内，后续我也会继续按这个范围帮你筛词。`;
  }

  const outOfScopeLemmas = outOfScopeCandidates
    .slice(0, 3)
    .map((candidate) => candidate.lemma)
    .join(" / ");

  return `这次先以 ${activeExamTargetLabel} 范围内答案为主；如果你想顺带扩展，范围外还可以看看 ${outOfScopeLemmas}。`;
}

function buildFollowUpPrompt(
  resolution: RetrievalResolution,
  mainAnswer: RetrievalCandidate[],
  confusionBoundary: RetrievalCandidate[],
) {
  if (resolution === "no_match") {
    return "如果你愿意，可以再告诉我中文义项、词首或词尾，或者你容易和哪个词搞混。";
  }

  const wordGroup = [...mainAnswer, ...confusionBoundary]
    .slice(0, 3)
    .map((candidate) => candidate.lemma);

  if (wordGroup.length === 0) {
    return "如果你愿意，我可以继续根据你的记忆线索帮你缩小候选范围。";
  }

  return `如果你愿意，我可以继续把 ${wordGroup.join(" / ")} 的区别拆成一眼就能记住的规则。`;
}

export function buildGrounding(input: BuildGroundingInput): AnswerGrounding {
  const selectedCandidates = [...input.mainAnswer, ...input.confusionBoundary];

  return {
    activeExamTarget: input.activeExamTarget,
    activeExamTargetLabel: examTargetLabels[input.activeExamTarget],
    query: input.query,
    queryMode: input.queryMode,
    answerStyle: deriveAnswerStyle(input.queryMode, input.comparisonView),
    resolution: input.resolution,
    noMatchReason: input.noMatchReason,
    mainAnswer: input.mainAnswer,
    confusionBoundary: input.confusionBoundary,
    scopeReminder: buildScopeReminder(
      input.activeExamTarget,
      selectedCandidates,
      input.resolution,
    ),
    followUpPrompt: buildFollowUpPrompt(
      input.resolution,
      input.mainAnswer,
      input.confusionBoundary,
    ),
    comparisonView: input.comparisonView,
    rootFamilyView: input.rootFamilyView ?? null,
  };
}
