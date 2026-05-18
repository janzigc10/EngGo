import { describe, expect, it } from "vitest";

import {
  buildFastApiDbUnavailableSmokeCases,
  evaluateFastApiDbUnavailableSmoke,
} from "./fastapi-db-unavailable-smoke";
import type { FastApiMigratedSliceSmokeObservation } from "./fastapi-migrated-slice-smoke";

function groundedObservation(
  overrides: Partial<FastApiMigratedSliceSmokeObservation> = {},
): FastApiMigratedSliceSmokeObservation {
  return {
    status: 200,
    answerKind: "grounded",
    errorCode: null,
    answerStyle: "standard_lookup",
    matchType: "external_dictionary_exact",
    resolution: "resolved",
    comparisonViewId: null,
    rootFamilyViewId: null,
    learningIntentTask: null,
    broadPresentation: null,
    groundingLemmas: ["substitute"],
    mainAnswerLemmas: ["substitute"],
    answerText: "substitute",
    providerRequestId: null,
    hasGrounding: true,
    requestIdMatchesHeader: true,
    ...overrides,
  };
}

describe("fastapi DB-unavailable smoke", () => {
  it("defines the focused no-DB fallback matrix", () => {
    expect(buildFastApiDbUnavailableSmokeCases()).toEqual([
      expect.objectContaining({
        name: "ordinary ecdict substitute meaning",
        query: "substitute 是什么意思",
      }),
      expect.objectContaining({
        name: "ordinary ecdict substitute usage wording",
        query: "substitute 怎么用",
      }),
      expect.objectContaining({
        name: "direct compare ecdict fallback",
        query: "restrain和constrain的区别",
        expectedLearningIntentTask: "focused_compare",
      }),
      expect.objectContaining({
        name: "broad fragment ecdict fallback",
        query: "re开头cile结尾的单词",
      }),
      expect.objectContaining({
        name: "plain similar-word wording routes broad",
        query: "有个像 institute 的词",
      }),
      expect.objectContaining({
        name: "bare connector similar-word wording routes broad",
        query: "\u548ccontest\u50cf\u7684\u5355\u8bcd",
        expectedLearningIntentTask: "shape_neighbors",
      }),
    ]);
  });

  it("expects every no-DB smoke case to resolve without provider calls", () => {
    for (const caseDef of buildFastApiDbUnavailableSmokeCases()) {
      expect(caseDef.expectedStatus).toBe(200);
      expect(caseDef.expectedProviderRequestId).toBeNull();
      expect(caseDef.expectedProviderRequest ?? "absent").toBe("absent");
    }
  });

  it("reuses the migrated smoke evaluator failure for unavailable-service text", () => {
    const caseDef = buildFastApiDbUnavailableSmokeCases()[0];
    const result = evaluateFastApiDbUnavailableSmoke(
      caseDef,
      groundedObservation({
        answerText: "当前回答服务暂时不可用，请稍后再试。",
      }),
    );

    expect(result).toEqual({
      name: "ordinary ecdict substitute meaning",
      verdict: "fail",
      failures: ["answer contained unavailable-service fallback text"],
    });
  });
});
