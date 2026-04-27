import type { RootFamilyView } from "@/features/retrieval/types";

const minFragmentMembers = 2;

export type RootFragmentRecallPattern =
  | {
      kind: "prefix";
      id: string;
      fragment: string;
      prefix: string;
    }
  | {
      kind: "start_end";
      id: string;
      fragment: string;
      prefix: string;
      suffix: string;
    }
  | {
      kind: "combo";
      id: string;
      fragment: string;
      parts: string[];
    };

export type RootFragmentEntry = {
  entryId: string;
  lemma: string;
  meaningsZh: string[];
  inScope: boolean;
};

function normalizeFragmentId(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function buildPatternId(kind: string, fragment: string) {
  return `fragment-${kind}-${normalizeFragmentId(fragment)}`;
}

export function parseRootFragmentRecall(
  normalizedText: string,
): RootFragmentRecallPattern | null {
  const startEndMatch = normalizedText.match(/\b([a-z]{1,8})\.\.\.([a-z]{1,8})\b/i);

  if (startEndMatch) {
    const prefix = startEndMatch[1].toLowerCase();
    const suffix = startEndMatch[2].toLowerCase();
    const fragment = `${prefix}...${suffix}`;

    return {
      kind: "start_end",
      id: buildPatternId("pattern", `${prefix}-${suffix}`),
      fragment,
      prefix,
      suffix,
    };
  }

  const comboMatch = normalizedText.match(/\b([a-z]{1,8}(?:\+[a-z]{1,8})+)\b/i);

  if (comboMatch) {
    const parts = comboMatch[1].toLowerCase().split("+");

    return {
      kind: "combo",
      id: buildPatternId("combo", parts.join("-")),
      fragment: parts.join("+"),
      parts,
    };
  }

  const prefixMatch = normalizedText.match(
    /\b([a-z]{2,8})\s*(?:开头|词首|前缀|相关的词|这类词|这种词)/i,
  );

  if (prefixMatch) {
    const prefix = prefixMatch[1].toLowerCase();

    return {
      kind: "prefix",
      id: buildPatternId("prefix", prefix),
      fragment: `${prefix}-`,
      prefix,
    };
  }

  return null;
}

export function hasRootFragmentRecallPattern(normalizedText: string) {
  return parseRootFragmentRecall(normalizedText) !== null;
}

function lemmaMatchesPattern(lemma: string, pattern: RootFragmentRecallPattern) {
  const normalizedLemma = lemma.toLowerCase();

  if (pattern.kind === "prefix") {
    return normalizedLemma.startsWith(pattern.prefix);
  }

  if (pattern.kind === "start_end") {
    return (
      normalizedLemma.startsWith(pattern.prefix)
      && normalizedLemma.endsWith(pattern.suffix)
      && normalizedLemma.length > pattern.prefix.length + pattern.suffix.length
    );
  }

  let searchFrom = 0;

  for (const part of pattern.parts) {
    const partIndex = normalizedLemma.indexOf(part, searchFrom);

    if (partIndex === -1) {
      return false;
    }

    searchFrom = partIndex + part.length;
  }

  return true;
}

export function selectRootFragmentEntries(
  entries: RootFragmentEntry[],
  pattern: RootFragmentRecallPattern,
) {
  const matches = entries
    .filter((entry) => entry.inScope && entry.meaningsZh.length > 0)
    .filter((entry) => lemmaMatchesPattern(entry.lemma, pattern))
    .sort((left, right) => left.lemma.localeCompare(right.lemma));

  if (matches.length < minFragmentMembers) {
    return [];
  }

  return matches;
}

export function buildRootFragmentView(
  pattern: RootFragmentRecallPattern,
  entries: RootFragmentEntry[],
): RootFamilyView {
  return {
    id: pattern.id,
    fragment: pattern.fragment,
    coreImage: "按词形碎片召回",
    note: "这是按用户给出的词首、词尾或片段组合，从当前考试范围内做的保守召回。",
    caution: "只列当前词库里命中的词；候选过少时不硬凑规律。",
    members: entries.map((entry) => ({
      lemma: entry.lemma,
      prefix: pattern.kind === "prefix" ? `${pattern.prefix}-` : null,
      prefixDirection:
        pattern.kind === "prefix"
          ? `词首片段 ${pattern.prefix}-`
          : `词形片段 ${pattern.fragment}`,
      actionStory: `命中 ${pattern.fragment} 这个词形线索`,
      modernMeaningZh: entry.meaningsZh.slice(0, 2).join("；"),
      priority: "recognize",
      entryId: entry.entryId,
      inScope: entry.inScope,
    })),
  };
}
