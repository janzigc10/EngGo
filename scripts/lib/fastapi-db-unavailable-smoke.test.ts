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
      expect.objectContaining({
        name: "word family respond ecdict fallback",
        query: "respond\u7684\u6d3e\u751f\u8bcd",
        expectedLearningIntentTask: "word_family",
      }),
      expect.objectContaining({
        name: "meaning lookup obey ecdict fallback",
        query: "\u9075\u5b88\u7684\u82f1\u6587\u662f\u5565",
        expectedLearningIntentTask: "meaning_core",
        expectedGroundingIncludes: ["comply"],
        expectedMainAnswerIncludes: ["comply"],
      }),
      expect.objectContaining({
        name: "meaning lookup restrict ecdict fallback",
        query: "\u9650\u5236\u7528\u82f1\u8bed\u600e\u4e48\u8bf4",
        expectedLearningIntentTask: "meaning_core",
        expectedGroundingIncludes: ["restrict"],
        expectedMainAnswerIncludes: ["restrict"],
      }),
      expect.objectContaining({
        name: "meaning lookup expression obey cleaned hint",
        query: "\u8868\u8fbe\u9075\u5b88\u7684\u5355\u8bcd",
        expectedLearningIntentTask: "meaning_core",
        expectedGroundingIncludes: ["comply"],
        expectedMainAnswerIncludes: ["comply"],
      }),
      expect.objectContaining({
        name: "meaning lookup responsibility ecdict fallback",
        query: "\u8868\u793a\u627f\u62c5\u8d23\u4efb\u7684\u8bcd\u6709\u54ea\u4e9b",
        expectedLearningIntentTask: "meaning_core",
        expectedGroundingIncludes: ["responsible"],
        expectedMainAnswerIncludes: ["responsible"],
      }),
      expect.objectContaining({
        name: "meaning lookup express opinion ecdict fallback",
        query: "\u8868\u793a\u8868\u8fbe\u89c2\u70b9\u7684\u8bcd\u6709\u54ea\u4e9b\u54ea\u4e9b\u8003\u8bd5\u5e38\u89c1",
        expectedLearningIntentTask: "meaning_core",
        expectedGroundingIncludes: ["express"],
        expectedMainAnswerIncludes: ["express"],
      }),
      expect.objectContaining({
        name: "meaning lookup follow ecdict fallback",
        query: "\u9075\u5faa\u7684\u82f1\u6587\u662f\u4ec0\u4e48",
        expectedLearningIntentTask: "meaning_core",
      }),
      expect.objectContaining({
        name: "meaning lookup activity ecdict fallback",
        query: "\u6d3b\u52a8\u7684\u82f1\u6587\u662f\u4ec0\u4e48",
        expectedLearningIntentTask: "meaning_core",
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
