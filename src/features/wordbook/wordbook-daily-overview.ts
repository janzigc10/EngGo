import type { ActiveStudySessionSnapshot } from "@/features/wordbook/wordbook-active-session-store";
import type { WordbookProgressSnapshot } from "@/features/wordbook/wordbook-progress-store";
import type {
  StudyMode,
  Wordbook,
  WordbookStudySettings,
} from "@/features/wordbook/wordbook-types";

export type WordbookDailyOverviewAction = {
  kind:
    | "continue_review"
    | "continue_learn"
    | "start_review"
    | "start_learn"
    | "view_progress";
  href: "/learn" | "/review" | "/progress";
  label: string;
  detail: string;
  tone: "strong" | "quiet";
};

export type WordbookDailyOverviewMetric = {
  label: string;
  value: number;
};

export type WordbookDailyOverview = {
  title: string;
  summary: string;
  wordbookLabel: string;
  progressLabel: string;
  metrics: WordbookDailyOverviewMetric[];
  actions: WordbookDailyOverviewAction[];
};

type BuildWordbookDailyOverviewInput = {
  wordbook: Wordbook;
  snapshot: WordbookProgressSnapshot;
  settings: WordbookStudySettings;
  activeLearnSession: ActiveStudySessionSnapshot | null;
  activeReviewSession: ActiveStudySessionSnapshot | null;
};

export function buildWordbookDailyOverview({
  wordbook,
  snapshot,
  settings,
  activeLearnSession,
  activeReviewSession,
}: BuildWordbookDailyOverviewInput): WordbookDailyOverview {
  const actions: WordbookDailyOverviewAction[] = [];

  if (activeReviewSession) {
    actions.push(buildContinueAction("review", activeReviewSession));
  }

  if (activeLearnSession) {
    actions.push(buildContinueAction("learn", activeLearnSession));
  }

  if (!activeReviewSession && snapshot.dueReview > 0) {
    actions.push({
      kind: "start_review",
      href: "/review",
      label: "复习到期词",
      detail: `${snapshot.dueReview} 个待复习词，每组 ${settings.reviewTargetCount} 个`,
      tone: "strong",
    });
  }

  if (!activeLearnSession && snapshot.learnable > 0) {
    actions.push({
      kind: "start_learn",
      href: "/learn",
      label: "学习新词",
      detail: `${snapshot.learnable} 个可学习词，每组 ${settings.learnTargetCount} 个`,
      tone: actions.length === 0 ? "strong" : "quiet",
    });
  }

  actions.push({
    kind: "view_progress",
    href: "/progress",
    label: "查看进度",
    detail: `${snapshot.passed} / ${snapshot.total} 已阶段通过`,
    tone: actions.length === 0 ? "strong" : "quiet",
  });

  return {
    title: buildOverviewTitle({
      snapshot,
      hasActiveLearnSession: activeLearnSession !== null,
      hasActiveReviewSession: activeReviewSession !== null,
    }),
    summary: buildOverviewSummary({
      snapshot,
      hasActiveLearnSession: activeLearnSession !== null,
      hasActiveReviewSession: activeReviewSession !== null,
    }),
    wordbookLabel: wordbook.label,
    progressLabel: buildProgressLabel(snapshot),
    metrics: [
      { label: "待复习", value: snapshot.dueReview },
      { label: "可学习", value: snapshot.learnable },
      { label: "学习中", value: snapshot.learning },
      { label: "已通过", value: snapshot.passed },
    ],
    actions,
  };
}

function buildContinueAction(
  mode: StudyMode,
  session: ActiveStudySessionSnapshot,
): WordbookDailyOverviewAction {
  const isReview = mode === "review";

  return {
    kind: isReview ? "continue_review" : "continue_learn",
    href: isReview ? "/review" : "/learn",
    label: isReview ? "继续复习" : "继续学习",
    detail: formatSessionProgress(session),
    tone: "strong",
  };
}

function formatSessionProgress(session: ActiveStudySessionSnapshot) {
  const total = Math.max(1, session.state.totalTargets);
  const completed = Math.min(session.state.completedTargetLemmas.length, total);

  return `已完成 ${completed} / ${total}`;
}

function buildProgressLabel(snapshot: WordbookProgressSnapshot) {
  if (snapshot.total <= 0) {
    return "词书进度暂时为空";
  }

  return `词书进度 ${Math.round((snapshot.passed / snapshot.total) * 100)}%`;
}

function buildOverviewTitle({
  snapshot,
  hasActiveLearnSession,
  hasActiveReviewSession,
}: {
  snapshot: WordbookProgressSnapshot;
  hasActiveLearnSession: boolean;
  hasActiveReviewSession: boolean;
}) {
  if (hasActiveLearnSession || hasActiveReviewSession) {
    return "有未完成的学习轮次";
  }

  if (snapshot.dueReview > 0 && snapshot.learnable > 0) {
    return "复习和新词都在这里";
  }

  if (snapshot.dueReview > 0) {
    return "复习入口已经准备好";
  }

  if (snapshot.learnable > 0) {
    return "可以继续扩充词书";
  }

  return "今天没有堆积任务";
}

function buildOverviewSummary({
  snapshot,
  hasActiveLearnSession,
  hasActiveReviewSession,
}: {
  snapshot: WordbookProgressSnapshot;
  hasActiveLearnSession: boolean;
  hasActiveReviewSession: boolean;
}) {
  if (hasActiveLearnSession && hasActiveReviewSession) {
    return "Learn 和 Review 都有没收尾的轮次；入口都会保留，你可以直接切到想处理的部分。";
  }

  if (hasActiveReviewSession) {
    return "Review 有一轮没结束；新词和进度也会继续显示，不把你锁在一个选择里。";
  }

  if (hasActiveLearnSession) {
    return "Learn 有一轮没结束；到期复习和进度仍然放在同一处看。";
  }

  if (snapshot.dueReview > 0 && snapshot.learnable > 0) {
    return "今天有到期复习，也还有新词可学；这里把状态摊开，不替你排序。";
  }

  if (snapshot.dueReview > 0) {
    return "有词回到 Review 队列；想复习、查词或看进度都可以直接切换。";
  }

  if (snapshot.learnable > 0) {
    return "暂时没有到期复习；新词入口和整体进度都在这里。";
  }

  return "当前没有到期复习，也没有可学新词；可以看进度，或者继续用聊天查词。";
}
