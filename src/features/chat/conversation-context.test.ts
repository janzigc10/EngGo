// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  applyResolvedFollowUpAction,
  latestConversationContext,
} from "@/features/chat/conversation-context";
import type {
  ChatMessage,
  ConversationalLearningContext,
  ResolvedFollowUp,
} from "@/features/chat/types";

function createContext(
  overrides: Partial<ConversationalLearningContext> = {},
): ConversationalLearningContext {
  return {
    version: 1,
    activeExamTarget: "cet6",
    sourceMessageId: "assistant-1",
    topicKind: "confusion_untangle",
    focus: {
      kind: "candidate",
      label: "comply",
      lemma: "comply",
      index: 1,
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
    ],
    availableActions: ["collect_one", "collect_group"],
    expiresAfterTurns: 1,
    ...overrides,
  };
}

describe("conversation context helpers", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps the latest assistant context for one user follow-up and expires after configured user turns", () => {
    const context = createContext({ expiresAfterTurns: 1 });
    const assistantWithContext: ChatMessage = {
      id: "assistant-1",
      role: "assistant",
      content: "comply and conform are easy to mix up.",
      conversationContext: context,
    };

    expect(
      latestConversationContext([
        assistantWithContext,
        {
          id: "user-1",
          role: "user",
          content: "what about the second one?",
        },
      ]),
    ).toBe(context);

    expect(
      latestConversationContext([
        assistantWithContext,
        {
          id: "user-1",
          role: "user",
          content: "what about the second one?",
        },
        {
          id: "assistant-2",
          role: "assistant",
          content: "conform means match a rule or standard.",
        },
        {
          id: "user-2",
          role: "user",
          content: "collect it too",
        },
      ]),
    ).toBeNull();
  });

  it("ignores the latest assistant context when the active exam target changed", () => {
    const context = createContext({ activeExamTarget: "cet6" });
    const assistantWithContext: ChatMessage = {
      id: "assistant-1",
      role: "assistant",
      content: "access / assess / excess",
      conversationContext: context,
    };

    expect(
      latestConversationContext(
        [
          assistantWithContext,
          {
            id: "user-1",
            role: "user",
            content: "把这组都收藏",
          },
        ],
        "postgrad",
      ),
    ).toBeNull();
  });

  it("collect_group writes all target lemmas to enggo.collectedWords", () => {
    const action: ResolvedFollowUp = {
      kind: "resolved_action",
      action: "collect_group",
      activeExamTarget: "cet6",
      targetRefs: [
        {
          index: 1,
          lemma: "comply",
          label: "comply",
          meaningZh: "follow a rule",
        },
        {
          index: 2,
          lemma: "conform",
          label: "conform",
          meaningZh: "match a standard",
        },
      ],
    };

    expect(applyResolvedFollowUpAction(action, "cet6")).toContain("2");

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

  it("preserves source metadata while collecting resolved targets", () => {
    const action: ResolvedFollowUp = {
      kind: "resolved_action",
      action: "collect_one",
      activeExamTarget: "cet4",
      targetRefs: [
        {
          index: 1,
          lemma: "make up",
          label: "make up",
          sourceKind: "external_dictionary_basic",
          partOfSpeech: "phr.",
          meaningZh: "form or invent something",
          reviewStatus: "unreviewed",
        },
      ],
    };

    applyResolvedFollowUpAction(action, "cet4");

    const stored = JSON.parse(
      window.localStorage.getItem("enggo.collectedWords") ?? "{}",
    ) as {
      cet4?: Array<Record<string, unknown>>;
    };

    expect(stored.cet4?.[0]).toMatchObject({
      lemma: "make up",
      partOfSpeech: "phr.",
      meaningZh: "form or invent something",
      sourceKind: "external_dictionary_basic",
      reviewStatus: "unreviewed",
    });
  });
});
