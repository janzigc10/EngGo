import { describe, expect, it } from "vitest";

import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import { getNextReviewAt } from "@/features/wordbook/wordbook-progress-store";
import {
  applyStudyAction,
  createLearnSession,
  createReviewSession,
} from "@/features/wordbook/session-engine";
import type { WordStudyProgress } from "@/features/wordbook/wordbook-types";

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

describe("learn session engine", () => {
  it("starts with up to 10 unseen or learning entries", () => {
    const wordbook = getDefaultWordbook();
    const session = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-1",
    });

    expect(session.mode).toBe("learn");
    expect(session.totalTargets).toBe(10);
    expect(session.stage).toBe("recognitionChoice");
    expect(session.current?.entry.lemma).toBe(wordbook.entries[0].lemma);
  });

  it("passes a new word only after recognition, guided recall, and final recall", () => {
    const wordbook = getDefaultWordbook();
    const session = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-1",
    });

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

    const guided = applyStudyAction(
      recognitionState,
      { type: "continueFromDetail" },
      { now },
    ).state;
    const guidedKnown = applyStudyAction(guided, { type: "markKnown" }, { now });
    expect(guidedKnown.progressUpdates[0]).toMatchObject({
      status: "learning",
      masteryDots: 2,
    });
    const final = guidedKnown.state;
    expect(final.stage).toBe("finalRecall");
    expect(final.current?.masteryDots).toBe(2);

    const result = applyStudyAction(final, { type: "markKnown" }, { now });

    expect(result.progressUpdates[0]).toMatchObject({
      status: "passed",
      masteryDots: 3,
      reviewStrength: 1,
    });
    expect(result.progressUpdates[0].nextReviewAt).toBe(getNextReviewAt(now, 1));
    expect(result.state.completedTargetLemmas).toContain(session.current?.entry.lemma);
  });

  it("reveals and requeues a wrong recognition answer", () => {
    const wordbook = getDefaultWordbook();
    const session = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-1",
    });
    const failedLemma = session.current?.entry.lemma;

    const reveal = applyStudyAction(
      session,
      { type: "chooseMeaning", isCorrect: false },
      { now },
    );
    expect(reveal.progressUpdates[0]).toMatchObject({
      status: "learning",
      wrongCount: 1,
    });
    const requeued = applyStudyAction(
      reveal.state,
      { type: "continueFromDetail" },
      { now },
    ).state;

    expect(reveal.state.stage).toBe("answerReveal");
    expect(requeued.current?.entry.lemma).not.toBe(failedLemma);
    expect(requeued.pending.map((target) => target.entry.lemma)).toContain(failedLemma);
  });

  it("lets repeated failures complete as learning instead of blocking forever", () => {
    const wordbook = {
      ...getDefaultWordbook(),
      entries: getDefaultWordbook().entries.slice(0, 1),
    };
    let state = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-1",
    });
    let updates: WordStudyProgress[] = [];

    for (let index = 0; index < 3; index += 1) {
      const reveal = applyStudyAction(
        state,
        { type: "chooseMeaning", isCorrect: false },
        { now },
      );
      updates = reveal.progressUpdates;
      state = applyStudyAction(
        reveal.state,
        { type: "continueFromDetail" },
        { now },
      ).state;
    }

    expect(updates[0]).toMatchObject({ status: "learning" });
    expect(state.stage).toBe("complete");
  });

  it("marks blocked content and skips the current target", () => {
    const wordbook = getDefaultWordbook();
    const session = createLearnSession({
      wordbook,
      progressRecords: [],
      now,
      sessionId: "learn-1",
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
    });

    expect(session.mode).toBe("review");
    expect(session.totalTargets).toBe(1);
    expect(session.stage).toBe("hiddenSelfRecall");
  });

  it("passes a remembered review word after detail", () => {
    const wordbook = getDefaultWordbook();
    const session = createReviewSession({
      wordbook,
      progressRecords: [passedProgress(wordbook.entries[0].lemma, 1)],
      now,
      sessionId: "review-1",
    });
    const detail = applyStudyAction(session, { type: "markKnown" }, { now }).state;
    const result = applyStudyAction(detail, { type: "nextCard" }, { now });

    expect(detail.stage).toBe("reviewDetail");
    expect(result.progressUpdates[0]).toMatchObject({
      status: "passed",
      reviewStrength: 2,
    });
  });

  it("routes fuzzy review through final recall", () => {
    const wordbook = getDefaultWordbook();
    const session = createReviewSession({
      wordbook,
      progressRecords: [passedProgress(wordbook.entries[0].lemma, 2)],
      now,
      sessionId: "review-1",
    });
    const detail = applyStudyAction(session, { type: "markFuzzy" }, { now }).state;
    const final = applyStudyAction(
      detail,
      { type: "continueFromDetail" },
      { now },
    ).state;
    const result = applyStudyAction(final, { type: "markKnown" }, { now });

    expect(detail.stage).toBe("fuzzyDetail");
    expect(final.stage).toBe("finalRecall");
    expect(result.progressUpdates[0]).toMatchObject({
      status: "passed",
      reviewStrength: 2,
    });
  });

  it("routes forgotten review through recognition and reduces strength", () => {
    const wordbook = getDefaultWordbook();
    const session = createReviewSession({
      wordbook,
      progressRecords: [passedProgress(wordbook.entries[0].lemma, 2)],
      now,
      sessionId: "review-1",
    });
    const detail = applyStudyAction(session, { type: "markForgotten" }, { now }).state;
    expect(detail.current?.progress).toMatchObject({
      status: "lapsed",
      reviewStrength: 1,
    });
    const recognition = applyStudyAction(
      detail,
      { type: "continueFromDetail" },
      { now },
    ).state;
    const final = applyStudyAction(
      recognition,
      { type: "chooseMeaning", isCorrect: true },
      { now },
    ).state;
    const result = applyStudyAction(final, { type: "markKnown" }, { now });

    expect(detail.stage).toBe("forgotDetail");
    expect(recognition.stage).toBe("recognitionChoice");
    expect(final.stage).toBe("finalRecall");
    expect(result.progressUpdates[0]).toMatchObject({
      status: "passed",
      reviewStrength: 1,
    });
  });

  it("persists a lapsed state after failed review recognition", () => {
    const wordbook = getDefaultWordbook();
    const session = createReviewSession({
      wordbook,
      progressRecords: [passedProgress(wordbook.entries[0].lemma, 2)],
      now,
      sessionId: "review-1",
    });
    const detail = applyStudyAction(session, { type: "markForgotten" }, { now }).state;
    const recognition = applyStudyAction(
      detail,
      { type: "continueFromDetail" },
      { now },
    ).state;
    const result = applyStudyAction(
      recognition,
      { type: "chooseMeaning", isCorrect: false },
      { now },
    );

    expect(result.progressUpdates[0]).toMatchObject({
      status: "lapsed",
      reviewStrength: 1,
    });
  });
});
