import { addCollectedWord } from "@/features/collections/collection-store";
import type { CollectedWordInput } from "@/features/collections/collection-store";
import type { ExamTargetCode } from "@/features/exam-target/model";
import type {
  ChatMessage,
  ConversationalLearningContext,
  LearningCandidateRef,
  ResolvedFollowUp,
} from "@/features/chat/types";

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed || undefined;
}

function normalizeSourceKind(
  value: LearningCandidateRef["sourceKind"],
): CollectedWordInput["sourceKind"] {
  if (
    value === "external_dictionary_basic" ||
    value === "source_lemma" ||
    value === "structured"
  ) {
    return value;
  }

  return undefined;
}

function normalizeReviewStatus(
  value: LearningCandidateRef["reviewStatus"],
): CollectedWordInput["reviewStatus"] {
  return value === "unreviewed" ? value : undefined;
}

function toCollectedWordInput(candidate: LearningCandidateRef): CollectedWordInput {
  const meaningZh = normalizeOptionalText(candidate.meaningZh);
  const label = normalizeOptionalText(candidate.label);

  return {
    lemma: candidate.lemma,
    note: meaningZh ?? label ?? candidate.lemma,
    meaningZh,
    partOfSpeech: normalizeOptionalText(candidate.partOfSpeech),
    reviewStatus: normalizeReviewStatus(candidate.reviewStatus),
    sourceKind: normalizeSourceKind(candidate.sourceKind),
  };
}

export function latestConversationContext(
  messages: ChatMessage[],
  activeExamTarget?: ExamTargetCode,
): ConversationalLearningContext | null {
  let laterUserTurns = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.role === "user") {
      laterUserTurns += 1;
      continue;
    }

    if (message.conversationContext) {
      if (
        laterUserTurns <= message.conversationContext.expiresAfterTurns &&
        (
          !activeExamTarget ||
          message.conversationContext.activeExamTarget === activeExamTarget
        )
      ) {
        return message.conversationContext;
      }
    }
  }

  return null;
}

export function applyResolvedFollowUpAction(
  resolvedFollowUp: ResolvedFollowUp,
  activeExamTarget: ExamTargetCode,
): string {
  if (
    resolvedFollowUp.kind !== "resolved_action" ||
    (
      resolvedFollowUp.action !== "collect_one" &&
      resolvedFollowUp.action !== "collect_group"
    )
  ) {
    return "";
  }

  const targetExamTarget = resolvedFollowUp.activeExamTarget ?? activeExamTarget;
  const collectedWords = resolvedFollowUp.targetRefs.map((candidate) =>
    addCollectedWord(targetExamTarget, toCollectedWordInput(candidate)),
  );

  if (collectedWords.length === 0) {
    return "No words collected";
  }

  if (collectedWords.length === 1) {
    return `Collected: ${collectedWords[0].lemma}`;
  }

  return `Collected ${collectedWords.length} words: ${collectedWords
    .map((word) => word.lemma)
    .join(" / ")}`;
}
