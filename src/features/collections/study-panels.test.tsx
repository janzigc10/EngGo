// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import {
  CollectionsPanel,
  LearnPanel,
  ReviewPanel,
} from "@/features/collections/study-panels";
import { getDefaultWordbook } from "@/features/wordbook/wordbook-data";
import {
  createDefaultProgress,
  getNextReviewAt,
  saveWordProgress,
} from "@/features/wordbook/wordbook-progress-store";

describe("CollectionsPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders collected words with structured metadata and a return-to-chat action", () => {
    window.localStorage.setItem(
      "enggo.collectedWords",
      JSON.stringify({
        cet4: [
          {
            examTarget: "cet4",
            lemma: "make up",
            note: "外部基础词典释义：phr. 组成；编造；化妆；弥补",
            partOfSpeech: "phr.",
            meaningZh: "组成；编造；化妆；弥补",
            sourceKind: "external_dictionary_basic",
            reviewStatus: "unreviewed",
            collectedAt: "2026-05-16T07:00:00.000Z",
          },
        ],
      }),
    );

    render(<CollectionsPanel />);

    const cet4Section = screen.getByRole("region", { name: "CET-4 收藏" });

    expect(within(cet4Section).getByText("make up")).toBeInTheDocument();
    expect(within(cet4Section).getByText("phr.")).toBeInTheDocument();
    expect(
      within(cet4Section).getByText("组成；编造；化妆；弥补"),
    ).toBeInTheDocument();
    expect(within(cet4Section).getByText("外部基础词典")).toBeInTheDocument();
    expect(within(cet4Section).getByText("未人工校验")).toBeInTheDocument();
    expect(within(cet4Section).getByText("2026-05-16")).toBeInTheDocument();
    expect(
      within(cet4Section).getByRole("link", { name: "继续追问 make up" }),
    ).toHaveAttribute(
      "href",
      "/?draft=make%20up%20%E6%80%8E%E4%B9%88%E7%94%A8&examTarget=cet4",
    );
  });

  it("removes a collected word from the page and storage", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "enggo.collectedWords",
      JSON.stringify({
        cet6: [
          {
            examTarget: "cet6",
            lemma: "access",
            note: "进入权；使用权",
            meaningZh: "进入权；使用权",
            collectedAt: "2026-05-16T07:00:00.000Z",
          },
        ],
      }),
    );

    render(<CollectionsPanel />);

    await user.click(screen.getByRole("button", { name: "删除 access" }));

    expect(screen.queryByText("access")).not.toBeInTheDocument();

    const stored = JSON.parse(
      window.localStorage.getItem("enggo.collectedWords") ?? "{}",
    ) as {
      cet6?: unknown[];
    };
    expect(stored.cet6).toEqual([]);
  });

  it("keeps a Learn session available after exiting to the dashboard", async () => {
    const user = userEvent.setup();
    const wordbook = getDefaultWordbook();

    render(<LearnPanel />);

    await user.click(screen.getByRole("button", { name: /开始 Learn/ }));
    expect(screen.getByText(wordbook.entries[0].lemma)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "退出" }));

    await waitFor(() => {
      expect(screen.getByText("有一轮 Learn 正在进行")).toBeInTheDocument();
    });
    expect(screen.getByText("继续 Learn 0 / 10")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "继续" }));

    expect(screen.getByText(wordbook.entries[0].lemma)).toBeInTheDocument();
    expect(screen.getByText("0 / 10")).toBeInTheDocument();
  });

  it("keeps a forgotten Review session at its saved detail stage after exit", async () => {
    const user = userEvent.setup();
    const wordbook = getDefaultWordbook();
    const entry = wordbook.entries[0];

    saveWordProgress({
      ...createDefaultProgress(entry, wordbook.id, new Date("2026-05-29")),
      status: "passed",
      masteryDots: 3,
      reviewStrength: 1,
      nextReviewAt: getNextReviewAt(new Date("2026-05-29"), 1),
    });

    render(<ReviewPanel />);

    await user.click(screen.getByRole("button", { name: /开始 Review/ }));
    await user.click(screen.getByRole("button", { name: "忘记了" }));
    expect(screen.getByText("Meaning")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "退出" }));

    await waitFor(() => {
      expect(screen.getByText("有一轮 Review 正在进行")).toBeInTheDocument();
    });
    expect(screen.getByText("继续 Review 0 / 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "继续" }));

    expect(screen.getByText(entry.lemma)).toBeInTheDocument();
    expect(screen.getByText("Meaning")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "忘记了" })).not.toBeInTheDocument();
  });
});
