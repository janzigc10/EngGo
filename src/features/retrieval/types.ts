import type { ExamScopeCode } from "@/features/content/import-types";

export type QueryMode =
  | "meaning_lookup"
  | "fuzzy_recall"
  | "direct_compare"
  | "direct_lookup";

export type RetrievalResolution = "resolved" | "no_match";

export type NoMatchReason = "low_confidence" | "out_of_kb";

export type CandidateProvenance =
  | "exact_lemma"
  | "exact_alias"
  | "fuzzy_text"
  | "meaning_match"
  | "confusion_group";

export type NormalizedQuery = {
  raw: string;
  normalizedText: string;
  queryMode: QueryMode;
  englishTerms: string[];
  meaningHint: string;
  compareTerms: string[];
  groupSeedTerm: string | null;
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
  resolution: RetrievalResolution;
  noMatchReason: NoMatchReason | null;
  candidates: RetrievalCandidate[];
  mainAnswer: RetrievalCandidate[];
  confusionBoundary: RetrievalCandidate[];
  comparisonView: ComparisonView | null;
};

export type RankableCandidate = {
  entryId: string;
  lemma: string;
  meaningsZh: string[];
  matchedAlias: string | null;
  scopeCodes: ExamScopeCode[];
  confusionGroupIds: string[];
  exactLemma: boolean;
  exactAlias: boolean;
  textScore: number;
  meaningMatch: boolean;
  fromConfusionGroup: boolean;
  provenance: CandidateProvenance[];
};

export type RankedCandidate = RankableCandidate & {
  inScope: boolean;
  reason: string;
  score: number;
};
