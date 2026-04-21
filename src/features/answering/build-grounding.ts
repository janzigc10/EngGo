import type { ExamScopeCode } from "@/features/content/import-types";
import type {
  ComparisonView,
  QueryMode,
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
  mainAnswer: RetrievalCandidate[];
  confusionBoundary: RetrievalCandidate[];
  scopeReminder: string;
  followUpPrompt: string;
  comparisonView: ComparisonView | null;
};

type BuildGroundingInput = {
  activeExamTarget: ExamScopeCode;
  query: string;
  queryMode?: QueryMode;
  candidates: RetrievalCandidate[];
  comparisonView: ComparisonView | null;
};

function buildScopeReminder(
  activeExamTarget: ExamScopeCode,
  outOfScopeCandidates: RetrievalCandidate[],
) {
  const activeExamTargetLabel = examTargetLabels[activeExamTarget];

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
  mainAnswer: RetrievalCandidate[],
  confusionBoundary: RetrievalCandidate[],
) {
  const wordGroup = [...mainAnswer, ...confusionBoundary]
    .slice(0, 3)
    .map((candidate) => candidate.lemma);

  if (wordGroup.length === 0) {
    return "如果你愿意，我可以继续根据你的记忆线索帮你缩小候选范围。";
  }

  return `如果你愿意，我可以继续把 ${wordGroup.join(" / ")} 的区别拆成一眼就能记住的规则。`;
}

export function buildGrounding(input: BuildGroundingInput): AnswerGrounding {
  const inScopeCandidates = input.candidates.filter((candidate) => candidate.inScope);
  const outOfScopeCandidates = input.candidates.filter((candidate) => !candidate.inScope);
  const orderedMainAnswers =
    inScopeCandidates.length > 0 ? inScopeCandidates : input.candidates;
  const mainAnswer = orderedMainAnswers.slice(
    0,
    input.queryMode === "direct_compare" ? 2 : 1,
  );
  const mainAnswerIds = new Set(mainAnswer.map((candidate) => candidate.entryId));
  const confusionBoundary = input.candidates
    .filter((candidate) => !mainAnswerIds.has(candidate.entryId))
    .slice(0, 3);

  return {
    activeExamTarget: input.activeExamTarget,
    activeExamTargetLabel: examTargetLabels[input.activeExamTarget],
    query: input.query,
    queryMode: input.queryMode ?? "direct_lookup",
    mainAnswer,
    confusionBoundary,
    scopeReminder: buildScopeReminder(input.activeExamTarget, outOfScopeCandidates),
    followUpPrompt: buildFollowUpPrompt(mainAnswer, confusionBoundary),
    comparisonView: input.comparisonView,
  };
}
