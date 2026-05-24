import type { AnswerGrounding } from "@/features/answering/build-grounding";
import type { ExamTargetCode } from "@/features/exam-target/model";

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
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
  focus?: {
    kind: string;
    label: string;
    lemma?: string | null;
    index?: number | null;
  } | null;
  candidates: LearningCandidateRef[];
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
      action: "collect_one" | "collect_group" | string;
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
  requestId?: string;
  providerRequestId?: string | null;
  conversationContext?: ConversationalLearningContext;
  resolvedFollowUp?: ResolvedFollowUp;
};

export type ChatApiSuccessResponse = {
  answer: string;
  answerKind?: "grounded" | "plain";
  grounding?: AnswerGrounding;
  requestId: string;
  providerRequestId: string | null;
  conversationContext?: ConversationalLearningContext;
  resolvedFollowUp?: ResolvedFollowUp;
};
