// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
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

  it("prefills the composer from the draft query parameter", async () => {
    window.history.pushState(
      {},
      "",
      "/?draft=make%20up%20%E6%80%8E%E4%B9%88%E7%94%A8",
    );

    render(<ChatWorkspace />);

    expect(await screen.findByDisplayValue("make up 怎么用")).toBeInTheDocument();
  });

  it("syncs the active exam target from a collection follow-up link", async () => {
    window.history.pushState(
      {},
      "",
      "/?draft=make%20up%20%E6%80%8E%E4%B9%88%E7%94%A8&examTarget=cet4",
    );

    render(<ChatWorkspace />);

    expect(await screen.findByDisplayValue("make up 怎么用")).toBeInTheDocument();

    await waitFor(() => {
      expect(window.localStorage.getItem("enggo.activeExamTarget")).toBe("cet4");
    });
    expect(screen.getByTestId("active-exam-target")).toHaveTextContent("当前词书：CET-4");
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

  it("does not send an old conversation context after the active exam target changes", async () => {
    const user = userEvent.setup();
    const conversationContext: ConversationalLearningContext = {
      version: 1,
      activeExamTarget: "cet6",
      sourceMessageId: "assistant-context-scope",
      topicKind: "confusion_untangle",
      focus: {
        kind: "group",
        label: "access / assess",
      },
      candidates: [
        {
          index: 1,
          lemma: "access",
          label: "access",
        },
        {
          index: 2,
          lemma: "assess",
          label: "assess",
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
          answer: "access / assess context ready.",
          answerKind: "plain",
          requestId: "req_scope_1",
          providerRequestId: null,
          conversationContext,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: "Tell me the group again under this wordbook.",
          answerKind: "plain",
          requestId: "req_scope_2",
          providerRequestId: null,
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "access assess 怎么区分");
    await user.click(getSubmitButton());
    expect(await screen.findByText("access / assess context ready.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /考研/i }));
    await user.type(screen.getByTestId("chat-input"), "把这组都收藏");
    await user.click(getSubmitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const secondRequestBody = JSON.parse(
      fetchMock.mock.calls[1]?.[1]?.body as string,
    ) as Record<string, unknown>;

    expect(secondRequestBody.activeExamTarget).toBe("postgrad");
    expect(secondRequestBody).not.toHaveProperty("conversationContext");
  });

  it("syncs active exam target from a scope-switch follow-up response", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "已切换到考研范围。",
        answerKind: "plain",
        requestId: "req_scope_switch",
        providerRequestId: null,
        resolvedFollowUp: {
          kind: "resolved_action",
          action: "switch_scope",
          activeExamTarget: "postgrad",
          targetRefs: [],
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "换成考研范围");
    await user.click(getSubmitButton());

    expect(await screen.findByText("已切换到考研范围。")).toBeInTheDocument();
    await waitFor(() => {
      expect(window.localStorage.getItem("enggo.activeExamTarget")).toBe("postgrad");
    });
    expect(screen.getByTestId("active-exam-target")).toHaveTextContent("当前词书：考研");
  });

  it("shows a quiet context hint after an assistant response with conversation context", async () => {
    const user = userEvent.setup();
    const conversationContext: ConversationalLearningContext = {
      version: 1,
      activeExamTarget: "cet6",
      sourceMessageId: "assistant-context-hint",
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
        },
        {
          index: 2,
          lemma: "conform",
          label: "conform",
        },
      ],
      availableActions: ["collect_one", "collect_group"],
      expiresAfterTurns: 2,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "comply / conform context ready.",
        answerKind: "plain",
        requestId: "req_context_hint",
        providerRequestId: null,
        conversationContext,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "comply conform");
    await user.click(getSubmitButton());

    expect(await screen.findByText("comply / conform context ready.")).toBeInTheDocument();
    expect(screen.getByText("正在追问：comply / conform")).toBeInTheDocument();
  });

  it("renders clarification option buttons that fill the composer without submitting", async () => {
    const user = userEvent.setup();
    const resolvedFollowUp: ResolvedFollowUp = {
      kind: "clarification",
      message: "Which word do you mean?",
      options: [
        {
          index: 1,
          lemma: "access",
          label: "access",
        },
        {
          index: 2,
          lemma: "assess",
          label: "assess",
        },
        {
          index: 3,
          lemma: "excess",
          label: "excess",
        },
        {
          index: 4,
          lemma: "accept",
          label: "accept",
        },
        {
          index: 5,
          lemma: "except",
          label: "except",
        },
        {
          index: 6,
          lemma: "accent",
          label: "accent",
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "I need one more detail before answering.",
        answerKind: "plain",
        requestId: "req_clarification_options",
        providerRequestId: null,
        resolvedFollowUp,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "a 开头那个词是什么意思");
    await user.click(getSubmitButton());

    expect(
      await screen.findByText("I need one more detail before answering."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "access 是什么意思" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "except 是什么意思" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "accent 是什么意思" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "access 是什么意思" }));

    expect(screen.getByDisplayValue("access 是什么意思")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hides old clarification options after the user submits another message that fails", async () => {
    const user = userEvent.setup();
    const resolvedFollowUp: ResolvedFollowUp = {
      kind: "clarification",
      message: "Which word do you mean?",
      options: [
        {
          index: 1,
          lemma: "access",
          label: "access",
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: "I need one more detail before answering.",
          answerKind: "plain",
          requestId: "req_old_clarification",
          providerRequestId: null,
          resolvedFollowUp,
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: {
            message: "Temporary failure.",
          },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "第二个是什么意思");
    await user.click(getSubmitButton());

    expect(await screen.findByRole("button", { name: "access 是什么意思" })).toBeInTheDocument();

    await user.type(screen.getByTestId("chat-input"), "assess 是什么意思");
    await user.click(getSubmitButton());

    expect(await screen.findByText("Temporary failure.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "access 是什么意思" })).not.toBeInTheDocument();
  });

  it("does not send an expired conversation context on a later follow-up prompt", async () => {
    const user = userEvent.setup();
    const conversationContext: ConversationalLearningContext = {
      version: 1,
      activeExamTarget: "cet6",
      sourceMessageId: "assistant-context-expiring",
      topicKind: "confusion_untangle",
      focus: {
        kind: "group",
        label: "access / assess",
      },
      candidates: [
        {
          index: 1,
          lemma: "access",
          label: "access",
        },
        {
          index: 2,
          lemma: "assess",
          label: "assess",
        },
      ],
      availableActions: ["collect_one", "collect_group"],
      expiresAfterTurns: 1,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: "access and assess are close in form.",
          answerKind: "plain",
          requestId: "req_expiry_1",
          providerRequestId: null,
          conversationContext,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: "assess means to evaluate.",
          answerKind: "plain",
          requestId: "req_expiry_2",
          providerRequestId: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: "Tell me which word you mean.",
          answerKind: "plain",
          requestId: "req_expiry_3",
          providerRequestId: null,
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "access assess");
    await user.click(getSubmitButton());
    expect(await screen.findByText("access and assess are close in form.")).toBeInTheDocument();

    await user.type(screen.getByTestId("chat-input"), "第二个是什么意思");
    await user.click(getSubmitButton());
    expect(await screen.findByText("assess means to evaluate.")).toBeInTheDocument();

    await user.type(screen.getByTestId("chat-input"), "再讲一下第二个");
    await user.click(getSubmitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const thirdRequestBody = JSON.parse(
      fetchMock.mock.calls[2]?.[1]?.body as string,
    ) as Record<string, unknown>;

    expect(thirdRequestBody).not.toHaveProperty("conversationContext");
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

  it("renders context_choice follow-up answers without collecting target words", async () => {
    const user = userEvent.setup();
    const resolvedFollowUp: ResolvedFollowUp = {
      kind: "resolved_action",
      action: "context_choice",
      activeExamTarget: "cet6",
      targetRefs: [
        {
          index: 1,
          lemma: "access",
          label: "access",
        },
        {
          index: 2,
          lemma: "assess",
          label: "assess",
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "考试表达里优先用 access。它指进入权或使用权；assess 是评估。",
        answerKind: "plain",
        requestId: "req_context_choice",
        providerRequestId: "resp_context_choice",
        resolvedFollowUp,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "哪个更适合考试表达");
    await user.click(getSubmitButton());

    expect(await screen.findByText(/优先用 access/)).toBeInTheDocument();
    expect(window.localStorage.getItem("enggo.collectedWords")).toBeNull();
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

    expect(await screen.findByText("commit meaning")).toBeInTheDocument();
    expect(
      screen.getByText("commit usually means to promise, do, or spend resources."),
    ).toBeInTheDocument();
  });

  it("restores old stored transcripts without conversation context fields", async () => {
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

    expect(await screen.findByText("legacy question")).toBeInTheDocument();
    expect(screen.getByText("legacy answer")).toBeInTheDocument();
  });

  it("restores stored transcripts only after the client mounts", async () => {
    window.sessionStorage.setItem(
      "enggo.chatTranscript",
      JSON.stringify([
        {
          id: "stored-user-1",
          role: "user",
          content: "stored question",
        },
        {
          id: "stored-assistant-1",
          role: "assistant",
          content: "stored answer",
        },
      ]),
    );

    const serverHtml = renderToString(<ChatWorkspace />);

    expect(serverHtml).not.toContain("stored question");
    expect(serverHtml).not.toContain("stored answer");

    render(<ChatWorkspace />);

    expect(await screen.findByText("stored question")).toBeInTheDocument();
    expect(screen.getByText("stored answer")).toBeInTheDocument();
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

  it("renders meaning expression advice as non-hit guidance", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "表达观点可以先用 express an opinion 或 state your view。",
        answerKind: "plain",
        requestId: "req_meaning_expression_advice",
        providerRequestId: null,
        grounding: {
          activeExamTarget: "postgrad",
          activeExamTargetLabel: "考研",
          query: "表达观点的英文是什么",
          queryMode: "meaning_lookup",
          answerStyle: "meaning_expression_advice",
          resolution: "no_match",
          noMatchReason: "low_confidence",
          mainAnswer: [],
          confusionBoundary: [],
          scopeReminder: "这次是表达建议，不标记为词库命中。",
          followUpPrompt: "你可以继续问这些表达哪个更正式或更适合作文。",
          comparisonView: null,
          rootFamilyView: null,
          expressionOptions: ["express an opinion", "state your view"],
          weakCandidateLemmas: ["hiss"],
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWorkspace />);

    await user.type(screen.getByTestId("chat-input"), "表达观点的英文是什么");
    await user.click(screen.getByRole("button", { name: /开始提问/i }));

    expect(await screen.findByText("表达建议")).toBeInTheDocument();
    expect(screen.getByText("这次是表达建议，不标记为词库命中。")).toBeInTheDocument();
    expect(screen.queryByText("已命中 0 个当前范围词")).not.toBeInTheDocument();
    expect(screen.queryByText("暂未稳定命中")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /收藏/i })).not.toBeInTheDocument();
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
    expect(screen.queryByText(/^正在追问：/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /是什么意思/ })).not.toBeInTheDocument();
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
    expect(screen.queryByText(/^正在追问：/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /是什么意思/ })).not.toBeInTheDocument();
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
