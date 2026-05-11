import { describe, expect, it } from "vitest";

import {
  buildEcdictSourceOnlyAudit,
  cleanEcdictTranslation,
  parseEcdictCsv,
} from "./ecdict-source-only-audit";
import { parseEcdictSourceOnlyAuditArgs } from "../run-ecdict-source-only-audit";

describe("parseEcdictCsv", () => {
  it("parses quoted translations with embedded newlines", () => {
    const rows = parseEcdictCsv([
      "word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio",
      '"accent","ˈæksent",,"n. 口音；重音\\nv. 强调",,1,,cet4 cet6,1000,2000,,,',
      '"x-ray",,,n. X射线,,,,,0,0,,,',
    ].join("\n"));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      word: "accent",
      translation: "n. 口音；重音\nv. 强调",
      tag: "cet4 cet6",
    });
  });
});

describe("cleanEcdictTranslation", () => {
  it("keeps core meanings and drops noisy domain or web-only lines", () => {
    expect(
      cleanEcdictTranslation(
        "n. 口音；重音\nv. 强调\n[网络] 腔调；アクセント\n[医] 重音",
      ),
    ).toEqual({
      meanings: ["n. 口音；重音", "v. 强调"],
      droppedLines: ["[网络] 腔调；アクセント", "[医] 重音"],
    });
  });

  it("falls back to non-empty plain translation text when no POS prefix exists", () => {
    expect(cleanEcdictTranslation("坚持不懈地, 凭毅力").meanings).toEqual([
      "坚持不懈地, 凭毅力",
    ]);
  });
});

describe("buildEcdictSourceOnlyAudit", () => {
  it("counts source-only coverage without treating structured lemmas as gaps", () => {
    const audit = buildEcdictSourceOnlyAudit({
      ecdictRows: parseEcdictCsv([
        "word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio",
        '"accent",,,"n. 口音；重音\\nv. 强调",,1,,cet4 cet6,1000,2000,,,',
        '"coarse",,,"adj. 粗糙的\\n[网络] 粗俗",,1,,cet4,1000,2000,,,',
        '"domain",,,"[计] 域名",,1,,cet4,1000,2000,,,',
      ].join("\n")),
      sourceMemberships: [
        {
          lemma: "accent",
          scopeCode: "cet4",
          sourceName: "fixture.tsv",
          sourceScope: "cet4",
        },
        {
          lemma: "access",
          scopeCode: "cet4",
          sourceName: "fixture.tsv",
          sourceScope: "cet4",
        },
        {
          lemma: "coarse",
          scopeCode: "cet4",
          sourceName: "fixture.tsv",
          sourceScope: "cet4",
        },
        {
          lemma: "domain",
          scopeCode: "cet4",
          sourceName: "fixture.tsv",
          sourceScope: "cet4",
        },
        {
          lemma: "missing",
          scopeCode: "cet6",
          sourceName: "fixture.tsv",
          sourceScope: "cet6-extra",
        },
      ],
      structuredLemmas: ["access"],
      scopes: ["cet4", "cet6"],
    });

    expect(audit.summary.totalCandidates).toBe(4);
    expect(audit.summary.matched).toBe(3);
    expect(audit.summary.missing).toBe(1);
    expect(audit.summary.qualityCounts).toEqual({
      direct_usable: 1,
      cleaned_usable: 1,
      noisy_or_empty: 1,
      missing: 1,
    });
    expect(audit.samples.directUsable[0]?.lemma).toBe("accent");
    expect(audit.samples.cleanedUsable[0]?.lemma).toBe("coarse");
    expect(audit.samples.noisyOrEmpty[0]?.lemma).toBe("domain");
    expect(audit.samples.missing[0]?.lemma).toBe("missing");
  });
});

describe("parseEcdictSourceOnlyAuditArgs", () => {
  it("ignores the pnpm argument separator", () => {
    expect(
      parseEcdictSourceOnlyAuditArgs([
        "node",
        "script",
        "--",
        "--report-name",
        "ecdict-source-only-v1",
      ]).reportName,
    ).toBe("ecdict-source-only-v1");
  });
});
