import type { ExamTargetCode } from "@/features/exam-target/model";

export type WordbookId = "cet6-foundation-v1";

export type WordbookEntry = {
  id: string;
  lemma: string;
  aliases: string[];
  pos: string[];
  meaningsZh: string[];
  examScopes: ExamTargetCode[];
  examples: string[];
  collocations: string[];
};

export type Wordbook = {
  id: WordbookId;
  label: string;
  sourceLabel: string;
  entries: WordbookEntry[];
};

export type WordStudyStatus =
  | "unseen"
  | "learning"
  | "passed"
  | "reviewing"
  | "lapsed"
  | "blockedContent";

export type MasteryDots = 0 | 1 | 2 | 3;
export type ReviewStrength = 0 | 1 | 2 | 3;

export type WordStudyProgress = {
  wordbookId: WordbookId;
  lemma: string;
  status: WordStudyStatus;
  masteryDots: MasteryDots;
  reviewStrength: ReviewStrength;
  seenCount: number;
  correctCount: number;
  wrongCount: number;
  lastSeenAt?: string;
  nextReviewAt?: string;
  updatedAt: string;
};

export type StudyMode = "learn" | "review";

export type StudyCardStage =
  | "recognitionChoice"
  | "detailReveal"
  | "answerReveal"
  | "guidedRecall"
  | "finalRecall"
  | "hiddenSelfRecall"
  | "reviewDetail"
  | "fuzzyDetail"
  | "forgotDetail"
  | "complete";

export type StudySessionTarget = {
  entry: WordbookEntry;
  progress: WordStudyProgress;
  masteryDots: MasteryDots;
  failedAttempts: number;
  reviewPath?: "remembered" | "fuzzy" | "forgotten";
};

export type StudySessionState = {
  mode: StudyMode;
  sessionId: string;
  wordbookId: WordbookId;
  stage: StudyCardStage;
  current: StudySessionTarget | null;
  pending: StudySessionTarget[];
  completedTargetLemmas: string[];
  totalTargets: number;
};

export type StudySessionAction =
  | { type: "chooseMeaning"; isCorrect: boolean }
  | { type: "showAnswer" }
  | { type: "blockCurrent" }
  | { type: "continueFromDetail" }
  | { type: "markKnown" }
  | { type: "markFuzzy" }
  | { type: "markForgotten" }
  | { type: "markUnknown" }
  | { type: "nextCard" };

export type StudyEngineResult = {
  state: StudySessionState;
  progressUpdates: WordStudyProgress[];
};
