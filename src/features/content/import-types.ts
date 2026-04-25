export const examScopeCodes = ["gaokao", "cet4", "cet6", "postgrad"] as const;

export type ExamScopeCode = (typeof examScopeCodes)[number];

export const confusionClusterLabels = [
  "shape_like",
  "root_family",
  "prefix_family",
  "meaning_near",
  "collocation_boundary",
  "exam_high_value",
] as const;

export type ConfusionClusterLabel = (typeof confusionClusterLabels)[number];

export const confusionClusterPurposes = [
  "confusion_untangle",
  "memory_map",
  "expression_recall",
] as const;

export type ConfusionClusterPurpose = (typeof confusionClusterPurposes)[number];

export type VocabularySeedPayload = {
  id: string;
  lemma: string;
  aliases: string[];
  pos: string[];
  meaningsZh: string[];
  examScopes: ExamScopeCode[];
  examples: string[];
  collocations: string[];
};

export type ConfusionGroupSeedPayload = {
  id: string;
  labels: ConfusionClusterLabel[];
  purposes: ConfusionClusterPurpose[];
  anchorPattern?: string;
  members: string[];
  teachFirst: string;
  whyConfusing: string;
  quickDistinction?: string;
  examHook?: string;
  commonMisusePoints?: string[];
  semanticBoundaryNotes?: string[];
  memberNotes?: Partial<Record<string, string>>;
};
