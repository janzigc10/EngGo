// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AssistantAnswer } from "@/components/chat/assistant-answer";
import type { ChatMessage } from "@/features/chat/types";

function assistantMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "assistant-density",
    role: "assistant",
    content: "",
    ...overrides,
  };
}

function candidateItem(index: number) {
  return {
    id: `candidate-${index}`,
    lemma: `word${index}`,
    partOfSpeech: "n.",
    meaningZh: `释义${index}`,
  };
}

describe("AssistantAnswer Card Density V1", () => {
  it("shows candidate lists as top-N rows with an expand control", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 8 }, (_item, index) => (
      candidateItem(index + 1)
    ));

    render(
      <AssistantAnswer
        message={assistantMessage({
          answerSurface: {
            type: "candidate_list",
            title: "找到 8 个词",
            items,
          },
        })}
      />,
    );

    expect(screen.getByText("word1")).toBeInTheDocument();
    expect(screen.getByText("word5")).toBeInTheDocument();
    expect(screen.queryByText("word6")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开剩余 3 个" }));

    expect(screen.getByText("word6")).toBeInTheDocument();
    expect(screen.getByText("word7")).toBeInTheDocument();
    expect(screen.getByText("word8")).toBeInTheDocument();
  });

  it("labels out-of-scope candidates and explains mixed scope", () => {
    const scopeReminder = (
      "候选同时包含当前高考词书内和词书外结果，已按拼写接近度排序。"
    );

    render(
      <AssistantAnswer
        message={assistantMessage({
          answerKind: "grounded",
          answerSurface: {
            type: "candidate_list",
            title: "找到 2 个可能的词",
            subtitle: "高考",
            items: [
              { ...candidateItem(1), lemma: "alize", inScope: false },
              { ...candidateItem(2), lemma: "alike", inScope: true },
            ],
          },
          grounding: {
            activeExamTarget: "gaokao",
            activeExamTargetLabel: "高考",
            query: "anlize是什么意思",
            queryMode: "fuzzy_recall",
            answerStyle: "standard_lookup",
            resolution: "needs_clarification",
            noMatchReason: null,
            spellingDecision: "clarify_candidates",
            candidates: [
              {
                entryId: "external-dictionary:alize",
                lemma: "alize",
                meaningsZh: ["茜草素"],
                matchedAlias: null,
                scopeCodes: [],
                inScope: false,
                reason: "local spelling candidate",
                score: 90,
                sourceKind: "external_dictionary_basic",
              },
              {
                entryId: "external-dictionary:alike",
                lemma: "alike",
                meaningsZh: ["相似的"],
                matchedAlias: null,
                scopeCodes: ["gaokao"],
                inScope: true,
                reason: "local spelling candidate",
                score: 80,
                sourceKind: "external_dictionary_basic",
              },
            ],
            mainAnswer: [],
            confusionBoundary: [],
            scopeReminder,
            followUpPrompt: "请选择一个候选。",
            comparisonView: null,
            rootFamilyView: null,
          },
        })}
      />,
    );

    expect(screen.getByText("当前词书外")).toBeInTheDocument();
    expect(screen.getByText(scopeReminder)).toBeInTheDocument();
  });

  it("makes automatic spelling correction explicit", () => {
    render(
      <AssistantAnswer
        message={assistantMessage({
          answerKind: "grounded",
          answerSurface: {
            type: "lookup",
            title: "request",
            items: [
              { ...candidateItem(1), lemma: "request", inScope: true },
            ],
          },
          grounding: {
            activeExamTarget: "cet6",
            activeExamTargetLabel: "CET-6",
            query: "reqeust是什么意思",
            queryMode: "fuzzy_recall",
            answerStyle: "standard_lookup",
            resolution: "resolved",
            noMatchReason: null,
            matchType: "spelling_auto_correct",
            spellingDecision: "auto_correct",
            mainAnswer: [],
            confusionBoundary: [],
            scopeReminder: "这次回答已优先锁定在 CET-6 范围内。",
            followUpPrompt: "",
            comparisonView: null,
            rootFamilyView: null,
            spellingCorrection: {
              input: "reqeust",
              lemma: "request",
            },
          },
        })}
      />,
    );

    expect(
      screen.getByText("已按拼写纠正：reqeust → request"),
    ).toBeInTheDocument();
  });

  it("shows scope support after selecting an out-of-scope candidate", () => {
    const scopeReminder = (
      "这次命中的词不在当前高考词书范围内，以下按全局 ECDICT 结果说明。"
    );

    render(
      <AssistantAnswer
        message={assistantMessage({
          answerKind: "grounded",
          answerSurface: {
            type: "lookup",
            title: "alize",
            items: [
              { ...candidateItem(1), lemma: "alize", inScope: false },
            ],
          },
          grounding: {
            activeExamTarget: "gaokao",
            activeExamTargetLabel: "高考",
            query: "alize",
            queryMode: "direct_lookup",
            answerStyle: "standard_lookup",
            resolution: "resolved",
            noMatchReason: null,
            mainAnswer: [],
            confusionBoundary: [],
            scopeReminder,
            followUpPrompt: "",
            comparisonView: null,
            rootFamilyView: null,
          },
        })}
      />,
    );

    expect(screen.getByText("当前词书外")).toBeInTheDocument();
    expect(screen.getByText(scopeReminder)).toBeInTheDocument();
  });

  it("accepts a safe spelling no-match without inventing a correction", () => {
    render(
      <AssistantAnswer
        message={assistantMessage({
          content: "这次先不硬猜。",
          answerKind: "grounded",
          answerSurface: {
            type: "plain",
            text: "这次先不硬猜。",
          },
          grounding: {
            activeExamTarget: "gaokao",
            activeExamTargetLabel: "高考",
            query: "xqzplm是什么意思",
            queryMode: "fuzzy_recall",
            answerStyle: "standard_lookup",
            resolution: "no_match",
            noMatchReason: "random_like",
            spellingDecision: "no_reliable_candidate",
            candidates: [],
            mainAnswer: [],
            confusionBoundary: [],
            scopeReminder: "",
            followUpPrompt: "",
            comparisonView: null,
            rootFamilyView: null,
          },
        })}
      />,
    );

    expect(screen.getByText("这次先不硬猜。")).toBeInTheDocument();
    expect(screen.queryByText(/已按拼写纠正/)).not.toBeInTheDocument();
  });

  it("keeps compare cards scannable and folds member details", async () => {
    const user = userEvent.setup();

    render(
      <AssistantAnswer
        message={assistantMessage({
          answerSurface: {
            type: "compare",
            title: "核心区别",
            text: [
              "access 侧重进入；assess 侧重评估。",
              "这组词还有拼写和常见搭配细节。",
            ].join("\n\n"),
            members: [
              {
                id: "access",
                lemma: "access",
                partOfSpeech: "n. / v.",
                meaningZh: "进入；使用权",
              },
              {
                id: "assess",
                lemma: "assess",
                partOfSpeech: "v.",
                meaningZh: "评估；评价",
              },
            ],
          },
        })}
      />,
    );

    expect(screen.getByText("access 侧重进入；assess 侧重评估。")).toBeInTheDocument();
    expect(screen.queryByText("这组词还有拼写和常见搭配细节。")).not.toBeInTheDocument();
    expect(screen.getByText("进入；使用权")).toBeInTheDocument();
    expect(screen.queryByText("n. / v.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开说明" }));
    expect(screen.getByText("这组词还有拼写和常见搭配细节。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开词性和细节" }));

    expect(screen.getByText("n. / v.")).toBeInTheDocument();
  });

  it("shows the first expression recommendations and folds alternatives", async () => {
    const user = userEvent.setup();

    render(
      <AssistantAnswer
        message={assistantMessage({
          answerSurface: {
            type: "expression_advice",
            title: "表达建议",
            text: [
              "写作里优先选更正式的搭配。",
              "- word1：推荐表达",
              "- word2：推荐表达",
              "- word3：推荐表达",
              "- word4：备用表达",
            ].join("\n"),
            options: [
              candidateItem(1),
              candidateItem(2),
              candidateItem(3),
              candidateItem(4),
              candidateItem(5),
            ],
          },
        })}
      />,
    );

    expect(screen.getByText("word3")).toBeInTheDocument();
    expect(screen.queryByText("word4")).not.toBeInTheDocument();
    expect(screen.queryByText(/word4：备用表达/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开更多表达 2 个" }));

    expect(screen.getByText("word4")).toBeInTheDocument();
    expect(screen.getByText("word5")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开更多说明" }));
    expect(screen.getByText(/word4：备用表达/)).toBeInTheDocument();
  });

  it("shows root-family core members and folds side members", async () => {
    const user = userEvent.setup();

    render(
      <AssistantAnswer
        message={assistantMessage({
          answerSurface: {
            type: "root_family",
            title: "stitute",
            note: "先记核心族，不要机械套前缀。",
            members: [
              { ...candidateItem(1), priority: "must_memorize" },
              { ...candidateItem(2), priority: "recognize" },
              { ...candidateItem(3), priority: "low_priority" },
              { ...candidateItem(4), priority: "low_priority" },
            ],
          },
        })}
      />,
    );

    expect(screen.getByText("word1")).toBeInTheDocument();
    expect(screen.getByText("word2")).toBeInTheDocument();
    expect(screen.queryByText("word3")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开旁支 2 个" }));

    expect(screen.getByText("word3")).toBeInTheDocument();
    expect(screen.getByText("word4")).toBeInTheDocument();
  });

  it("keeps grounding evidence collapsed until requested", async () => {
    const user = userEvent.setup();

    render(
      <AssistantAnswer
        message={assistantMessage({
          answerKind: "grounded",
          answerSurface: {
            type: "candidate_list",
            title: "找到 2 个词",
            items: [candidateItem(1), candidateItem(2)],
          },
          grounding: {
            activeExamTarget: "cet6",
            activeExamTargetLabel: "CET-6",
            query: "tran开头的单词有哪些",
            queryMode: "shape_neighbor_search",
            answerStyle: "broad_vocab_summary",
            resolution: "resolved",
            noMatchReason: null,
            mainAnswer: [],
            confusionBoundary: [],
            scopeReminder: "scope",
            followUpPrompt: "follow-up",
            comparisonView: null,
            rootFamilyView: null,
          },
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "查看依据" })).toBeInTheDocument();
    expect(screen.queryByText("tran开头的单词有哪些")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看依据" }));

    expect(screen.getByText("tran开头的单词有哪些")).toBeInTheDocument();
    expect(screen.getByText("word1 / word2")).toBeInTheDocument();
  });
});
