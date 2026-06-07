import type { ExamTargetCode } from "@/features/exam-target/model";

export type WordbookId =
  | "gaokao-foundation-v1"
  | "cet4-foundation-v1"
  | "cet6-foundation-v1"
  | "postgrad-foundation-v1";

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
  examTarget: ExamTargetCode;
  entries: WordbookEntry[];
};

export type WordStudyStatus =
  | "unseen"
  | "learning"
  | "passed"
  | "reviewing"
  | "lapsed"
  | "reviewLapsed"
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

export type StudySessionGoal = 10 | 20 | 30;

export type WordbookStudySettings = {
  learnTargetCount: StudySessionGoal;
  reviewTargetCount: StudySessionGoal;
};

export type StudyCardStage =
  | "recognitionChoice"
  | "wrongChoiceContrast"
  | "detailReveal"
  | "guidedDetail"
  | "passDetail"
  | "answerReveal"
  | "guidedRecall"
  | "finalRecall"
  | "hiddenSelfRecall"
  | "reviewDetail"
  | "fuzzyDetail"
  | "forgotDetail"
  | "complete";

export type StudyMistake = {
  selectedMeaning: string;
  correctMeaning: string;
  selectedLemma?: string;
};

export type StudySessionTarget = {
  entry: WordbookEntry;
  progress: WordStudyProgress;
  masteryDots: MasteryDots;
  failedAttempts: number;
  resumeStage: StudyCardStage;
  eligibleAfterExposure: number;
  countsTowardGoal?: boolean;
  lastMistake?: StudyMistake;
  reviewPath?: "remembered" | "fuzzy" | "forgotten";
};

export type StudySessionState = {
  mode: StudyMode;
  sessionId: string;
  wordbookId: WordbookId;
  stage: StudyCardStage;
  current: StudySessionTarget | null;
  pending: StudySessionTarget[];
  reserve: StudySessionTarget[];
  completedTargetLemmas: string[];
  totalTargets: number;
  cardExposureCount: number;
};

export type StudySessionAction =
  | {
      type: "chooseMeaning";
      isCorrect: boolean;
      selectedMeaning?: string;
      correctMeaning?: string;
      selectedLemma?: string;
    }
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
