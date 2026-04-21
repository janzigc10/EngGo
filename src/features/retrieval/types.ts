import type { ExamScopeCode } from "@/features/content/import-types";

export type QueryMode =
  | "meaning_lookup"
  | "fuzzy_recall"
  | "direct_compare"
  | "direct_lookup";

export type NormalizedQuery = {
  raw: string;
  normalizedText: string;
  queryMode: QueryMode;
  englishTerms: string[];
  meaningHint: string;
  compareTerms: [string, string] | null;
};

export type RetrievalCandidate = {
  entryId: string;
  lemma: string;
  meaningsZh: string[];
  matchedAlias: string | null;
  scopeCodes: ExamScopeCode[];
  inScope: boolean;
  reason: string;
  score: number;
};

export type ComparisonView = {
  id: string;
  whyConfusing: string;
  commonMisusePoints: string[];
  semanticBoundaryNotes: string[];
  members: Array<{
    entryId: string;
    lemma: string;
    meaningsZh: string[];
    emphasisNote: string | null;
    inScope: boolean;
  }>;
};

export type RetrievalResult = {
  queryMode: QueryMode;
  normalizedQuery: NormalizedQuery;
  candidates: RetrievalCandidate[];
  comparisonView: ComparisonView | null;
};

export type RankableCandidate = {
  entryId: string;
  lemma: string;
  meaningsZh: string[];
  matchedAlias: string | null;
  scopeCodes: ExamScopeCode[];
  exactLemma: boolean;
  exactAlias: boolean;
  textScore: number;
  meaningMatch: boolean;
  fromConfusionGroup: boolean;
};
