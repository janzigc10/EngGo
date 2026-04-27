import type { RootFamilyView } from "@/features/retrieval/types";

const partOfSpeechLabels: Record<string, string> = {
  adjective: "adj.",
  adverb: "adv.",
  conjunction: "conj.",
  noun: "n.",
  preposition: "prep.",
  verb: "v.",
};

export type RootFragmentConstraint =
  | { type: "prefix"; value: string }
  | { type: "suffix"; value: string }
  | { type: "contains"; value: string }
  | { type: "start_end"; prefix: string; suffix: string }
  | { type: "ordered_contains"; parts: string[] };

export type RootFragmentQuery = {
  id: string;
  fragment: string;
  constraints: RootFragmentConstraint[];
};

export type RootFragmentRecallPattern = RootFragmentQuery;

export type RootFragmentEntry = {
  entryId: string;
  lemma: string;
  partOfSpeech: string;
  meaningsZh: string[];
  inScope: boolean;
};

export function formatPartOfSpeech(pos: string[]) {
  const labels = pos
    .map((item) => partOfSpeechLabels[item.trim().toLowerCase()] ?? item.trim())
    .filter(Boolean);

  return [...new Set(labels)].join(" / ") || "-";
}

function normalizeFragmentId(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function describeConstraintForId(constraint: RootFragmentConstraint) {
  if (constraint.type === "start_end") {
    return `pattern-${constraint.prefix}-${constraint.suffix}`;
  }

  if (constraint.type === "ordered_contains") {
    return `ordered-${constraint.parts.join("-")}`;
  }

  return `${constraint.type}-${constraint.value}`;
}

function buildQueryId(constraints: RootFragmentConstraint[]) {
  return `fragment-${constraints.map(describeConstraintForId).join("-")}`;
}

function formatConstraintFragment(constraint: RootFragmentConstraint) {
  if (constraint.type === "prefix") {
    return `${constraint.value}-`;
  }

  if (constraint.type === "suffix") {
    return `-${constraint.value}`;
  }

  if (constraint.type === "start_end") {
    return `${constraint.prefix}...${constraint.suffix}`;
  }

  if (constraint.type === "ordered_contains") {
    return constraint.parts.join("+");
  }

  return constraint.value;
}

function buildQuery(constraints: RootFragmentConstraint[]): RootFragmentQuery {
  return {
    id: normalizeFragmentId(buildQueryId(constraints)),
    fragment: constraints.map(formatConstraintFragment).join(" + "),
    constraints,
  };
}

export function parseRootFragmentRecall(
  normalizedText: string,
): RootFragmentQuery | null {
  const text = normalizedText.toLowerCase();
  const rootTheoryCombo = /\b[a-z]{1,8}\+[a-z]{1,8}\b/i.test(text) && /词根/.test(text);

  if (rootTheoryCombo) {
    return null;
  }

  const startEndMatch = text.match(/\b([a-z]{1,8})\.\.\.([a-z]{1,8})\b/i);

  if (startEndMatch) {
    const prefix = startEndMatch[1].toLowerCase();
    const suffix = startEndMatch[2].toLowerCase();

    return buildQuery([{ type: "start_end", prefix, suffix }]);
  }

  const comboMatch = text.match(/\b([a-z]{1,8}(?:\+[a-z]{1,8})+)\b/i);

  if (comboMatch && /词形|这种词|这类词|包含|都有/.test(text)) {
    const parts = comboMatch[1].toLowerCase().split("+");

    return buildQuery([{ type: "ordered_contains", parts }]);
  }

  const constraints: RootFragmentConstraint[] = [];
  const prefixMatch = text.match(/\b([a-z]{2,8})\s*(?:开头|词首|前缀)/i);

  if (prefixMatch) {
    constraints.push({ type: "prefix", value: prefixMatch[1].toLowerCase() });
  }

  const suffixMatch = text.match(/\b([a-z]{2,8})\s*(?:结尾|词尾|后缀)/i);

  if (suffixMatch) {
    constraints.push({ type: "suffix", value: suffixMatch[1].toLowerCase() });
  }

  const explicitContainsMatch = text.match(/(?:有|含有|包含)\s*([a-z]{2,12})\s*(?:的词|这个片段|这个词形)?/i);

  if (explicitContainsMatch) {
    constraints.push({ type: "contains", value: explicitContainsMatch[1].toLowerCase() });
  }

  if (constraints.length > 0) {
    const relatedMatches = [...text.matchAll(/\b([a-z]{2,12})\s*相关(?:的词)?/gi)]
      .map((match) => match[1].toLowerCase())
      .filter((value) => !constraints.some((constraint) => (
        "value" in constraint && constraint.value === value
      )));

    for (const value of relatedMatches) {
      constraints.push({ type: "contains", value });
    }

    return buildQuery(constraints);
  }

  return null;
}

export function hasRootFragmentRecallPattern(normalizedText: string) {
  return parseRootFragmentRecall(normalizedText) !== null;
}

function lemmaMatchesConstraint(lemma: string, constraint: RootFragmentConstraint) {
  const normalizedLemma = lemma.toLowerCase();

  if (constraint.type === "prefix") {
    return normalizedLemma.startsWith(constraint.value);
  }

  if (constraint.type === "suffix") {
    return normalizedLemma.endsWith(constraint.value);
  }

  if (constraint.type === "contains") {
    return normalizedLemma.includes(constraint.value);
  }

  if (constraint.type === "start_end") {
    return (
      normalizedLemma.startsWith(constraint.prefix)
      && normalizedLemma.endsWith(constraint.suffix)
      && normalizedLemma.length > constraint.prefix.length + constraint.suffix.length
    );
  }

  let searchFrom = 0;

  for (const part of constraint.parts) {
    const partIndex = normalizedLemma.indexOf(part, searchFrom);

    if (partIndex === -1) {
      return false;
    }

    searchFrom = partIndex + part.length;
  }

  return true;
}

function lemmaMatchesConstraints(lemma: string, constraints: RootFragmentConstraint[]) {
  return constraints.every((constraint) => lemmaMatchesConstraint(lemma, constraint));
}

export function selectRootFragmentEntries(
  entries: RootFragmentEntry[],
  pattern: RootFragmentRecallPattern,
) {
  return entries
    .filter((entry) => entry.inScope && entry.meaningsZh.length > 0)
    .filter((entry) => lemmaMatchesConstraints(entry.lemma, pattern.constraints))
    .sort((left, right) => left.lemma.localeCompare(right.lemma));
}

export function buildRootFragmentView(
  pattern: RootFragmentRecallPattern,
  entries: RootFragmentEntry[],
): RootFamilyView {
  const prefixConstraint = pattern.constraints.find((constraint) => constraint.type === "prefix");

  return {
    id: pattern.id,
    fragment: pattern.fragment,
    coreImage: "按词形碎片召回",
    note: "这是按用户给出的词首、词尾或片段组合，从当前考试范围内做的保守召回。",
    caution: "只列当前词库里命中的词；候选过少时不硬凑规律。",
    members: entries.map((entry) => ({
      lemma: entry.lemma,
      partOfSpeech: entry.partOfSpeech,
      prefix: prefixConstraint ? `${prefixConstraint.value}-` : null,
      prefixDirection:
        prefixConstraint
          ? `词首片段 ${prefixConstraint.value}-`
          : `词形片段 ${pattern.fragment}`,
      actionStory: `命中 ${pattern.fragment} 这个词形线索`,
      modernMeaningZh: entry.meaningsZh.slice(0, 2).join("；"),
      priority: "recognize",
      entryId: entry.entryId,
      inScope: entry.inScope,
    })),
  };
}
