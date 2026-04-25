import { z } from "zod";

import {
  confusionClusterLabels,
  examScopeCodes,
} from "@/features/content/import-types";

const examScopeSchema = z.enum(examScopeCodes);
const confusionClusterLabelSchema = z.enum(confusionClusterLabels);

export const vocabularySeedPayloadSchema = z.object({
  id: z.string().min(1),
  lemma: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  pos: z.array(z.string().min(1)).min(1),
  meaningsZh: z.array(z.string().min(1)).min(1),
  examScopes: z.array(examScopeSchema).min(1),
  examples: z.array(z.string().min(1)).default([]),
  collocations: z.array(z.string().min(1)).default([]),
});

export const confusionGroupSeedPayloadSchema = z.object({
  id: z.string().min(1),
  labels: z.array(confusionClusterLabelSchema).default([]),
  anchorPattern: z.string().min(1).optional(),
  members: z.array(z.string().min(1)).min(2),
  teachFirst: z.string().min(1),
  whyConfusing: z.string().min(1),
  quickDistinction: z.string().min(1).optional(),
  examHook: z.string().min(1).optional(),
  commonMisusePoints: z.array(z.string().min(1)).default([]),
  semanticBoundaryNotes: z.array(z.string().min(1)).default([]),
  memberNotes: z.record(z.string(), z.string()).default({}),
});

export const vocabularySeedPayloadListSchema = z.array(vocabularySeedPayloadSchema);
export const confusionGroupSeedListSchema = z.array(confusionGroupSeedPayloadSchema);

export function buildVocabularySeedPayload(
  input: z.input<typeof vocabularySeedPayloadSchema>,
) {
  return vocabularySeedPayloadSchema.parse(input);
}

export function buildConfusionGroupSeedPayload(
  input: z.input<typeof confusionGroupSeedPayloadSchema>,
) {
  return confusionGroupSeedPayloadSchema.parse(input);
}
