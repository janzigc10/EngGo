import {
  examScopeCodes,
  type ConfusionGroupSeedPayload,
  type VocabularySeedPayload,
} from "@/features/content/import-types";

export type SeedContent = {
  entries: VocabularySeedPayload[];
  confusionGroups: ConfusionGroupSeedPayload[];
};

const minimumEntryCount = 32;
const minimumConfusionGroupCount = 8;
const requiredSeedLemmas = [
  "comply",
  "conform",
  "defer",
  "restrain",
  "constrain",
  "respect",
  "respective",
  "respectful",
  "respectable",
  "institute",
  "institution",
] as const;

export function summarizeSeedContent(seedContent: SeedContent) {
  const coveredScopeSet = new Set(
    seedContent.entries.flatMap((entry) => entry.examScopes),
  );

  return {
    entryCount: seedContent.entries.length,
    confusionGroupCount: seedContent.confusionGroups.length,
    coveredScopes: examScopeCodes.filter((scopeCode) => coveredScopeSet.has(scopeCode)),
  };
}

export function assertSeedContentRequirements(seedContent: SeedContent) {
  const summary = summarizeSeedContent(seedContent);

  if (summary.entryCount < minimumEntryCount) {
    throw new Error(
      `seed content must include at least ${minimumEntryCount} entries, received ${summary.entryCount}`,
    );
  }

  if (summary.confusionGroupCount < minimumConfusionGroupCount) {
    throw new Error(
      `seed content must include at least ${minimumConfusionGroupCount} confusion groups, received ${summary.confusionGroupCount}`,
    );
  }

  const missingScopes = examScopeCodes.filter(
    (scopeCode) => !summary.coveredScopes.includes(scopeCode),
  );

  if (missingScopes.length > 0) {
    throw new Error(
      `seed content is missing exam scope coverage: ${missingScopes.join(", ")}`,
    );
  }

  const lemmaSet = new Set(seedContent.entries.map((entry) => entry.lemma));
  const missingRequiredLemmas = requiredSeedLemmas.filter((lemma) => !lemmaSet.has(lemma));

  if (missingRequiredLemmas.length > 0) {
    throw new Error(
      `seed content is missing required lemmas: ${missingRequiredLemmas.join(", ")}`,
    );
  }
}
