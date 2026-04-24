import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  confusionGroupSeedListSchema,
  vocabularySeedPayloadListSchema,
} from "@/features/content/import-schema";
import { assertSeedContentRequirements } from "@/features/content/seed-content-rules";

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function ensureNoDuplicates(values: string[], label: string) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);

  if (duplicates.length > 0) {
    throw new Error(`${label} contains duplicate values: ${unique(duplicates).join(", ")}`);
  }
}

function ensureMembersExist(entryIds: string[], confusionGroupMembers: string[]) {
  const missing = confusionGroupMembers.filter((member) => !entryIds.includes(member));

  if (missing.length > 0) {
    throw new Error(`confusion groups reference missing entries: ${unique(missing).join(", ")}`);
  }
}

export type LoadVocabContentOptions = {
  datasetName?: string;
  baseDir?: string;
};

export async function loadVocabContent({
  datasetName = "seed",
  baseDir = path.join(process.cwd(), "data", "exam-vocab"),
}: LoadVocabContentOptions = {}) {
  const seedDir = path.join(baseDir, datasetName);
  const [entriesRaw, confusionGroupsRaw] = await Promise.all([
    readFile(path.join(seedDir, "entries.json"), "utf8"),
    readFile(path.join(seedDir, "confusion-groups.json"), "utf8"),
  ]);

  const entries = vocabularySeedPayloadListSchema.parse(JSON.parse(entriesRaw));
  const confusionGroups = confusionGroupSeedListSchema.parse(
    JSON.parse(confusionGroupsRaw),
  );

  const entryIds = entries.map((entry) => entry.id);
  const groupIds = confusionGroups.map((group) => group.id);
  const allMembers = confusionGroups.flatMap((group) => group.members);

  ensureNoDuplicates(entryIds, "entries");
  ensureNoDuplicates(groupIds, "confusion groups");
  ensureMembersExist(entryIds, allMembers);

  for (const group of confusionGroups) {
    if (!group.members.includes(group.teachFirst)) {
      throw new Error(
        `confusion group ${group.id} does not include teachFirst entry ${group.teachFirst}`,
      );
    }
  }

  return {
    entries,
    confusionGroups,
  };
}

export async function loadSeedContent() {
  const seedContent = await loadVocabContent();

  assertSeedContentRequirements(seedContent);

  return seedContent;
}
