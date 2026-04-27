// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnswerContent } from "@/components/chat/answer-content";

describe("AnswerContent", () => {
  it("renders markdown tables as real table elements", () => {
    render(
      <AnswerContent
        content={[
          "**家族召回**：",
          "",
          "| word | 词性 | 核心义 |",
          "| :--- | :--- | :--- |",
          "| condition | n. | 条件；状况 |",
          "| connection | n. | 联系；连接 |",
          "",
          "意义分流：这些词共享 -tion，但现代义已经分流。",
        ].join("\n")}
      />,
    );

    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "word" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "condition" })).toBeInTheDocument();
    expect(screen.queryByText("| word | 词性 | 核心义 |")).not.toBeInTheDocument();
  });

  it("renders inline emphasis, code spans, and bullet lists without exposing markdown markers", () => {
    render(
      <AnswerContent
        content={[
          "**碎片定位**：`struct` 是词形线索。",
          "",
          "- construct = 建造",
          "- structure = 结构",
        ].join("\n")}
      />,
    );

    expect(screen.getByText("碎片定位")).toBeInTheDocument();
    expect(screen.getByText("struct")).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("construct = 建造")).toBeInTheDocument();
    expect(screen.queryByText("**碎片定位**")).not.toBeInTheDocument();
  });

  it("renders markdown headings without showing heading markers", () => {
    render(<AnswerContent content={"### 碎片定位\n-tion 是名词后缀。"} />);

    expect(screen.getByRole("heading", { name: "碎片定位" })).toBeInTheDocument();
    expect(screen.queryByText("### 碎片定位")).not.toBeInTheDocument();
  });
});
