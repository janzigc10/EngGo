import fs from "node:fs/promises";
import path from "node:path";

import type { EcdictRow } from "./ecdict-csv";
import {
  cleanEcdictTranslation,
  parseEcdictCsv,
} from "./ecdict-csv";

export type EcdictBasicProfileEntryKind = "word" | "hyphenated_word" | "phrase";
export type EcdictBasicProfileMatchKind = "exact" | "joined_phrase_alias";

export type EcdictBasicProfile = {
  canonical: string;
  lookupKey: string;
  entryKind: EcdictBasicProfileEntryKind;
  matchKind: EcdictBasicProfileMatchKind;
  meanings: string[];
  rawTranslation: string;
  tag: string;
  sourceKind: "external_dictionary_basic";
  reviewStatus: "unreviewed";
};

export type EcdictBasicProfileIndex = {
  profilesByKey: Map<string, Omit<EcdictBasicProfile, "lookupKey" | "matchKind">>;
  joinedPhraseAliases: Map<string, string>;
};

export type BuildEcdictBasicProfileIndexOptions = {
  rows: EcdictRow[];
  joinedPhraseAliases?: Record<string, string>;
};

export type EcdictBasicProfileLookup = (
  query: string,
) => Promise<EcdictBasicProfile | null>;

export type CreateEcdictBasicProfileLookupOptions = {
  dictionaryPath?: string;
  joinedPhraseAliases?: Record<string, string>;
  readFile?: (dictionaryPath: string) => Promise<string>;
};

export const defaultEcdictDictionaryPath = path.join(
  process.cwd(),
  "output",
  "external-dictionaries",
  "ecdict.csv",
);

export const defaultJoinedPhraseAliases = {
  accordingto: "according to",
  oughtto: "ought to",
  owingto: "owing to",
};

function normalizeLookupKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function inferEntryKind(canonical: string): EcdictBasicProfileEntryKind {
  if (/\s/.test(canonical)) {
    return "phrase";
  }

  if (canonical.includes("-")) {
    return "hyphenated_word";
  }

  return "word";
}

function createProfile(row: EcdictRow) {
  const canonical = normalizeLookupKey(row.word);
  const cleanResult = cleanEcdictTranslation(row.translation);

  if (!canonical || cleanResult.meanings.length === 0) {
    return null;
  }

  return {
    canonical,
    entryKind: inferEntryKind(canonical),
    meanings: cleanResult.meanings,
    rawTranslation: row.translation,
    tag: row.tag,
    sourceKind: "external_dictionary_basic" as const,
    reviewStatus: "unreviewed" as const,
  };
}

export function buildEcdictBasicProfileIndex({
  rows,
  joinedPhraseAliases = {},
}: BuildEcdictBasicProfileIndexOptions): EcdictBasicProfileIndex {
  const profilesByKey = new Map<
    string,
    Omit<EcdictBasicProfile, "lookupKey" | "matchKind">
  >();
  const normalizedAliases = new Map<string, string>();

  for (const row of rows) {
    const profile = createProfile(row);

    if (!profile) {
      continue;
    }

    profilesByKey.set(profile.canonical, profile);
  }

  for (const [rawAlias, rawCanonical] of Object.entries(joinedPhraseAliases)) {
    const alias = normalizeLookupKey(rawAlias);
    const canonical = normalizeLookupKey(rawCanonical);

    if (!alias || !canonical || alias === canonical) {
      continue;
    }

    normalizedAliases.set(alias, canonical);
  }

  return {
    profilesByKey,
    joinedPhraseAliases: normalizedAliases,
  };
}

export function lookupEcdictBasicProfile(
  index: EcdictBasicProfileIndex,
  rawQuery: string,
): EcdictBasicProfile | null {
  const lookupKey = normalizeLookupKey(rawQuery);
  const exactProfile = index.profilesByKey.get(lookupKey);

  if (exactProfile) {
    return {
      ...exactProfile,
      lookupKey,
      matchKind: "exact",
    };
  }

  const phraseCanonical = index.joinedPhraseAliases.get(lookupKey);

  if (!phraseCanonical) {
    return null;
  }

  const phraseProfile = index.profilesByKey.get(phraseCanonical);

  if (!phraseProfile) {
    return null;
  }

  return {
    ...phraseProfile,
    lookupKey,
    matchKind: "joined_phrase_alias",
  };
}

function isMissingFileError(error: unknown) {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "ENOENT"
  );
}

export function createEcdictBasicProfileLookup({
  dictionaryPath = defaultEcdictDictionaryPath,
  joinedPhraseAliases = defaultJoinedPhraseAliases,
  readFile = (targetPath) => fs.readFile(targetPath, "utf8"),
}: CreateEcdictBasicProfileLookupOptions = {}): EcdictBasicProfileLookup {
  let indexPromise: Promise<EcdictBasicProfileIndex | null> | null = null;

  async function loadIndex() {
    indexPromise ??= (async () => {
      try {
        const rawDictionary = await readFile(dictionaryPath);

        return buildEcdictBasicProfileIndex({
          rows: parseEcdictCsv(rawDictionary),
          joinedPhraseAliases,
        });
      } catch (error) {
        if (isMissingFileError(error)) {
          return null;
        }

        throw error;
      }
    })();

    return indexPromise;
  }

  return async (query) => {
    const index = await loadIndex();

    if (!index) {
      return null;
    }

    return lookupEcdictBasicProfile(index, query);
  };
}
