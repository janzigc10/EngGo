import type { NormalizedQuery, QueryMode } from "@/features/retrieval/types";
import { findRootFamilyPrototype } from "@/features/retrieval/root-family-prototypes";
import { hasRootFragmentRecallPattern } from "@/features/retrieval/root-fragment-recall";

const englishTokenPattern = /[a-z]+(?:[-'][a-z]+)*/gi;
const compareCuePattern =
  /(区别|差别|不同|怎么区分|怎么分|搞混|分不清|哪个|哪一个|还是|vs\.?|versus|\bor\b)/i;
const groupComparePattern =
  /([a-z]+(?:[-'][a-z]+)?)\s*(?:那组词|这一组词|这组词|这一组|这组).*(?:区别|差别|不同|怎么区分|怎么分)/i;
const groupMemoryPattern =
  /(?:跟|和)?\s*([a-z]+(?:[-'][a-z]+)?)\s*(?:一样|同根|一族|一类|那几个词|那组词|这一组词|这组词).*(?:怎么记|怎么背|怎么分|区分)/i;
const meaningNoisePattern = /(怎么说|什么意思|是什么|啥意思|英文|英语|单词|有个|像|的词)/g;
const shapeNeighborCuePattern =
  /(很像|形近|长得像|看错|看成|容易把|容易.*混|拼写.{0,4}(像|近|相似))/i;
const shapeNeighborListPattern = /(哪些|什么|哪几个|列举|举例|有什么)/i;
const rootCuePattern =
  /(词根|前缀|后缀|同根|这一族|家族|派生|构词|组合|开头|结尾|词首|词尾)/i;
const rootFragmentPattern = /[a-z]+\+[a-z]+|[a-z]+\.\.\.[a-z]+|-[a-z]+/i;
const exactFragmentQuestionPattern = /^([a-z]{4,10})\s*(?:是(什么|啥)|什么意思)$/i;
const standaloneRootFragments = new Set(["stitute"]);

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
  const match =
    normalizedText.match(groupComparePattern)
    ?? normalizedText.match(groupMemoryPattern);

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

function containsRootFamilyCue(normalizedText: string) {
  if (rootCuePattern.test(normalizedText) || rootFragmentPattern.test(normalizedText)) {
    return true;
  }

  if (hasRootFragmentRecallPattern(normalizedText)) {
    return true;
  }

  const fragmentQuestionMatch = normalizedText.match(exactFragmentQuestionPattern);

  if (!fragmentQuestionMatch) {
    return false;
  }

  return standaloneRootFragments.has(fragmentQuestionMatch[1].toLowerCase());
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
  const hasKnownRootFamilyPrototype = findRootFamilyPrototype(normalizedText) !== null;

  let queryMode: QueryMode = "meaning_lookup";

  if (englishTerms.length > 0 && hasKnownRootFamilyPrototype) {
    queryMode = "root_family_summary";
  } else if (groupSeedTerm || compareTerms.length >= 2) {
    queryMode = "direct_compare";
  } else if (englishTerms.length === 1 && containsShapeNeighborCue(normalizedText)) {
    queryMode = "shape_neighbor_search";
  } else if (englishTerms.length > 0 && containsRootFamilyCue(normalizedText)) {
    queryMode = "root_family_summary";
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
