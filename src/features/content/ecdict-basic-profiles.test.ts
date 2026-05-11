import { describe, expect, it } from "vitest";

import {
  buildEcdictBasicProfileIndex,
  createEcdictBasicProfileLookup,
  lookupEcdictBasicProfile,
} from "./ecdict-basic-profiles";
import { parseEcdictCsv } from "./ecdict-csv";

const fixtureRows = parseEcdictCsv([
  "word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio",
  '"makeup",,,"n. 化妆品；组成",,1,,cet4,1000,2000,,,',
  '"make up",,,"v. 组成；编造；化妆；和解",,1,,cet4,1000,2000,,,',
  '"well-known",,,"adj. 著名的；众所周知的",,1,,gk cet4,1000,2000,,,',
  '"according to",,,"prep. 根据；按照",,1,,cet4,1000,2000,,,',
  '"app",,,"[计] 应用程序",,1,,cet4,1000,2000,,,',
].join("\n"));

describe("lookupEcdictBasicProfile", () => {
  const index = buildEcdictBasicProfileIndex({
    rows: fixtureRows,
    joinedPhraseAliases: {
      accordingto: "according to",
    },
  });

  it("looks up ordinary words without merging phrases", () => {
    expect(lookupEcdictBasicProfile(index, "makeup")).toMatchObject({
      canonical: "makeup",
      entryKind: "word",
      matchKind: "exact",
      meanings: ["n. 化妆品；组成"],
    });

    expect(lookupEcdictBasicProfile(index, "makeup")?.canonical).not.toBe("make up");
  });

  it("looks up hyphenated words as word-like entries", () => {
    expect(lookupEcdictBasicProfile(index, "well-known")).toMatchObject({
      canonical: "well-known",
      entryKind: "hyphenated_word",
      matchKind: "exact",
      meanings: ["adj. 著名的；众所周知的"],
    });
  });

  it("looks up spaced phrases separately from words", () => {
    expect(lookupEcdictBasicProfile(index, "make up")).toMatchObject({
      canonical: "make up",
      entryKind: "phrase",
      matchKind: "exact",
      meanings: ["v. 组成；编造；化妆；和解"],
    });
  });

  it("normalizes explicit joined phrase aliases only", () => {
    expect(lookupEcdictBasicProfile(index, "accordingto")).toMatchObject({
      canonical: "according to",
      entryKind: "phrase",
      matchKind: "joined_phrase_alias",
      meanings: ["prep. 根据；按照"],
    });
  });

  it("does not return profiles when all translation lines are noisy domains", () => {
    expect(lookupEcdictBasicProfile(index, "app")).toBeNull();
  });
});

describe("createEcdictBasicProfileLookup", () => {
  it("loads ECDICT CSV lazily and returns explicit joined phrase aliases", async () => {
    let readCount = 0;
    const lookup = createEcdictBasicProfileLookup({
      dictionaryPath: "fixture/ecdict.csv",
      joinedPhraseAliases: {
        accordingto: "according to",
      },
      async readFile(dictionaryPath) {
        readCount += 1;
        expect(dictionaryPath).toBe("fixture/ecdict.csv");

        return [
          "word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio",
          '"according to",,,"prep. 根据；按照",,1,,cet4,1000,2000,,,',
        ].join("\n");
      },
    });

    await expect(lookup("accordingto")).resolves.toMatchObject({
      canonical: "according to",
      matchKind: "joined_phrase_alias",
      meanings: ["prep. 根据；按照"],
    });
    await expect(lookup("accordingto")).resolves.toMatchObject({
      canonical: "according to",
    });
    expect(readCount).toBe(1);
  });

  it("returns null when the dictionary file is missing", async () => {
    const lookup = createEcdictBasicProfileLookup({
      dictionaryPath: "missing/ecdict.csv",
      async readFile() {
        throw Object.assign(new Error("missing file"), { code: "ENOENT" });
      },
    });

    await expect(lookup("accent")).resolves.toBeNull();
  });
});
