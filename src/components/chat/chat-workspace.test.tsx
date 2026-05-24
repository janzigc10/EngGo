// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatWorkspace } from "@/components/chat/chat-workspace";
import type {
  ConversationalLearningContext,
  ResolvedFollowUp,
} from "@/features/chat/types";

function getSubmitButton() {
  const button = screen
    .getByTestId("chat-input")
    .parentElement?.querySelector("button");

  if (!button) {
    throw new Error("Chat submit button was not found");
  }

  return button as HTMLButtonElement;
}

describe("ChatWorkspace", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("prefills the composer from the draft query parameter", () => {
    window.history.pushState(
      {},
      "",
      "/?draft=make%20up%20%E6%80%8E%E4%B9%88%E7%94%A8",
    );

    render(<ChatWorkspace />);

    expect(screen.getByDisplayValue("make up 怎么用")).toBeInTheDocument();
  });

  it("persists active exam target and sends prompt", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();

    render(<ChatWorkspace />);

    await user.click(screen.getByRole("button", { name: /CET-6/i }));
    await user.click(screen.getByText("遵从怎么说"));

    expect(window.localStorage.getItem("enggo.activeExamTarget")).toBe("cet6");
    expect(screen.getByDisplayValue("遵从怎么说")).toBeInTheDocument();
  });

  it("restores the last active exam target after remount", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();

    const firstRender = render(<ChatWorkspace />);

    await user.click(screen.getByRole("button", { name: /考研/i }));
    expect(window.localStorage.getItem("enggo.activeExamTarget")).toBe("postgrad");

    firstRender.unmount();
    render(<ChatWorkspace />);

    expect(screen.getByTestId("active-exam-target")).toHaveTextContent("当前词书：考研");
  });

  it("submits the prompt and renders the structured answer", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "CET-6 里优先用 comply with，再和 conform to 区分开。",
        requestId: "req_test_456",
        providerRequestId: "resp_test_456",
        grounding: {
          activeExamTarget: "cet6",
          activeExamTargetLabel: "CET-6",
          query: "遵从怎么说",
          queryMode: "meaning_lookup",
          resolution: "resolved",
          noMatchReason: null,
          mainAnswer: [
            {
              entryId: "comply",
              lemma: "comply",
              meaningsZh: ["遵从，依从"],
              matchedAlias: "comply with",
              scopeCodes: ["cet6", "postgrad"],
              inScope: true,
              reason: "in-scope main answer",
              score: 10,
            },
          ],
          confusionBoundary: [
            {
              entryId: "conform",
              lemma: "conform",
              meaningsZh: ["遵照，一致"],
              matchedAlias: "conform to",
              scopeCodes: ["cet6"],
              inScope: true,
              reason: "nearby confusion",
              score: 8,
            },
          ],
          scopeReminder:
            "这次先以 CET-6 范围内答案为主；如果你想顺带扩展，范围外还可以看看 abide。",
          followUpPrompt: "如果你愿意，我可以继续把 comply / conform 的区别拆成一眼就能记住的规则。",
          comparisonView: null,
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.click(screen.getByText("遵从怎么说"));
    await user.click(screen.getByRole("button", { name: /开始提问/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/chat");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(await screen.findByText(/comply with/i)).toBeInTheDocument();
    expect(screen.getByText("conform")).toBeInTheDocument();
    expect(screen.getByText(/下一步/)).toBeInTheDocument();
  });

  it("sends the latest conversation context with the next follow-up prompt", async () => {
    const user = userEvent.setup();
    const conversationContext: ConversationalLearningContext = {
      version: 1,
      activeExamTarget: "cet6",
      sourceMessageId: "assistant-context-1",
      topicKind: "confusion_untangle",
      focus: {
        kind: "group",
        label: "comply / conform",
      },
      candidates: [
        {
          index: 1,
          lemma: "comply",
          label: "comply",
          entryId: "comply",
          sourceKind: "structured",
          partOfSpeech: "v.",
          meaningZh: "follow a rule",
          reviewStatus: "unreviewed",
        },
        {
          index: 2,
          lemma: "conform",
          label: "conform",
          entryId: "conform",
          sourceKind: "structured",
          partOfSpeech: "v.",
          meaningZh: "match a standard",
          reviewStatus: "unreviewed",
        },
      ],
      availableActions: ["collect_one", "collect_group"],
      expiresAfterTurns: 2,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: "comply is about following a rule; conform is about matching a standard.",
          answerKind: "plain",
          requestId: "req_context_1",
          providerRequestId: null,
          conversationContext,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: "The second one is conform.",
          answerKind: "plain",
          requestId: "req_context_2",
          providerRequestId: null,
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "comply conform");
    await user.click(getSubmitButton());

    expect(
      await screen.findByText(
        "comply is about following a rule; conform is about matching a standard.",
      ),
    ).toBeInTheDocument();

    await user.type(screen.getByTestId("chat-input"), "第二个是什么意思");
    await user.click(getSubmitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const requestBody = JSON.parse(
      fetchMock.mock.calls[1]?.[1]?.body as string,
    ) as Record<string, unknown>;

    expect(requestBody.conversationContext).toEqual(conversationContext);
  });

  it("applies resolved collect_group follow-up actions to localStorage", async () => {
    const user = userEvent.setup();
    const resolvedFollowUp: ResolvedFollowUp = {
      kind: "resolved_action",
      action: "collect_group",
      activeExamTarget: "cet6",
      targetRefs: [
        {
          index: 1,
          lemma: "comply",
          label: "comply",
          sourceKind: "structured",
          partOfSpeech: "v.",
          meaningZh: "follow a rule",
          reviewStatus: "unreviewed",
        },
        {
          index: 2,
          lemma: "conform",
          label: "conform",
          sourceKind: "structured",
          partOfSpeech: "v.",
          meaningZh: "match a standard",
          reviewStatus: "unreviewed",
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "I collected comply and conform for this session.",
        answerKind: "plain",
        requestId: "req_collect_group",
        providerRequestId: null,
        resolvedFollowUp,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "收藏这一组");
    await user.click(getSubmitButton());

    expect(
      await screen.findByText("I collected comply and conform for this session."),
    ).toBeInTheDocument();

    const stored = JSON.parse(
      window.localStorage.getItem("enggo.collectedWords") ?? "{}",
    ) as {
      cet6?: Array<Record<string, unknown>>;
    };

    expect(stored.cet6?.map((item) => item.lemma)).toEqual([
      "comply",
      "conform",
    ]);
  });

  it("restores the latest chat transcript after remount", async () => {
    const user = userEvent.setup();
    window.sessionStorage.clear();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "commit usually means to promise, do, or spend resources.",
        answerKind: "plain",
        requestId: "req_transcript_restore",
        providerRequestId: null,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const firstRender = render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "commit meaning");
    await user.click(screen.getByRole("button", { name: /开始提问/i }));

    expect(await screen.findByText("commit meaning")).toBeInTheDocument();
    expect(
      await screen.findByText("commit usually means to promise, do, or spend resources."),
    ).toBeInTheDocument();
    expect(window.sessionStorage.getItem("enggo.chatTranscript")).toContain(
      "commit meaning",
    );

    firstRender.unmount();
    render(<ChatWorkspace />);

    expect(screen.getByText("commit meaning")).toBeInTheDocument();
    expect(
      screen.getByText("commit usually means to promise, do, or spend resources."),
    ).toBeInTheDocument();
  });

  it("restores old stored transcripts without conversation context fields", () => {
    window.sessionStorage.setItem(
      "enggo.chatTranscript",
      JSON.stringify([
        {
          id: "legacy-user-1",
          role: "user",
          content: "legacy question",
        },
        {
          id: "legacy-assistant-1",
          role: "assistant",
          content: "legacy answer",
        },
      ]),
    );

    render(<ChatWorkspace />);

    expect(screen.getByText("legacy question")).toBeInTheDocument();
    expect(screen.getByText("legacy answer")).toBeInTheDocument();
  });

  it("summarizes broad resolved answers without duplicating the main-answer list", async () => {
    const user = userEvent.setup();
    const candidates = Array.from({ length: 8 }, (_, index) => ({
      entryId: `word-${index + 1}`,
      lemma: `word${index + 1}`,
      meaningsZh: [`释义${index + 1}`],
      matchedAlias: null,
      scopeCodes: ["cet6"],
      inScope: true,
      reason: "in-scope main answer",
      score: 10 - index,
    }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: [
          "### 家族召回",
          "",
          "| word | 词性 | 核心义 |",
          "| :--- | :--- | :--- |",
          "| word1 | n. | 释义1 |",
          "| word2 | n. | 释义2 |",
        ].join("\n"),
        requestId: "req_test_broad",
        providerRequestId: "resp_test_broad",
        grounding: {
          activeExamTarget: "cet6",
          activeExamTargetLabel: "CET-6",
          query: "tion 结尾的词有哪些",
          queryMode: "root_family_summary",
          answerStyle: "root_family_summary",
          resolution: "resolved",
          noMatchReason: null,
          mainAnswer: candidates,
          confusionBoundary: [],
          scopeReminder: "scope reminder",
          followUpPrompt: "你可以继续问其中最容易混的两个词。",
          comparisonView: null,
          rootFamilyView: null,
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "tion 结尾的词有哪些");
    await user.click(screen.getByRole("button", { name: /开始提问/i }));

    expect(await screen.findByText("已命中 8 个当前范围词")).toBeInTheDocument();
    expect(
      screen.queryByText("word1 / word2 / word3 / word4 / word5 / word6 / word7 / word8"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开收藏工具" })).toBeInTheDocument();
  });

  it("explains source-lemma lookup as source-list material instead of structured content", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "accent\n\nn. 重音；口音；特点；注重点",
        answerKind: "grounded",
        requestId: "req_source_lemma",
        providerRequestId: null,
        grounding: {
          activeExamTarget: "cet4",
          activeExamTargetLabel: "CET-4",
          query: "accent",
          queryMode: "direct_lookup",
          answerStyle: "standard_lookup",
          resolution: "resolved",
          noMatchReason: null,
          matchType: "source_lemma_exact",
          mainAnswer: [
            {
              entryId: "source-lemma:accent",
              lemma: "accent",
              meaningsZh: [],
              matchedAlias: null,
              scopeCodes: ["cet4", "cet6"],
              inScope: true,
              reason: "source lemma exact match",
              score: 18,
              sourceKind: "source_lemma",
            },
          ],
          confusionBoundary: [],
          scopeReminder: "scope",
          followUpPrompt: "follow-up",
          comparisonView: null,
          rootFamilyView: null,
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "accent");
    await user.click(screen.getByRole("button", { name: /开始提问/i }));

    expect(
      await screen.findByText("来源词表命中 · 待补人工结构化词条"),
    ).toBeInTheDocument();
    expect(screen.queryByText("来源说明")).not.toBeInTheDocument();
    expect(screen.queryByText("已命中 1 个当前范围词：accent")).not.toBeInTheDocument();
  });

  it("explains external dictionary lookup as a basic unreviewed definition", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "make up\n\nphr. 组成；编造；化妆；弥补",
        answerKind: "grounded",
        requestId: "req_external_dictionary",
        providerRequestId: null,
        grounding: {
          activeExamTarget: "cet4",
          activeExamTargetLabel: "CET-4",
          query: "make up",
          queryMode: "direct_lookup",
          answerStyle: "standard_lookup",
          resolution: "resolved",
          noMatchReason: null,
          matchType: "external_dictionary_exact",
          mainAnswer: [
            {
              entryId: "external-dictionary-basic:make up",
              lemma: "make up",
              meaningsZh: ["phr. 组成；编造；化妆；弥补"],
              matchedAlias: null,
              scopeCodes: [],
              inScope: true,
              reason: "external dictionary basic exact match",
              score: 12,
              sourceKind: "external_dictionary_basic",
            },
          ],
          confusionBoundary: [],
          scopeReminder: "scope",
          followUpPrompt: "follow-up",
          comparisonView: null,
          rootFamilyView: null,
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "make up");
    await user.click(screen.getByRole("button", { name: /开始提问/i }));

    expect(
      await screen.findByText("外部基础词典 · 不参与易混词/词根/考试优先级判断"),
    ).toBeInTheDocument();
    expect(screen.queryByText("来源说明")).not.toBeInTheDocument();
    expect(screen.queryByText("已命中 1 个当前范围词：make up")).not.toBeInTheDocument();
  });

  it("renders plain greeting answers without grounded support tools", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer:
          "你好。你可以直接问一个单词、两个易混词，或者给我一个中文意思，我会先帮你缩小备考范围。",
        answerKind: "plain",
        requestId: "req_greeting",
        providerRequestId: null,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "你好");
    await user.click(screen.getByRole("button", { name: /开始提问/i }));

    expect(await screen.findByText(/你可以直接问一个单词/)).toBeInTheDocument();
    expect(screen.queryByText("命中状态")).not.toBeInTheDocument();
    expect(screen.queryByText("暂未稳定命中")).not.toBeInTheDocument();
    expect(screen.queryByText("收藏工具")).not.toBeInTheDocument();
    expect(screen.queryByText(/加入收藏/i)).not.toBeInTheDocument();
  });

  it("renders plain general-learning answers without grounded support tools", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer:
          "不是一个意思。先按通用英语理解：complex 多表示“复杂的”，complicate 是“使复杂化”。",
        answerKind: "plain",
        requestId: "req_plain_general",
        providerRequestId: "resp_plain_general",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "complex 和 complicate 是一个意思吗");
    await user.click(screen.getByRole("button", { name: /开始提问/i }));

    expect(await screen.findByText(/complex 多表示/)).toBeInTheDocument();
    expect(screen.queryByText("命中状态")).not.toBeInTheDocument();
    expect(screen.queryByText("暂未稳定命中")).not.toBeInTheDocument();
    expect(screen.queryByText("收藏工具")).not.toBeInTheDocument();
    expect(screen.queryByText(/加入收藏/i)).not.toBeInTheDocument();
  });

  it("shows a staged loading state while the answer is being prepared", async () => {
    const user = userEvent.setup();
    let resolveResponse: (value: {
      ok: boolean;
      json: () => Promise<unknown>;
    }) => void = () => {};
    const responsePromise = new Promise<{
      ok: boolean;
      json: () => Promise<unknown>;
    }>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn(() => responsePromise);

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "tion 结尾的词有哪些");
    await user.click(screen.getByRole("button", { name: /开始提问/i }));

    expect(screen.getByRole("button", { name: "组织答案中" })).toBeDisabled();
    expect(screen.getByText("正在检索当前范围词条")).toBeInTheDocument();
    expect(screen.getByText("整理易混边界")).toBeInTheDocument();
    expect(screen.getByText("组织可读答案")).toBeInTheDocument();

    resolveResponse({
      ok: true,
      json: async () => ({
        answer: "当前范围内暂时没有稳定命中。",
        requestId: "req_test_loading",
        providerRequestId: null,
        grounding: {
          activeExamTarget: "cet6",
          activeExamTargetLabel: "CET-6",
          query: "tion 结尾的词有哪些",
          queryMode: "root_family_summary",
          resolution: "no_match",
          noMatchReason: "out_of_kb",
          mainAnswer: [],
          confusionBoundary: [],
          scopeReminder: "这次先不硬猜。",
          followUpPrompt: "你可以继续给我一个更明确的词形片段。",
          comparisonView: null,
        },
      }),
    });

    expect(await screen.findByText("当前范围内暂时没有稳定命中。")).toBeInTheDocument();
    expect(screen.queryByText("正在检索当前范围词条")).not.toBeInTheDocument();
  });

  it("renders a no-match assistant card without an empty main-answer section", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer:
          "当前考试范围内未能稳定定位到你说的词，为避免答错对象，这次先不硬猜。你可以再告诉我它的中文意思、词首或词尾，或者你容易把它和哪个词搞混。",
        requestId: "req_test_no_match",
        providerRequestId: null,
        grounding: {
          activeExamTarget: "cet6",
          activeExamTargetLabel: "CET-6",
          query: "recent 这个词什么意思",
          queryMode: "fuzzy_recall",
          resolution: "no_match",
          noMatchReason: "out_of_kb",
          mainAnswer: [],
          confusionBoundary: [],
          scopeReminder: "这次我会继续优先按 CET-6 范围帮你缩小候选，不随意扩到范围外。",
          followUpPrompt:
            "如果你愿意，可以再告诉我中文义项、词首或词尾，或者你容易和哪个词搞混。",
          comparisonView: null,
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "recent 这个词什么意思");
    await user.click(screen.getByRole("button", { name: /开始提问/i }));

    expect(await screen.findByText(/这次先不硬猜/)).toBeInTheDocument();
    expect(screen.getByText("暂未稳定命中")).toBeInTheDocument();
    expect(screen.queryByText("主答案")).not.toBeInTheDocument();
    expect(screen.queryByText(/加入收藏/i)).not.toBeInTheDocument();
  });

  it("shows a recoverable user-facing error without leaking server details", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: {
          message: "OPENAI_API_KEY is not configured on the server.",
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.click(screen.getByText("遵从怎么说"));
    await user.click(screen.getByRole("button", { name: /开始提问/i }));

    expect(
      await screen.findByText("当前回答服务暂时不可用，请稍后再试。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("OPENAI_API_KEY is not configured on the server."),
    ).not.toBeInTheDocument();
  });
});
