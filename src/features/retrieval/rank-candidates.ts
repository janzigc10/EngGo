import type { ExamScopeCode } from "@/features/content/import-types";
import type {
  RankableCandidate,
  RankedCandidate,
} from "@/features/retrieval/types";

function buildReason(
  activeExamTarget: ExamScopeCode,
  candidate: RankableCandidate,
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

  if (inScope) {
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
  return candidates
    .map<RankedCandidate>((candidate) => {
      const inScope = candidate.scopeCodes.includes(activeExamTarget);

      return {
        ...candidate,
        inScope,
        reason: buildReason(activeExamTarget, candidate),
        score: computeScore(activeExamTarget, candidate),
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.lemma.localeCompare(right.lemma);
    });
}
