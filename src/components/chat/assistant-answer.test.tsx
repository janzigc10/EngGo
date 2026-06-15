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
