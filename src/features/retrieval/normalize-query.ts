import type { NormalizedQuery, QueryMode } from "@/features/retrieval/types";

const englishTokenPattern = /[a-z]+(?:[-'][a-z]+)*/gi;
const comparisonPattern =
  /([a-z]+(?:[-'][a-z]+)?)\s*(?:和|跟|与|vs\.?|versus)\s*([a-z]+(?:[-'][a-z]+)?)(?:\s*的?(?:区别|差别|不同))?/i;
const meaningNoisePattern = /(怎么说|什么意思|是什么|啥意思|英文|英语|单词|有个|像|的词)/g;

function normalizeAscii(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function extractEnglishTerms(normalizedText: string) {
  return normalizedText.match(englishTokenPattern) ?? [];
}

function extractComparisonTerms(normalizedText: string): [string, string] | null {
  const match = normalizedText.match(comparisonPattern);

  if (!match) {
    return null;
  }

  return [match[1].toLowerCase(), match[2].toLowerCase()];
}

function hasChinese(text: string) {
  return /[\u3400-\u9fff]/.test(text);
}

export function analyzeQuery(query: string): {
  normalizedText: string;
  englishTerms: string[];
  compareTerms: [string, string] | null;
  queryMode: QueryMode;
} {
  const normalizedText = normalizeAscii(query);
  const compareTerms = extractComparisonTerms(normalizedText);
  const englishTerms = extractEnglishTerms(normalizedText);
  const containsChinese = hasChinese(normalizedText);

  let queryMode: QueryMode = "meaning_lookup";

  if (compareTerms) {
    queryMode = "direct_compare";
  } else if (englishTerms.length > 0 && !containsChinese) {
    queryMode = "direct_lookup";
  } else if (englishTerms.length > 0) {
    queryMode = "fuzzy_recall";
  }

  return {
    normalizedText,
    englishTerms,
    compareTerms,
    queryMode,
  };
}

function buildMeaningHint(normalizedText: string) {
  return normalizedText.replace(meaningNoisePattern, "").replace(/\s+/g, " ").trim();
}

export function normalizeQuery(query: string): NormalizedQuery {
  const { normalizedText, englishTerms, compareTerms, queryMode } = analyzeQuery(query);

  return {
    raw: query,
    normalizedText,
    queryMode,
    englishTerms,
    compareTerms,
    meaningHint: buildMeaningHint(normalizedText),
  };
}
