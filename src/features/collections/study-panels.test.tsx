// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { CollectionsPanel } from "@/features/collections/study-panels";

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
    ).toHaveAttribute("href", "/?draft=make%20up%20%E6%80%8E%E4%B9%88%E7%94%A8");
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
});
