import { describe, expect, it } from "vitest";

import {
  assertSeedContentRequirements,
  summarizeSeedContent,
} from "@/features/content/seed-content-rules";

const validSeedContent = {
  entries: Array.from({ length: 32 }, (_, index) => ({
    id: `entry-${index}`,
    lemma: `lemma-${index}`,
    aliases: [],
    pos: ["noun"],
    meaningsZh: [`释义 ${index}`],
    examScopes: index < 8
      ? ["gaokao"]
      : index < 16
        ? ["cet4"]
        : index < 24
          ? ["cet6"]
          : ["postgrad"],
    examples: [],
    collocations: [],
  })).concat([
    {
      id: "comply",
      lemma: "comply",
      aliases: [],
      pos: ["verb"],
      meaningsZh: ["遵从"],
      examScopes: ["cet6"],
      examples: [],
      collocations: [],
    },
    {
      id: "conform",
      lemma: "conform",
      aliases: [],
      pos: ["verb"],
      meaningsZh: ["符合"],
      examScopes: ["cet6"],
      examples: [],
      collocations: [],
    },
    {
      id: "defer",
      lemma: "defer",
      aliases: [],
      pos: ["verb"],
      meaningsZh: ["延期"],
      examScopes: ["postgrad"],
      examples: [],
      collocations: [],
    },
    {
      id: "restrain",
      lemma: "restrain",
      aliases: [],
      pos: ["verb"],
      meaningsZh: ["克制"],
      examScopes: ["postgrad"],
      examples: [],
      collocations: [],
    },
    {
      id: "constrain",
      lemma: "constrain",
      aliases: [],
      pos: ["verb"],
      meaningsZh: ["限制"],
      examScopes: ["postgrad"],
      examples: [],
      collocations: [],
    },
    {
      id: "respect",
      lemma: "respect",
      aliases: [],
      pos: ["verb"],
      meaningsZh: ["尊重"],
      examScopes: ["gaokao"],
      examples: [],
      collocations: [],
    },
    {
      id: "respective",
      lemma: "respective",
      aliases: [],
      pos: ["adjective"],
      meaningsZh: ["各自的"],
      examScopes: ["cet4"],
      examples: [],
      collocations: [],
    },
    {
      id: "respectful",
      lemma: "respectful",
      aliases: [],
      pos: ["adjective"],
      meaningsZh: ["表示尊重的"],
      examScopes: ["cet4"],
      examples: [],
      collocations: [],
    },
    {
      id: "respectable",
      lemma: "respectable",
      aliases: [],
      pos: ["adjective"],
      meaningsZh: ["体面的"],
      examScopes: ["cet4"],
      examples: [],
      collocations: [],
    },
    {
      id: "institute",
      lemma: "institute",
      aliases: [],
      pos: ["noun"],
      meaningsZh: ["学院"],
      examScopes: ["cet6"],
      examples: [],
      collocations: [],
    },
    {
      id: "institution",
      lemma: "institution",
      aliases: [],
      pos: ["noun"],
      meaningsZh: ["机构"],
      examScopes: ["cet6"],
      examples: [],
      collocations: [],
    },
  ]),
  confusionGroups: Array.from({ length: 8 }, (_, index) => ({
    id: `group-${index}`,
    members: ["comply", "conform"],
    teachFirst: "comply",
    whyConfusing: "相近",
    commonMisusePoints: ["混用"],
    semanticBoundaryNotes: ["边界"],
    memberNotes: {},
  })),
};

describe("seed content rules", () => {
  it("summarizes counts and exam scope coverage", () => {
    expect(summarizeSeedContent(validSeedContent)).toEqual({
      entryCount: 43,
      confusionGroupCount: 8,
      coveredScopes: ["gaokao", "cet4", "cet6", "postgrad"],
    });
  });

  it("rejects seed content that misses a required exam scope", () => {
    expect(() =>
      assertSeedContentRequirements({
        ...validSeedContent,
        entries: validSeedContent.entries.map((entry) =>
          entry.examScopes.includes("postgrad")
            ? { ...entry, examScopes: ["cet6"] }
            : entry,
        ),
      }),
    ).toThrow(/missing exam scope coverage: postgrad/i);
  });
});
