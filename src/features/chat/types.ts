import type { ExamTargetCode } from "@/features/exam-target/model";

export type QueryMode =
  | "meaning_lookup"
  | "fuzzy_recall"
  | "shape_neighbor_search"
  | "root_family_summary"
  | "direct_compare"
  | "direct_lookup"
  | "semantic_expression";

export type AnswerStyle =
  | "standard_lookup"
  | "confusion_untangle"
  | "root_family_summary"
  | "expression_recall"
  | "semantic_expression"
  | "meaning_expression_advice"
  | "broad_vocab_summary";

export type RetrievalResolution = "resolved" | "no_match";

export type NoMatchReason = "low_confidence" | "out_of_kb";

export type RetrievalMatchType =
  | "exact"
  | "fuzzy"
  | "source_lemma_exact"
  | "external_dictionary_exact";

export type ConfusionClusterLabel =
  | "shape_like"
  | "root_family"
  | "prefix_family"
  | "meaning_near"
  | "collocation_boundary"
  | "exam_high_value";

export type ConfusionClusterPurpose =
  | "confusion_untangle"
  | "memory_map"
  | "expression_recall";

export type RootFamilyPriority =
  | "must_memorize"
  | "recognize"
  | "low_priority";

export type ChatGroundingCandidate = {
  entryId: string;
  lemma: string;
  partOfSpeech?: string;
  meaningsZh?: string[];
  meaningZh?: string;
  matchedAlias: string | null;
  scopeCodes: ExamTargetCode[];
  inScope: boolean;
  reason: string;
  score: number;
  sourceKind?: "structured" | "source_lemma" | "external_dictionary_basic";
  reviewStatus?: "unreviewed";
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

export type AnswerGrounding = {
  activeExamTarget: ExamTargetCode;
  activeExamTargetLabel: string;
  query: string;
  queryMode: QueryMode;
  answerStyle: AnswerStyle;
  resolution: RetrievalResolution;
  noMatchReason: NoMatchReason | null;
  matchType?: RetrievalMatchType | null;
  mainAnswer: ChatGroundingCandidate[];
  confusionBoundary: ChatGroundingCandidate[];
  scopeReminder: string;
  followUpPrompt: string;
  comparisonView: ComparisonView | null;
  rootFamilyView: RootFamilyView | null;
  spellingCorrection?: {
    input: string;
    lemma: string;
  } | null;
};

export type AnswerSurfaceType =
  | "lookup"
  | "phrase_lookup"
  | "candidate_list"
  | "compare"
  | "expression_advice"
  | "context_choice"
  | "root_family"
  | "clarification"
  | "plain";

export type AnswerSurfaceItem = {
  id?: string;
  entryId?: string;
  lemma: string;
  label?: string;
  partOfSpeech?: string | null;
  meaningZh?: string | null;
  sourceKind?: string | null;
  entryKind?: "word" | "phrase" | string | null;
  reason?: string | null;
  prefix?: string | null;
  priority?: RootFamilyPriority | string | null;
  inScope?: boolean | null;
  reviewStatus?: string | null;
};

export type AnswerSurface = {
  type: AnswerSurfaceType;
  title?: string;
  subtitle?: string | null;
  text?: string;
  note?: string | null;
  caution?: string | null;
  items?: AnswerSurfaceItem[];
  members?: AnswerSurfaceItem[];
  terms?: string[];
  meaningHint?: string | null;
  style?: string | null;
  options?: AnswerSurfaceItem[];
  source?: "comparison_view" | "main_answer" | string;
};

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatApiRequestBody = {
  activeExamTarget: ExamTargetCode;
  activeWordbookId: string;
  query: string;
  history: ChatHistoryMessage[];
  conversationContext?: ConversationalLearningContext;
};

export type LearningCandidateRef = {
  index: number;
  lemma: string;
  label: string;
  entryId?: string | null;
  sourceKind?:
    | "structured"
    | "source_lemma"
    | "external_dictionary_basic"
    | string
    | null;
  partOfSpeech?: string | null;
  meaningZh?: string | null;
  reviewStatus?: "unreviewed" | string | null;
};

export type ConversationalLearningContext = {
  version: 1;
  activeExamTarget: ExamTargetCode;
  sourceMessageId: string;
  topicKind: string;
  sourceQuery?: string | null;
  focus?: {
    kind: string;
    label: string;
    lemma?: string | null;
    index?: number | null;
  } | null;
  candidates: LearningCandidateRef[];
  continuationCandidates?: LearningCandidateRef[];
  availableActions: string[];
  expiresAfterTurns: number;
};

export type ResolvedFollowUp =
  | {
      kind: "resolved_query";
      query: string;
      activeExamTarget: ExamTargetCode;
      targetRefs: LearningCandidateRef[];
      reason: string;
    }
  | {
      kind: "resolved_action";
      action:
        | "collect_one"
        | "collect_group"
        | "switch_scope"
        | "show_more"
        | "study_guidance"
        | "context_choice"
        | string;
      activeExamTarget: ExamTargetCode;
      targetRefs: LearningCandidateRef[];
    }
  | {
      kind: "clarification";
      message: string;
      options: LearningCandidateRef[];
    };

export type ChatMessage = ChatHistoryMessage & {
  id: string;
  answerKind?: "grounded" | "plain";
  grounding?: AnswerGrounding;
  answerSurface?: AnswerSurface;
  requestId?: string;
  providerRequestId?: string | null;
  conversationContext?: ConversationalLearningContext;
  resolvedFollowUp?: ResolvedFollowUp;
};

export type ChatApiSuccessResponse = {
  answer: string;
  answerKind?: "grounded" | "plain";
  grounding?: AnswerGrounding;
  answerSurface?: AnswerSurface;
  requestId: string;
  providerRequestId: string | null;
  conversationContext?: ConversationalLearningContext;
  resolvedFollowUp?: ResolvedFollowUp;
};

export type ChatApiErrorResponse = {
  error?: {
    message?: string;
  };
};
