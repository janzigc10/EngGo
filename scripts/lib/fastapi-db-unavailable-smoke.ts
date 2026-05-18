import {
  evaluateFastApiMigratedSliceSmoke,
  parseFastApiMigratedSliceSmokeArgs,
  summarizeFastApiMigratedSliceSmoke,
  type FastApiMigratedSliceSmokeCase,
  type FastApiMigratedSliceSmokeObservation,
  type FastApiMigratedSliceSmokeResult,
} from "./fastapi-migrated-slice-smoke";

export type {
  FastApiMigratedSliceSmokeCase as FastApiDbUnavailableSmokeCase,
  FastApiMigratedSliceSmokeObservation as FastApiDbUnavailableSmokeObservation,
  FastApiMigratedSliceSmokeResult as FastApiDbUnavailableSmokeResult,
};

export { parseFastApiMigratedSliceSmokeArgs, summarizeFastApiMigratedSliceSmoke };

export function buildFastApiDbUnavailableSmokeCases(): FastApiMigratedSliceSmokeCase[] {
  return [
    {
      name: "ordinary ecdict substitute meaning",
      query: "substitute 是什么意思",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedResolution: "resolved",
      expectedMatchType: "external_dictionary_exact",
      expectedGroundingIncludes: ["substitute"],
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "ordinary ecdict substitute usage wording",
      query: "substitute 怎么用",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedResolution: "resolved",
      expectedMatchType: "external_dictionary_exact",
      expectedGroundingIncludes: ["substitute"],
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "direct compare ecdict fallback",
      query: "restrain和constrain的区别",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedResolution: "resolved",
      expectedLearningIntentTask: "focused_compare",
      expectedGroundingIncludes: ["restrain", "constrain"],
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "broad fragment ecdict fallback",
      query: "re开头cile结尾的单词",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedResolution: "resolved",
      expectedLearningIntentTask: "form_filter",
      expectedGroundingIncludes: ["reconcile"],
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "plain similar-word wording routes broad",
      query: "有个像 institute 的词",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedResolution: "resolved",
      expectedLearningIntentTask: "shape_neighbors",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
    {
      name: "bare connector similar-word wording routes broad",
      query: "\u548ccontest\u50cf\u7684\u5355\u8bcd",
      activeExamTarget: "postgrad",
      expectedStatus: 200,
      expectedAnswerKind: "grounded",
      expectedResolution: "resolved",
      expectedLearningIntentTask: "shape_neighbors",
      expectedProviderRequest: "absent",
      expectedProviderRequestId: null,
    },
  ];
}

export function evaluateFastApiDbUnavailableSmoke(
  caseDef: FastApiMigratedSliceSmokeCase,
  observation: FastApiMigratedSliceSmokeObservation,
): FastApiMigratedSliceSmokeResult {
  return evaluateFastApiMigratedSliceSmoke(caseDef, observation);
}
