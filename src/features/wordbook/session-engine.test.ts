import { describe, expect, it } from "vitest";

import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import { getNextReviewAt } from "@/features/wordbook/wordbook-progress-store";
import {
  applyStudyAction,
  createLearnSession,
  createReviewSession,
} from "@/features/wordbook/session-engine";
import type {
  StudySessionState,
  WordStudyProgress,
} from "@/features/wordbook/wordbook-types";

const now = new Date("2026-05-30T12:00:00.000Z");

function passedProgress(lemma: string, reviewStrength = 1): WordStudyProgress {
  return {
    wordbookId: "cet6-foundation-v1",
    lemma,
    status: "passed",
    masteryDots: 3,
    reviewStrength: reviewStrength as 1 | 2 | 3,
    seenCount: 1,
    correctCount: 1,
    wrongCount: 0,
    nextReviewAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z",
  };
}

function reviewLapsedProgress(lemma: string): WordStudyProgress {
  return {
    ...passedProgress(lemma, 1),
    status: "reviewLapsed",
    masteryDots: 0,
    nextReviewAt: "2026-05-30T00:00:00.000Z",
  };
}

function advanceLearnCardCorrectly(state: StudySessionState) {
  if (state.stage === "recognitionChoice") {
    const detail = applyStudyAction(
      state,
      { type: "chooseMeaning", isCorrect: true },
      { now },
    );

    expect(detail.state.stage).toBe("detailReveal");

    return applyStudyAction(
      detail.state,
      { type: "continueFromDetail" },
      { now },
    ).state;
  }

  if (state.stage === "guidedRecall" || state.stage === "finalRecall") {
    const detail = applyStudyAction(state, { type: "markKnown" }, { now });

    expect(["guidedDetail", "passDetail"]).toContain(detail.state.stage);

    return applyStudyAction(
      detail.state,
      { type: "continueFromDetail" },
      { now },
    ).state;
  }

  throw new Error(`Cannot advance Learn card from ${state.stage}`);
}

function advanceUntilLearnTarget(
  state: StudySessionState,
  lemma: string,
  stage: StudySessionState["stage"],
) {
  let nextState = state;

  for (let index = 0; index < 30; index += 1) {
    if (
      nextState.current?.entry.lemma === lemma &&
      nextState.stage === stage
    ) {
      return nextState;
    }

    nextState = advanceLearnCardCorrectly(nextState);
  }

  throw new Error(`Could not reach ${lemma} at ${stage}`);
}

function failLearnCard(state: StudySessionState) {
  const action =
    state.stage === "recognitionChoice"
      ? ({ type: "chooseMeaning", isCorrect: false } as const)
      : ({ type: "markUnknown" } as const);
  const reveal = applyStudyAction(state, action, { now });

  if (state.stage === "recognitionChoice") {
    expect(reveal.state.stage).toBe("wrongChoiceContrast");

    const answerReveal = applyStudyAction(
      reveal.state,
      { type: "continueFromDetail" },
      { now },
    );

    expect(answerReveal.state.stage).toBe("answerReveal");

    const requeued = applyStudyAction(
      answerReveal.state,
      { type: "continueFromDetail" },
      { now },
    ).state;

    return { reveal, requeued };
  }

  expect(reveal.state.stage).toBe("answerReveal");

  const requeued = applyStudyAction(
    reveal.state,
    { type: "continueFromDetail" },
    { now },
  ).state;

  return { reveal, requeued };
}

