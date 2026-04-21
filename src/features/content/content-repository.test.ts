import { describe, expect, it } from "vitest";

import { buildVocabularySeedPayload } from "@/features/content/import-schema";

describe("seed content schema", () => {
  it("accepts an in-scope vocabulary entry payload", () => {
    const parsed = buildVocabularySeedPayload({
      id: "comply",
      lemma: "comply",
      aliases: ["comply with"],
      pos: ["verb"],
      meaningsZh: ["遵从，依从"],
      examScopes: ["cet6", "postgrad"],
      examples: ["We must comply with the rules."],
      collocations: ["comply with rules"],
    });

    expect(parsed.lemma).toBe("comply");
  });
});
