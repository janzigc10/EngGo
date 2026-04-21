import type { ExamScopeCode } from "@/features/content/import-types";
import type {
  RankableCandidate,
  RetrievalCandidate,
} from "@/features/retrieval/types";

function buildReason(
  activeExamTarget: ExamScopeCode,
  candidate: RankableCandidate,
  inScopeLeadersExist: boolean,
) {
  const reasons: string[] = [];
  const inScope = candidate.scopeCodes.includes(activeExamTarget);

  if (candidate.meaningMatch) {
    reasons.push("中文释义命中");
  }

  if (candidate.exactLemma) {
    reasons.push("lemma 精确命中");
  } else if (candidate.exactAlias) {
    reasons.push("alias 精确命中");
  } else if (candidate.textScore >= 0.55) {
    reasons.push("英文片段高相似");
  } else if (candidate.textScore > 0) {
    reasons.push("英文片段相似");
  }

  if (candidate.fromConfusionGroup) {
    reasons.push("来自同一易混词组");
  }

  if (inScope && inScopeLeadersExist) {
    reasons.unshift("当前考试范围命中");
  }

  return reasons.join("，") || "候选词条";
}

function computeScore(activeExamTarget: ExamScopeCode, candidate: RankableCandidate) {
  const inScope = candidate.scopeCodes.includes(activeExamTarget);
  let score = inScope ? 300 : 40;

  if (candidate.meaningMatch) {
    score += 120;
  }

  if (candidate.exactLemma) {
    score += 120;
  }

  if (candidate.exactAlias) {
    score += 95;
  }

  score += Math.round(candidate.textScore * 100);

  if (candidate.fromConfusionGroup) {
    score += 25;
  }

  if (!inScope) {
    score -= 80;
  }

  return score;
}

export function rankCandidates(
  activeExamTarget: ExamScopeCode,
  candidates: RankableCandidate[],
) {
  const withScores = candidates.map((candidate) => {
    const inScope = candidate.scopeCodes.includes(activeExamTarget);

    return {
      ...candidate,
      inScope,
      score: computeScore(activeExamTarget, candidate),
    };
  });

  const inScopeLeadersExist = withScores.some(
    (candidate) =>
      candidate.inScope &&
      (candidate.meaningMatch ||
        candidate.exactLemma ||
        candidate.exactAlias ||
        candidate.textScore >= 0.3),
  );

  return withScores
    .filter((candidate) => !inScopeLeadersExist || candidate.inScope || candidate.score >= 120)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.lemma.localeCompare(right.lemma);
    })
    .map<RetrievalCandidate>((candidate) => ({
      entryId: candidate.entryId,
      lemma: candidate.lemma,
      meaningsZh: candidate.meaningsZh,
      matchedAlias: candidate.matchedAlias,
      scopeCodes: candidate.scopeCodes,
      inScope: candidate.inScope,
      reason: buildReason(activeExamTarget, candidate, inScopeLeadersExist),
      score: candidate.score,
    }));
}