describe("learn session engine", () => {
  it("starts with up to 10 unseen or learning entries", () => {
    const wordbook = getDefaultWordbook();
    const session = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-1",
      targetCount: 10,
    });

    expect(session.mode).toBe("learn");
    expect(session.totalTargets).toBe(10);
    expect(session.stage).toBe("recognitionChoice");
    expect(session.current?.entry.lemma).toBe(wordbook.entries[0].lemma);
  });

  it("can start with 20 Learn targets when enough words exist", () => {
    const wordbook = getDefaultWordbook();
    const session = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-20",
      targetCount: 20,
    });

    expect(wordbook.entries.length).toBeGreaterThanOrEqual(20);
    expect(session.totalTargets).toBe(20);
    expect(session.pending).toHaveLength(19);
  });

  it.each([999, -1, Number.NaN])(
    "defaults invalid Learn target count %s to 10",
    (targetCount) => {
      const wordbook = getDefaultWordbook();
      const session = createLearnSession({
        wordbook,
        progressRecords: [],
        now,
        sessionId: "learn-invalid-target",
        targetCount: targetCount as unknown as 10,
      });

      expect(session.totalTargets).toBe(10);
      expect(session.pending).toHaveLength(9);
    },
  );

  it("interleaves a Learn word between mastery dots before passing it", () => {
    const wordbook = getDefaultWordbook();
    const session = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-1",
      targetCount: 10,
    });
    const firstLemma = session.current?.entry.lemma;

    const recognition = applyStudyAction(
      session,
      { type: "chooseMeaning", isCorrect: true },
      { now },
    );
    expect(recognition.progressUpdates[0]).toMatchObject({
      status: "learning",
      masteryDots: 1,
    });
    const recognitionState = recognition.state;
    expect(recognitionState.stage).toBe("detailReveal");
    expect(recognitionState.current?.masteryDots).toBe(1);

    let state = applyStudyAction(
      recognitionState,
      { type: "continueFromDetail" },
      { now },
    ).state;
    expect(state.current?.entry.lemma).not.toBe(firstLemma);
    expect(state.stage).toBe("recognitionChoice");

    for (let index = 0; index < 3; index += 1) {
      state = advanceLearnCardCorrectly(state);
    }

    expect(state.current?.entry.lemma).toBe(firstLemma);
    expect(state.stage).toBe("guidedRecall");
    expect(state.current?.masteryDots).toBe(1);

    const guidedKnown = applyStudyAction(state, { type: "markKnown" }, { now });
    expect(guidedKnown.progressUpdates[0]).toMatchObject({
      status: "learning",
      masteryDots: 2,
    });
    expect(guidedKnown.state.stage).toBe("guidedDetail");

    state = applyStudyAction(
      guidedKnown.state,
      { type: "continueFromDetail" },
      { now },
    ).state;
    expect(state.current?.entry.lemma).not.toBe(firstLemma);

    for (let index = 0; index < 4; index += 1) {
      state = advanceLearnCardCorrectly(state);
    }

    expect(state.current?.entry.lemma).toBe(firstLemma);
    expect(state.stage).toBe("finalRecall");
    expect(state.current?.masteryDots).toBe(2);

    const finalDetail = applyStudyAction(state, { type: "markKnown" }, { now });
    expect(finalDetail.state.stage).toBe("passDetail");
    expect(finalDetail.progressUpdates[0]).toMatchObject({
      status: "learning",
      masteryDots: 3,
    });

    const result = applyStudyAction(
      finalDetail.state,
      { type: "continueFromDetail" },
      { now },
    );

    expect(result.progressUpdates[0]).toMatchObject({
      status: "passed",
      masteryDots: 3,
      reviewStrength: 1,
      seenCount: 3,
      correctCount: 3,
    });
    expect(result.progressUpdates[0].nextReviewAt).toBe(getNextReviewAt(now, 1));
    expect(result.state.completedTargetLemmas).toContain(session.current?.entry.lemma);
  });

  it("shows contrast, reveals detail, and requeues a wrong recognition answer", () => {
    const wordbook = getDefaultWordbook();
    const session = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-1",
      targetCount: 10,
    });
    const failedLemma = session.current?.entry.lemma;

    const reveal = applyStudyAction(
      session,
      {
        type: "chooseMeaning",
        isCorrect: false,
        selectedMeaning: "wrong meaning",
        correctMeaning: "correct meaning",
        selectedLemma: "wrong-lemma",
      },
      { now },
    );
    expect(reveal.progressUpdates[0]).toMatchObject({
      status: "learning",
      wrongCount: 1,
    });
    expect(reveal.state.stage).toBe("wrongChoiceContrast");
    expect(reveal.state.current?.lastMistake).toEqual({
      selectedMeaning: "wrong meaning",
      correctMeaning: "correct meaning",
      selectedLemma: "wrong-lemma",
    });

    const answerReveal = applyStudyAction(
      reveal.state,
      { type: "continueFromDetail" },
      { now },
    );
    expect(answerReveal.state.stage).toBe("answerReveal");

    const requeued = applyStudyAction(
      answerReveal.state,
      { type: "continueFromDetail" },
      { now },
    ).state;

    expect(requeued.current?.entry.lemma).not.toBe(failedLemma);
    expect(requeued.pending.map((target) => target.entry.lemma)).toContain(failedLemma);
  });

  it("does not increase mastery dots after a wrong recognition answer", () => {
    const wordbook = getDefaultWordbook();
    const session = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-wrong-mastery",
      targetCount: 10,
    });
    const result = applyStudyAction(
      session,
      {
        type: "chooseMeaning",
        isCorrect: false,
        selectedMeaning: "wrong meaning",
        correctMeaning: "correct meaning",
        selectedLemma: "wrong-lemma",
      },
      { now },
    );

    expect(result.state.current?.masteryDots).toBe(0);
    expect(result.progressUpdates[0]).toMatchObject({
      masteryDots: 0,
      correctCount: 0,
      wrongCount: 1,
    });
  });

  it("clears previous mistake data before a wrong-choice target is reanswered correctly", () => {
    const wordbook = getDefaultWordbook();
    const session = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-clear-stale-mistake",
      targetCount: 10,
    });
    const failedLemma = session.current?.entry.lemma;
    let state = applyStudyAction(
      session,
      {
        type: "chooseMeaning",
        isCorrect: false,
        selectedMeaning: "wrong meaning",
        correctMeaning: "correct meaning",
        selectedLemma: "wrong-lemma",
      },
      { now },
    ).state;

    expect(state.current?.lastMistake).toEqual({
      selectedMeaning: "wrong meaning",
      correctMeaning: "correct meaning",
      selectedLemma: "wrong-lemma",
    });

    state = applyStudyAction(state, { type: "continueFromDetail" }, { now }).state;
    expect(state.stage).toBe("answerReveal");
    expect(state.current?.lastMistake).toBeUndefined();

    state = applyStudyAction(state, { type: "continueFromDetail" }, { now }).state;
    const returned = advanceUntilLearnTarget(
      state,
      failedLemma!,
      "recognitionChoice",
    );

    expect(returned.current?.lastMistake).toBeUndefined();

    const correctDetail = applyStudyAction(
      returned,
      { type: "chooseMeaning", isCorrect: true },
      { now },
    ).state;

    expect(correctDetail.stage).toBe("detailReveal");
    expect(correctDetail.current?.lastMistake).toBeUndefined();
  });

  it("active Learn failures skip contrast and go directly to answer detail", () => {
    const wordbook = getDefaultWordbook();
    const session = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-active-failure",
      targetCount: 10,
    });
    const result = applyStudyAction(session, { type: "showAnswer" }, { now });

    expect(result.state.stage).toBe("answerReveal");
    expect(result.state.current?.lastMistake).toBeUndefined();
  });

  it("active guided recall failures skip contrast and go directly to answer detail", () => {
    const wordbook = getDefaultWordbook();
    const session = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-guided-active-failure",
      targetCount: 10,
    });
    const failedLemma = session.current?.entry.lemma;
    let state = applyStudyAction(
      session,
      { type: "chooseMeaning", isCorrect: true },
      { now },
    ).state;
    state = applyStudyAction(state, { type: "continueFromDetail" }, { now }).state;
    state = advanceUntilLearnTarget(state, failedLemma!, "guidedRecall");
    const result = applyStudyAction(state, { type: "markUnknown" }, { now });

    expect(result.state.stage).toBe("answerReveal");
    expect(result.state.current?.lastMistake).toBeUndefined();
  });

  it("returns a failed first-light target later as a first-light question", () => {
    const wordbook = getDefaultWordbook();
    const session = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-first-light-failure",
      targetCount: 10,
    });
    const failedLemma = session.current?.entry.lemma;

    expect(failedLemma).toBeDefined();

    const { reveal, requeued } = failLearnCard(session);

    expect(reveal.progressUpdates[0]).toMatchObject({
      status: "learning",
      masteryDots: 0,
      wrongCount: 1,
    });

    const returned = advanceUntilLearnTarget(
      requeued,
      failedLemma!,
      "recognitionChoice",
    );

    expect(returned.current?.masteryDots).toBe(0);
    expect(returned.completedTargetLemmas).not.toContain(failedLemma);
  });

  it("returns a failed second-light target later as a second-light question", () => {
    const wordbook = getDefaultWordbook();
    const session = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-second-light-failure",
      targetCount: 10,
    });
    const failedLemma = session.current?.entry.lemma;

    expect(failedLemma).toBeDefined();

    let state = applyStudyAction(
      session,
      { type: "chooseMeaning", isCorrect: true },
      { now },
    ).state;
    state = applyStudyAction(state, { type: "continueFromDetail" }, { now }).state;
    state = advanceUntilLearnTarget(state, failedLemma!, "guidedRecall");

    const { reveal, requeued } = failLearnCard(state);

    expect(reveal.progressUpdates[0]).toMatchObject({
      status: "learning",
      masteryDots: 1,
      wrongCount: 1,
    });

    const returned = advanceUntilLearnTarget(requeued, failedLemma!, "guidedRecall");

    expect(returned.current?.masteryDots).toBe(1);
    expect(returned.completedTargetLemmas).not.toContain(failedLemma);
  });

  it("returns a failed third-light target later as a third-light question", () => {
    const wordbook = getDefaultWordbook();
    const session = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-third-light-failure",
      targetCount: 10,
    });
    const failedLemma = session.current?.entry.lemma;

    expect(failedLemma).toBeDefined();

    let state = applyStudyAction(
      session,
      { type: "chooseMeaning", isCorrect: true },
      { now },
    ).state;
    state = applyStudyAction(state, { type: "continueFromDetail" }, { now }).state;
    state = advanceUntilLearnTarget(state, failedLemma!, "guidedRecall");
    state = applyStudyAction(state, { type: "markKnown" }, { now }).state;
    state = applyStudyAction(state, { type: "continueFromDetail" }, { now }).state;
    state = advanceUntilLearnTarget(state, failedLemma!, "finalRecall");

    const { reveal, requeued } = failLearnCard(state);

    expect(reveal.progressUpdates[0]).toMatchObject({
      status: "learning",
      masteryDots: 2,
      wrongCount: 1,
    });

    const returned = advanceUntilLearnTarget(requeued, failedLemma!, "finalRecall");

    expect(returned.current?.masteryDots).toBe(2);
    expect(returned.completedTargetLemmas).not.toContain(failedLemma);
  });

  it("keeps a repeatedly failed Learn target active instead of completing it", () => {
    const wordbook = {
      ...getDefaultWordbook(),
      entries: getDefaultWordbook().entries.slice(0, 1),
    };
    let state = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-1",
      targetCount: 10,
    });
    let updates: WordStudyProgress[] = [];

    for (let index = 0; index < 5; index += 1) {
      const { reveal, requeued } = failLearnCard(state);

      updates = reveal.progressUpdates;
      state = requeued;
    }

    expect(updates[0]).toMatchObject({
      status: "learning",
      masteryDots: 0,
      wrongCount: 5,
    });
    expect(state.stage).toBe("recognitionChoice");
    expect(state.current?.entry.lemma).toBe(wordbook.entries[0].lemma);
    expect(state.completedTargetLemmas).toHaveLength(0);
  });

  it("marks blocked content and skips the current target", () => {
    const wordbook = getDefaultWordbook();
    const session = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-1",
      targetCount: 10,
    });
    const result = applyStudyAction(session, { type: "blockCurrent" }, { now });

    expect(result.progressUpdates[0]).toMatchObject({
      lemma: session.current?.entry.lemma,
      status: "blockedContent",
    });
    expect(result.state.current?.entry.lemma).not.toBe(session.current?.entry.lemma);
  });
});

