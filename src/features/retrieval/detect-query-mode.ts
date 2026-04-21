import { analyzeQuery } from "@/features/retrieval/normalize-query";

export function detectQueryMode(query: string) {
  return analyzeQuery(query).queryMode;
}
