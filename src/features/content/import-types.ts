export const examScopeCodes = ["gaokao", "cet4", "cet6", "postgrad"] as const;

export type ExamScopeCode = (typeof examScopeCodes)[number];

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
  members: string[];
  teachFirst: string;
  whyConfusing: string;
  commonMisusePoints?: string[];
  semanticBoundaryNotes?: string[];
  memberNotes?: Partial<Record<string, string>>;
};