describe("review session engine", () => {
  it("selects due passed words and starts with hidden self recall", () => {
    const wordbook = getDefaultWordbook();
    const session = createReviewSession({
      wordbook,
      progressRecords: [passedProgress(wordbook.entries[0].lemma)],
      now,
      sessionId: "review-1",
      targetCount: 10,
    });

    expect(session.mode).toBe("review");
    expect(session.totalTargets).toBe(1);
    expect(session.stage).toBe("hiddenSelfRecall");
  });

  it("can start with 30 Review targets when enough due words exist", () => {
    const wordbook = getDefaultWordbook();
    const dueProgress = wordbook.entries
      .slice(0, 30)
      .map((entry) => passedProgress(entry.lemma));
    const session = createReviewSession({
      wordbook,
      progressRecords: dueProgress,
      now,
      sessionId: "review-30",
      targetCount: 30,
    });

    expect(wordbook.entries.length).toBeGreaterThanOrEqual(30);
    expect(session.totalTargets).toBe(30);
    expect(session.pending).toHaveLength(29);
  });

  it("orders Review rescue words first, then older due words", () => {
    const wordbook = getDefaultWordbook();
    const laterDue = {
      ...passedProgress(wordbook.entries[0].lemma, 1),
      nextReviewAt: "2026-05-30T00:00:00.000Z",
    };
    const earlierDue = {
      ...passedProgress(wordbook.entries[1].lemma, 1),
      nextReviewAt: "2026-05-28T00:00:00.000Z",
    };
    const rescue = reviewLapsedProgress(wordbook.entries[2].lemma);
    const session = createReviewSession({
      wordbook,
      progressRecords: [laterDue, earlierDue, rescue],
      now,
      sessionId: "review-due-order",
      targetCount: 10,
    });

    expect(session.current?.entry.lemma).toBe(wordbook.entries[2].lemma);
    expect(session.pending[0]?.entry.lemma).toBe(wordbook.entries[1].lemma);
    expect(session.pending[1]?.entry.lemma).toBe(wordbook.entries[0].lemma);
  });

  it.each([999, -1, Number.NaN])(
    "defaults invalid Review target count %s to 10",
    (targetCount) => {
      const wordbook = getDefaultWordbook();
      const dueProgress = wordbook.entries
        .slice(0, 30)
        .map((entry) => passedProgress(entry.lemma));
      const session = createReviewSession({
        wordbook,
        progressRecords: dueProgress,
        now,
        sessionId: "review-invalid-target",
        targetCount: targetCount as unknown as 10,
      });

      expect(session.totalTargets).toBe(10);
      expect(session.pending).toHaveLength(9);
    },
  );

  it("passes a remembered review word after detail", () => {
    const wordbook = getDefaultWordbook();
    const session = createReviewSession({
      wordbook,
      progressRecords: [passedProgress(wordbook.entries[0].lemma, 1)],
      now,
      sessionId: "review-1",
      targetCount: 10,
    });
    const detail = applyStudyAction(session, { type: "markKnown" }, { now }).state;
    const result = applyStudyAction(detail, { type: "nextCard" }, { now });

    expect(detail.stage).toBe("reviewDetail");
    expect(result.progressUpdates[0]).toMatchObject({
      status: "passed",
      reviewStrength: 2,
      seenCount: 2,
      correctCount: 2,
    });
  });

  it("queues fuzzy review words for Review relearn after detail", () => {
    const wordbook = getDefaultWordbook();
    const firstEntry = wordbook.entries[0];
    const secondEntry = wordbook.entries[1];
    const session = createReviewSession({
      wordbook,
      progressRecords: [
        passedProgress(firstEntry.lemma, 2),
        passedProgress(secondEntry.lemma, 2),
      ],
      now,
      sessionId: "review-1",
      targetCount: 10,
    });
    const detailResult = applyStudyAction(session, { type: "markFuzzy" }, { now });
    const requeued = applyStudyAction(
      detailResult.state,
      { type: "continueFromDetail" },
      { now },
    ).state;

    expect(detailResult.state.stage).toBe("fuzzyDetail");
    expect(detailResult.progressUpdates[0]).toMatchObject({
      status: "reviewLapsed",
      reviewStrength: 1,
      wrongCount: 1,
    });
    expect(requeued.stage).toBe("hiddenSelfRecall");
    expect(requeued.current?.entry.lemma).toBe(secondEntry.lemma);
    expect(
      requeued.pending.find((target) => target.entry.lemma === firstEntry.lemma),
    ).toMatchObject({
      resumeStage: "recognitionChoice",
      progress: { status: "reviewLapsed" },
    });
  });

  it("queues forgotten review words for Review relearn after detail", () => {
    const wordbook = getDefaultWordbook();
    const firstEntry = wordbook.entries[0];
    const secondEntry = wordbook.entries[1];
    const session = createReviewSession({
      wordbook,
      progressRecords: [
        passedProgress(firstEntry.lemma, 2),
        passedProgress(secondEntry.lemma, 2),
      ],
      now,
      sessionId: "review-1",
      targetCount: 10,
    });
    const detailResult = applyStudyAction(session, { type: "markForgotten" }, { now });
    const requeued = applyStudyAction(
      detailResult.state,
      { type: "continueFromDetail" },
      { now },
    ).state;

    expect(detailResult.state.stage).toBe("forgotDetail");
    expect(detailResult.progressUpdates[0]).toMatchObject({
      status: "reviewLapsed",
      reviewStrength: 1,
      wrongCount: 1,
    });
    expect(requeued.stage).toBe("hiddenSelfRecall");
    expect(requeued.current?.entry.lemma).toBe(secondEntry.lemma);
    expect(
      requeued.pending.find((target) => target.entry.lemma === firstEntry.lemma),
    ).toMatchObject({
      resumeStage: "recognitionChoice",
      progress: { status: "reviewLapsed" },
    });
  });

  it("returns a failed review word after other cards", () => {
    const wordbook = getDefaultWordbook();
    const entries = wordbook.entries.slice(0, 4);
    let state = createReviewSession({
      wordbook,
      progressRecords: entries.map((entry) => passedProgress(entry.lemma, 2)),
      now,
      sessionId: "review-requeue",
      targetCount: 10,
    });
    const failedLemma = state.current?.entry.lemma;

    expect(failedLemma).toBe(entries[0].lemma);

    const detail = applyStudyAction(state, { type: "markForgotten" }, { now });
    state = applyStudyAction(
      detail.state,
      { type: "continueFromDetail" },
      { now },
    ).state;

    expect(state.current?.entry.lemma).toBe(entries[1].lemma);

    for (let index = 0; index < 3; index += 1) {
      const rememberedDetail = applyStudyAction(
        state,
        { type: "markKnown" },
        { now },
      ).state;
      state = applyStudyAction(
        rememberedDetail,
        { type: "nextCard" },
        { now },
      ).state;
    }

    expect(state.stage).toBe("recognitionChoice");
    expect(state.current?.entry.lemma).toBe(failedLemma);
    expect(state.completedTargetLemmas).not.toContain(failedLemma);
  });

  it("pulls review reserve targets to avoid collapsing rescue lights near the end", () => {
    const wordbook = getDefaultWordbook();
    const entries = wordbook.entries.slice(0, 14);
    let state = createReviewSession({
      wordbook,
      progressRecords: entries.map((entry) => passedProgress(entry.lemma, 2)),
      now,
      sessionId: "review-rescue-buffer",
      targetCount: 10,
    });
    const failedLemma = state.current?.entry.lemma;

    expect(state.totalTargets).toBe(10);
    expect(state.reserve).toHaveLength(4);

    state = applyStudyAction(state, { type: "markForgotten" }, { now }).state;
    state = applyStudyAction(
      state,
      { type: "continueFromDetail" },
      { now },
    ).state;

    for (let index = 0; index < 3; index += 1) {
      const rememberedDetail = applyStudyAction(
        state,
        { type: "markKnown" },
        { now },
      ).state;
      state = applyStudyAction(
        rememberedDetail,
        { type: "nextCard" },
        { now },
      ).state;
    }

    expect(state.current?.entry.lemma).toBe(failedLemma);
    expect(state.stage).toBe("recognitionChoice");

    const recognitionDetail = applyStudyAction(
      state,
      { type: "chooseMeaning", isCorrect: true },
      { now },
    ).state;
    state = applyStudyAction(
      recognitionDetail,
      { type: "continueFromDetail" },
      { now },
    ).state;

    for (let index = 0; index < 3; index += 1) {
      const rememberedDetail = applyStudyAction(
        state,
        { type: "markKnown" },
        { now },
      ).state;
      state = applyStudyAction(
        rememberedDetail,
        { type: "nextCard" },
        { now },
      ).state;
    }

    expect(state.current?.entry.lemma).toBe(failedLemma);
    expect(state.stage).toBe("guidedRecall");

    const guidedDetail = applyStudyAction(
      state,
      { type: "markKnown" },
      { now },
    ).state;
    state = applyStudyAction(
      guidedDetail,
      { type: "continueFromDetail" },
      { now },
    ).state;

    const lastPending = state.pending[state.pending.length - 1];

    expect(state.current?.entry.lemma).not.toBe(failedLemma);
    expect(lastPending?.entry.lemma).toBe(failedLemma);
    expect(state.totalTargets).toBe(10);
    expect(state.reserve).toHaveLength(3);
    expect(state.pending.some((target) => target.countsTowardGoal === false)).toBe(
      true,
    );
  });

  it("does not count reserve review buffers toward the session goal", () => {
    const wordbook = getDefaultWordbook();
    const entries = wordbook.entries.slice(0, 11);
    const session = createReviewSession({
      wordbook,
      progressRecords: entries.map((entry) => passedProgress(entry.lemma, 2)),
      now,
      sessionId: "review-buffer-not-goal",
      targetCount: 10,
    });
    const bufferTarget = session.reserve[0]!;
    const goalTarget = session.pending[0]!;
    const state: StudySessionState = {
      ...session,
      stage: "hiddenSelfRecall",
      current: bufferTarget,
      pending: [goalTarget],
      reserve: [],
      completedTargetLemmas: [session.current!.entry.lemma],
      totalTargets: 10,
    };

    const detail = applyStudyAction(state, { type: "markKnown" }, { now }).state;
    const result = applyStudyAction(detail, { type: "nextCard" }, { now });

    expect(result.state.completedTargetLemmas).toEqual([
      session.current!.entry.lemma,
    ]);
    expect(result.state.totalTargets).toBe(10);
    expect(result.state.current?.entry.lemma).toBe(goalTarget.entry.lemma);
  });

  it("ends Review when only reserve buffers remain after the last goal target", () => {
    const wordbook = getDefaultWordbook();
    const entries = wordbook.entries.slice(0, 11);
    const session = createReviewSession({
      wordbook,
      progressRecords: entries.map((entry) => passedProgress(entry.lemma, 2)),
      now,
      sessionId: "review-buffer-tail-complete",
      targetCount: 10,
    });
    const bufferTarget = session.reserve[0]!;
    const state: StudySessionState = {
      ...session,
      stage: "hiddenSelfRecall",
      pending: [bufferTarget],
      reserve: [],
      completedTargetLemmas: session.pending
        .slice(0, 9)
        .map((target) => target.entry.lemma),
      totalTargets: 10,
    };

    const detail = applyStudyAction(state, { type: "markKnown" }, { now }).state;
    const result = applyStudyAction(detail, { type: "nextCard" }, { now });

    expect(result.state.stage).toBe("complete");
    expect(result.state.current).toBeNull();
    expect(result.state.totalTargets).toBe(10);
  });

  it("does not select failed review words for Learn", () => {
    const wordbook = getDefaultWordbook();
    const firstEntry = wordbook.entries[0];
    const session = createReviewSession({
      wordbook,
      progressRecords: [passedProgress(firstEntry.lemma, 2)],
      now,
      sessionId: "review-fail",
      targetCount: 10,
    });
    const failedProgress = applyStudyAction(
      session,
      { type: "markForgotten" },
      { now },
    ).progressUpdates[0];
    const learnSession = createLearnSession({
      wordbook,
      progressRecords: [failedProgress],
      now,
      sessionId: "learn-after-review-fail",
      targetCount: 10,
    });

    expect(failedProgress).toMatchObject({ status: "reviewLapsed" });
    expect(learnSession.totalTargets).toBe(10);
    expect(
      [
        learnSession.current?.entry.lemma,
        ...learnSession.pending.map((target) => target.entry.lemma),
      ],
    ).not.toContain(firstEntry.lemma);
  });

  it("schedules a rescue pass sooner than a clean review pass", () => {
    const wordbook = getDefaultWordbook();
    const cleanSession = createReviewSession({
      wordbook,
      progressRecords: [passedProgress(wordbook.entries[0].lemma, 2)],
      now,
      sessionId: "review-clean",
      targetCount: 10,
    });
    const cleanDetail = applyStudyAction(
      cleanSession,
      { type: "markKnown" },
      { now },
    ).state;
    const cleanResult = applyStudyAction(cleanDetail, { type: "nextCard" }, { now });

    let rescueState = createReviewSession({
      wordbook,
      progressRecords: [
        passedProgress(wordbook.entries[1].lemma, 2),
        passedProgress(wordbook.entries[2].lemma, 2),
      ],
      now,
      sessionId: "review-rescue",
      targetCount: 10,
    });
    const failedDetail = applyStudyAction(
      rescueState,
      { type: "markForgotten" },
      { now },
    ).state;
    rescueState = applyStudyAction(
      failedDetail,
      { type: "continueFromDetail" },
      { now },
    ).state;
    const otherDetail = applyStudyAction(
      rescueState,
      { type: "markKnown" },
      { now },
    ).state;
    rescueState = applyStudyAction(
      otherDetail,
      { type: "nextCard" },
      { now },
    ).state;
    const rescueRecognitionDetail = applyStudyAction(
      rescueState,
      { type: "chooseMeaning", isCorrect: true },
      { now },
    ).state;
    rescueState = applyStudyAction(
      rescueRecognitionDetail,
      { type: "continueFromDetail" },
      { now },
    ).state;
    const rescueDetail = applyStudyAction(
      rescueState,
      { type: "markKnown" },
      { now },
    ).state;
    rescueState = applyStudyAction(
      rescueDetail,
      { type: "continueFromDetail" },
      { now },
    ).state;
    const rescueFinalDetail = applyStudyAction(
      rescueState,
      { type: "markKnown" },
      { now },
    ).state;
    const rescueResult = applyStudyAction(
      rescueFinalDetail,
      { type: "nextCard" },
      { now },
    );

    const cleanNextReviewAt = new Date(
      cleanResult.progressUpdates[0].nextReviewAt!,
    ).getTime();
    const rescueNextReviewAt = new Date(
      rescueResult.progressUpdates[0].nextReviewAt!,
    ).getTime();

    expect(cleanResult.progressUpdates[0]).toMatchObject({
      reviewStrength: 3,
    });
    expect(rescueResult.progressUpdates[0]).toMatchObject({
      reviewStrength: 1,
    });
    expect(rescueNextReviewAt).toBeLessThan(cleanNextReviewAt);
  });

  it("selects legacy lapsed words for Review relearn but not Learn", () => {
    const wordbook = getDefaultWordbook();
    const lapsedProgress: WordStudyProgress = {
      ...passedProgress(wordbook.entries[0].lemma, 1),
      status: "lapsed",
    };
    const reviewSession = createReviewSession({
      wordbook,
      progressRecords: [lapsedProgress],
      now,
      sessionId: "review-legacy-lapsed",
      targetCount: 10,
    });
    const learnSession = createLearnSession({
      wordbook,
      progressRecords: [lapsedProgress],
      now,
      sessionId: "learn-legacy-lapsed",
      targetCount: 10,
    });

    expect(reviewSession.current?.entry.lemma).toBe(wordbook.entries[0].lemma);
    expect(reviewSession.stage).toBe("recognitionChoice");
    expect(reviewSession.current?.failedAttempts).toBe(1);
    expect(
      [
        learnSession.current?.entry.lemma,
        ...learnSession.pending.map((target) => target.entry.lemma),
      ],
    ).not.toContain(wordbook.entries[0].lemma);
  });

  it("resumes partially rescued Review-lapsed words at the next Review light", () => {
    const wordbook = getDefaultWordbook();
    const partiallyRescuedProgress: WordStudyProgress = {
      ...passedProgress(wordbook.entries[0].lemma, 1),
      status: "reviewLapsed",
      masteryDots: 1,
      reviewStrength: 1,
    };
    const session = createReviewSession({
      wordbook,
      progressRecords: [partiallyRescuedProgress],
      now,
      sessionId: "review-partial-rescue",
      targetCount: 10,
    });

    expect(session.stage).toBe("guidedRecall");
    expect(session.current?.failedAttempts).toBe(1);
    expect(session.current?.masteryDots).toBe(1);

    const detail = applyStudyAction(session, { type: "markKnown" }, { now }).state;
    expect(detail.stage).toBe("guidedDetail");
    const finalRecall = applyStudyAction(
      detail,
      { type: "continueFromDetail" },
      { now },
    ).state;
    expect(finalRecall.stage).toBe("finalRecall");
    const finalDetail = applyStudyAction(
      finalRecall,
      { type: "markKnown" },
      { now },
    ).state;
    const result = applyStudyAction(finalDetail, { type: "nextCard" }, { now });

    expect(result.progressUpdates[0]).toMatchObject({
      status: "passed",
      reviewStrength: 1,
    });
  });

  it("resumes two-dot Review-lapsed words at final confirmation", () => {
    const wordbook = getDefaultWordbook();
    const partiallyRescuedProgress: WordStudyProgress = {
      ...passedProgress(wordbook.entries[0].lemma, 1),
      status: "reviewLapsed",
      masteryDots: 2,
      reviewStrength: 1,
    };
    const session = createReviewSession({
      wordbook,
      progressRecords: [partiallyRescuedProgress],
      now,
      sessionId: "review-partial-final",
      targetCount: 10,
    });

    expect(session.stage).toBe("finalRecall");
    expect(session.current?.failedAttempts).toBe(1);
    expect(session.current?.masteryDots).toBe(2);
  });

  it("can complete a rescued review target after Review relearn", () => {
    const wordbook = getDefaultWordbook();
    const entries = wordbook.entries.slice(0, 2);
    let state = createReviewSession({
      wordbook,
      progressRecords: entries.map((entry) => passedProgress(entry.lemma, 2)),
      now,
      sessionId: "review-rescue-complete",
      targetCount: 10,
    });
    const failedLemma = state.current?.entry.lemma;

    state = applyStudyAction(state, { type: "markFuzzy" }, { now }).state;
    state = applyStudyAction(state, { type: "continueFromDetail" }, { now }).state;
    state = applyStudyAction(state, { type: "markKnown" }, { now }).state;
    state = applyStudyAction(state, { type: "nextCard" }, { now }).state;

    expect(state.current?.entry.lemma).toBe(failedLemma);
    expect(state.stage).toBe("recognitionChoice");

    state = applyStudyAction(
      state,
      { type: "chooseMeaning", isCorrect: true },
      { now },
    ).state;
    expect(state.stage).toBe("detailReveal");
    state = applyStudyAction(state, { type: "continueFromDetail" }, { now }).state;
    expect(state.stage).toBe("guidedRecall");
    state = applyStudyAction(state, { type: "markKnown" }, { now }).state;
    expect(state.stage).toBe("guidedDetail");
    state = applyStudyAction(state, { type: "continueFromDetail" }, { now }).state;
    expect(state.stage).toBe("finalRecall");
    state = applyStudyAction(state, { type: "markKnown" }, { now }).state;
    const result = applyStudyAction(state, { type: "nextCard" }, { now });

    expect(result.progressUpdates[0]).toMatchObject({
      status: "passed",
      reviewStrength: 1,
    });
    expect(result.state.completedTargetLemmas).toContain(failedLemma);
  });

  it("routes review failures to a Review-owned relearn stage", () => {
    const wordbook = getDefaultWordbook();
    const session = createReviewSession({
      wordbook,
      progressRecords: [passedProgress(wordbook.entries[0].lemma, 2)],
      now,
      sessionId: "review-one-light",
      targetCount: 10,
    });
    const fuzzyDetail = applyStudyAction(session, { type: "markFuzzy" }, { now }).state;
    const fuzzyNext = applyStudyAction(
      fuzzyDetail,
      { type: "continueFromDetail" },
      { now },
    ).state;
    const forgottenDetail = applyStudyAction(
      session,
      { type: "markForgotten" },
      { now },
    ).state;
    const forgottenNext = applyStudyAction(
      forgottenDetail,
      { type: "continueFromDetail" },
      { now },
    ).state;

    expect(fuzzyNext.mode).toBe("review");
    expect(forgottenNext.mode).toBe("review");
    expect(fuzzyNext.stage).toBe("recognitionChoice");
    expect(forgottenNext.stage).toBe("recognitionChoice");
  });

  it("keeps Review relearn failures on the current Review light", () => {
    const wordbook = getDefaultWordbook();
    const entries = wordbook.entries.slice(0, 2);
    let state = createReviewSession({
      wordbook,
      progressRecords: entries.map((entry) => passedProgress(entry.lemma, 2)),
      now,
      sessionId: "review-relearn-failure",
      targetCount: 10,
    });
    const failedLemma = state.current?.entry.lemma;

    state = applyStudyAction(state, { type: "markForgotten" }, { now }).state;
    state = applyStudyAction(state, { type: "continueFromDetail" }, { now }).state;
    state = applyStudyAction(state, { type: "markKnown" }, { now }).state;
    state = applyStudyAction(state, { type: "nextCard" }, { now }).state;

    expect(state.current?.entry.lemma).toBe(failedLemma);
    expect(state.stage).toBe("recognitionChoice");

    state = applyStudyAction(state, { type: "showAnswer" }, { now }).state;
    expect(state.stage).toBe("answerReveal");
    state = applyStudyAction(state, { type: "continueFromDetail" }, { now }).state;

    expect(state.current?.entry.lemma).toBe(failedLemma);
    expect(state.stage).toBe("recognitionChoice");
  });

  it("active forgotten review failures skip contrast and go directly to detail", () => {
    const wordbook = getDefaultWordbook();
    const session = createReviewSession({
      wordbook,
      progressRecords: [passedProgress(wordbook.entries[0].lemma, 2)],
      now,
      sessionId: "review-forgotten-direct-detail",
      targetCount: 10,
    });
    const result = applyStudyAction(session, { type: "markForgotten" }, { now });

    expect(result.state.stage).toBe("forgotDetail");
    expect(result.state.current?.lastMistake).toBeUndefined();
  });

});
