import type {
  ConfusionClusterLabel,
  ConfusionClusterPurpose,
  ExamScopeCode,
} from "@/features/content/import-types";

export type {
  ConfusionClusterLabel,
  ConfusionClusterPurpose,
} from "@/features/content/import-types";

export type QueryMode =
  | "meaning_lookup"
  | "fuzzy_recall"
  | "shape_neighbor_search"
  | "root_family_summary"
  | "direct_compare"
  | "direct_lookup";

export type AnswerStyle =
  | "standard_lookup"
  | "confusion_untangle"
  | "root_family_summary"
  | "expression_recall";

export type RootFamilyPriority =
  | "must_memorize"
  | "recognize"
  | "low_priority";

export type RootFamilyView = {
  id: string;
  fragment: string;
  coreImage: string;
  note: string;
  caution: string;
  members: Array<{
    lemma: string;
    partOfSpeech: string;
    prefix: string | null;
    prefixDirection: string;
    actionStory: string;
    modernMeaningZh: string;
    priority: RootFamilyPriority;
    entryId: string | null;
    inScope: boolean;
  }>;
};

export type RetrievalResolution = "resolved" | "no_match";

export type NoMatchReason = "low_confidence" | "out_of_kb";

export type RetrievalMatchType = "exact" | "fuzzy" | "source_lemma_exact";

export type CandidateProvenance =
  | "exact_lemma"
  | "exact_alias"
  | "fuzzy_text"
  | "meaning_match"
  | "confusion_group"
  | "source_lemma";

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
  sourceKind?: "structured" | "source_lemma";
};

export type ComparisonView = {
  id: string;
  whyConfusing: string;
  commonMisusePoints: string[];
  semanticBoundaryNotes: string[];
  labels: ConfusionClusterLabel[];
  purposes: ConfusionClusterPurpose[];
  anchorPattern: string | null;
  quickDistinction: string | null;
  examHook: string | null;
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
  matchType?: RetrievalMatchType | null;
  candidates: RetrievalCandidate[];
  mainAnswer: RetrievalCandidate[];
  confusionBoundary: RetrievalCandidate[];
  comparisonView: ComparisonView | null;
  rootFamilyView?: RootFamilyView | null;
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
  sourceKind?: "structured" | "source_lemma";
};

export type RankedCandidate = RankableCandidate & {
  inScope: boolean;
  reason: string;
  score: number;
};
