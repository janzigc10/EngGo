import type { ExamTargetCode } from "./model";

export const examScopeOrder = [
  "gaokao",
  "cet4",
  "cet6",
  "postgrad",
] as const satisfies readonly ExamTargetCode[];

const examScopeClosureByTarget: Record<ExamTargetCode, readonly ExamTargetCode[]> = {
  gaokao: ["gaokao"],
  cet4: ["gaokao", "cet4"],
  cet6: ["gaokao", "cet4", "cet6"],
  postgrad: ["gaokao", "cet4", "cet6", "postgrad"],
};

export const ecdictTagsByScopeCode: Record<ExamTargetCode, readonly string[]> = {
  gaokao: ["gk", "zk"],
  cet4: ["cet4"],
  cet6: ["cet6"],
  postgrad: ["ky"],
};

const ecdictScopeByTag = new Map<string, ExamTargetCode>(
  examScopeOrder.flatMap((scopeCode) =>
    ecdictTagsByScopeCode[scopeCode].map((tag) => [tag, scopeCode] as const),
  ),
);

const scopeRank = new Map<ExamTargetCode, number>(
  examScopeOrder.map((scopeCode, index) => [scopeCode, index]),
);

export function getExamScopeClosure(activeExamTarget: ExamTargetCode): ExamTargetCode[] {
  return [...examScopeClosureByTarget[activeExamTarget]];
}

export function scopeIncludedInExamTarget(
  scopeCode: ExamTargetCode,
  activeExamTarget: ExamTargetCode,
) {
  return examScopeClosureByTarget[activeExamTarget].includes(scopeCode);
}

export function hasScopeInExamTargetClosure(
  scopeCodes: readonly ExamTargetCode[],
  activeExamTarget: ExamTargetCode,
) {
  return scopeCodes.some((scopeCode) =>
    scopeIncludedInExamTarget(scopeCode, activeExamTarget),
  );
}

export function getEcdictTagsForExamScope(activeExamTarget: ExamTargetCode): string[] {
  return getExamScopeClosure(activeExamTarget).flatMap(
    (scopeCode) => ecdictTagsByScopeCode[scopeCode],
  );
}

export function scopeCodesFromEcdictTags(rawTags: string): ExamTargetCode[] {
  const scopes = new Set<ExamTargetCode>();

  for (const rawTag of rawTags.toLowerCase().split(/[\s,;/]+/)) {
    const scopeCode = ecdictScopeByTag.get(rawTag.trim());

    if (scopeCode) {
      scopes.add(scopeCode);
    }
  }

  return [...scopes].sort(
    (left, right) => (scopeRank.get(left) ?? 99) - (scopeRank.get(right) ?? 99),
  );
}
