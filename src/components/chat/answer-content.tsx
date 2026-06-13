import type { ReactNode } from "react";

type AnswerContentProps = {
  content: string;
};

type ParagraphBlock = {
  kind: "paragraph";
  lines: string[];
};

type ListBlock = {
  kind: "list";
  items: string[];
};

type TableBlock = {
  kind: "table";
  headers: string[];
  rows: string[][];
};

type HeadingBlock = {
  kind: "heading";
  text: string;
};

type AnswerBlock = ParagraphBlock | ListBlock | TableBlock | HeadingBlock;

function isBlank(line: string) {
  return line.trim().length === 0;
}

function isTableRow(line: string) {
  const trimmed = line.trim();

  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.slice(1, -1).includes("|");
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string) {
  if (!isTableRow(line)) {
    return false;
  }

  return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseAnswerBlocks(content: string): AnswerBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: AnswerBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    if (isBlank(lines[index] ?? "")) {
      index += 1;
      continue;
    }

    const current = lines[index] ?? "";
    const next = lines[index + 1] ?? "";
    const headingMatch = current.match(/^\s*#{1,4}\s+(.+)$/);

    if (headingMatch) {
      blocks.push({ kind: "heading", text: headingMatch[1].trim() });
      index += 1;
      continue;
    }

    if (isTableRow(current) && isSeparatorRow(next)) {
      const headers = splitTableRow(current);
      const rows: string[][] = [];
      index += 2;

      while (index < lines.length && isTableRow(lines[index] ?? "")) {
        rows.push(splitTableRow(lines[index] ?? ""));
        index += 1;
      }

      blocks.push({ kind: "table", headers, rows });
      continue;
    }

    if (/^\s*-\s+/.test(current)) {
      const items: string[] = [];

      while (index < lines.length && /^\s*-\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*-\s+/, ""));
        index += 1;
      }

      blocks.push({ kind: "list", items });
      continue;
    }

    const paragraphLines: string[] = [];

    while (
      index < lines.length &&
      !isBlank(lines[index] ?? "") &&
      !/^\s*#{1,4}\s+/.test(lines[index] ?? "") &&
      !(isTableRow(lines[index] ?? "") && isSeparatorRow(lines[index + 1] ?? "")) &&
      !/^\s*-\s+/.test(lines[index] ?? "")
    ) {
      paragraphLines.push(lines[index] ?? "");
      index += 1;
    }

    blocks.push({ kind: "paragraph", lines: paragraphLines });
  }

  return blocks;
}

function renderInline(text: string) {
  const nodes: ReactNode[] = [];
  const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${match.index}-${token}`;

    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-[#151515]">
          {token.slice(2, -2).trim()}
        </strong>,
      );
    } else {
      nodes.push(
        <code
          key={key}
          className="rounded-md bg-[#f1eee7] px-1.5 py-0.5 font-mono text-[0.92em] text-[#151515]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function normalizeParagraph(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean).join(" ");
}

function getColumnWidth(columnCount: number, columnIndex: number) {
  if (columnCount === 3) {
    return ["44%", "16%", "40%"][columnIndex] ?? "auto";
  }

  return `${100 / Math.max(columnCount, 1)}%`;
}

export function AnswerContent({ content }: AnswerContentProps) {
  const blocks = parseAnswerBlocks(content);

  return (
    <div className="min-w-0 max-w-full space-y-4 text-sm leading-7 text-[#151515]">
      {blocks.map((block, blockIndex) => {
        if (block.kind === "heading") {
          return (
            <h3
              key={`heading-${blockIndex}`}
              className="text-sm font-semibold text-[#151515]"
            >
              {renderInline(block.text)}
            </h3>
          );
        }

        if (block.kind === "table") {
          return (
            <div
              key={`table-${blockIndex}`}
              className="max-w-full overflow-x-auto rounded-xl border border-[#e5e1d7] bg-white"
            >
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <colgroup>
                  {block.headers.map((header, columnIndex) => (
                    <col
                      key={`${header}-${columnIndex}`}
                      style={{
                        width: getColumnWidth(block.headers.length, columnIndex),
                      }}
                    />
                  ))}
                </colgroup>
                <thead className="bg-[#f8f8f6] text-[#6f6f68]">
                  <tr>
                    {block.headers.map((header) => (
                      <th
                        key={header}
                        scope="col"
                        className="break-words border-b border-[#e5e1d7] px-3 py-3 text-xs font-semibold sm:px-4"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e1d7]">
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${row.join("-")}-${rowIndex}`}>
                      {block.headers.map((header, cellIndex) => (
                        <td
                          key={`${header}-${cellIndex}`}
                          className="break-words px-3 py-3 align-top text-[#151515] sm:px-4"
                        >
                          {renderInline(row[cellIndex] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.kind === "list") {
          return (
            <ul key={`list-${blockIndex}`} className="list-disc space-y-2 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`paragraph-${blockIndex}`}>
            {renderInline(normalizeParagraph(block.lines))}
          </p>
        );
      })}
    </div>
  );
}
