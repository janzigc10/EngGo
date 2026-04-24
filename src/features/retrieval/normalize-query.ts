import type { NormalizedQuery, QueryMode } from "@/features/retrieval/types";

const englishTokenPattern = /[a-z]+(?:[-'][a-z]+)*/gi;
const compareCuePattern =
  /(区别|差别|不同|怎么区分|怎么分|搞混|分不清|哪个|哪一个|还是|vs\.?|versus|\bor\b)/i;
const groupComparePattern =
  /([a-z]+(?:[-'][a-z]+)?)\s*(?:那组词|这一组词|这组词|这一组|这组).*(?:区别|差别|不同|怎么区分|怎么分)/i;
const meaningNoisePattern = /(怎么说|什么意思|是什么|啥意思|英文|英语|单词|有个|像|的词)/g;
const shapeNeighborCuePattern =
  /(很像|形近|长得像|看错|看成|容易把|容易.*混|拼写.{0,4}(像|近|相似))/i;
const shapeNeighborListPattern = /(哪些|什么|哪几个|列举|举例|有什么)/i;

function normalizeAscii(text: string) {
  return text
    .trim()
    .replace(/[，、/]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function extractEnglishTerms(normalizedText: string) {
  return normalizedText.match(englishTokenPattern) ?? [];
}

function uniqueTerms(terms: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const term of terms) {
    if (seen.has(term)) {
      continue;
    }

    seen.add(term);
    result.push(term);
  }

  return result;
}

function containsCompareCue(normalizedText: string) {
  return compareCuePattern.test(normalizedText);
}

function extractComparisonTerms(normalizedText: string): string[] {
  if (!containsCompareCue(normalizedText)) {
    return [];
  }

  return uniqueTerms(extractEnglishTerms(normalizedText)).slice(0, 4);
}

function extractGroupSeedTerm(normalizedText: string) {
  const match = normalizedText.match(groupComparePattern);

  if (!match) {
    return null;
  }

  return match[1].toLowerCase();
}

function hasChinese(text: string) {
  return /[\u3400-\u9fff]/.test(text);
}

function containsShapeNeighborCue(normalizedText: string) {
  if (!shapeNeighborCuePattern.test(normalizedText)) {
    return false;
  }

  return shapeNeighborListPattern.test(normalizedText) || /(看错|看成|形近)/i.test(normalizedText);
}

export function analyzeQuery(query: string): {
  normalizedText: string;
  englishTerms: string[];
  compareTerms: string[];
  groupSeedTerm: string | null;
  queryMode: QueryMode;
} {
  const normalizedText = normalizeAscii(query);
  const compareTerms = extractComparisonTerms(normalizedText);
  const englishTerms = uniqueTerms(extractEnglishTerms(normalizedText));
  const groupSeedTerm = extractGroupSeedTerm(normalizedText);
  const containsChinese = hasChinese(normalizedText);

  let queryMode: QueryMode = "meaning_lookup";

  if (groupSeedTerm || compareTerms.length >= 2) {
    queryMode = "direct_compare";
  } else if (englishTerms.length === 1 && containsShapeNeighborCue(normalizedText)) {
    queryMode = "shape_neighbor_search";
  } else if (englishTerms.length > 0 && !containsChinese) {
    queryMode = "direct_lookup";
  } else if (englishTerms.length > 0) {
    queryMode = "fuzzy_recall";
  }

  return {
    normalizedText,
    englishTerms,
    compareTerms,
    groupSeedTerm,
    queryMode,
  };
}

function buildMeaningHint(normalizedText: string) {
  return normalizedText.replace(meaningNoisePattern, "").replace(/\s+/g, " ").trim();
}

export function normalizeQuery(query: string): NormalizedQuery {
  const { normalizedText, englishTerms, compareTerms, groupSeedTerm, queryMode } =
    analyzeQuery(query);

  return {
    raw: query,
    normalizedText,
    queryMode,
    englishTerms,
    compareTerms,
    groupSeedTerm,
    meaningHint: buildMeaningHint(normalizedText),
  };
}
