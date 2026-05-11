import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ExamScopeCode } from "@/features/content/import-types";

type SourceLemmaExamScope = Exclude<ExamScopeCode, "postgrad">;
type SourceScope = "gaokao" | "cet4" | "cet6-extra";

export type SourceLemmaMembership = {
  lemma: string;
  scopeCode: SourceLemmaExamScope;
  sourceName: string;
  sourceScope: SourceScope;
};

export type LoadSourceLemmaMembershipsOptions = {
  baseDir?: string;
};

export type FindSourceLemmaMembershipOptions = LoadSourceLemmaMembershipsOptions & {
  lemma: string;
  activeExamTarget: ExamScopeCode;
};

const sourceMembershipCache = new Map<string, Promise<SourceLemmaMembership[]>>();
const explicitLookupAliases = new Map([
  ["according to", "accordingto"],
  ["ought to", "oughtto"],
  ["owing to", "owingto"],
]);

function getDefaultBaseDir() {
  return path.join(process.cwd(), "data", "exam-vocab");
}

function normalizeLemma(lemma: string) {
  return lemma.trim().toLowerCase();
}

function sourceLookupKeys(lemma: string) {
  const normalizedLemma = normalizeLemma(lemma).replace(/\s+/g, " ");
  const alias = explicitLookupAliases.get(normalizedLemma);

  return [...new Set([normalizedLemma, alias].filter(Boolean))];
}

function addMembership(
  memberships: SourceLemmaMembership[],
  membership: SourceLemmaMembership,
) {
  if (!membership.lemma) {
    return;
  }

  memberships.push(membership);
}

function readGaokaoMemberships(raw: string): SourceLemmaMembership[] {
  const sourceName = "gaokao-2020-lemmas.txt";
  const memberships: SourceLemmaMembership[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const lemma = normalizeLemma(line);

    addMembership(memberships, {
      lemma,
      scopeCode: "gaokao",
      sourceName,
      sourceScope: "gaokao",
    });
  }

  return memberships;
}

function readCetMemberships(raw: string): SourceLemmaMembership[] {
  const sourceName = "cet-2016-lemmas.tsv";
  const memberships: SourceLemmaMembership[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const [rawLemma, rawSourceScope] = line.split("\t");
    const lemma = normalizeLemma(rawLemma ?? "");
    const sourceScope = rawSourceScope?.trim() as SourceScope | undefined;

    if (!lemma || lemma === "lemma" || !sourceScope) {
      continue;
    }

    if (sourceScope === "cet4") {
      addMembership(memberships, {
        lemma,
        scopeCode: "cet4",
        sourceName,
        sourceScope,
      });
      addMembership(memberships, {
        lemma,
        scopeCode: "cet6",
        sourceName,
        sourceScope,
      });
      continue;
    }

    if (sourceScope === "cet6-extra") {
      addMembership(memberships, {
        lemma,
        scopeCode: "cet6",
        sourceName,
        sourceScope,
      });
    }
  }

  return memberships;
}

function uniqueMemberships(memberships: SourceLemmaMembership[]) {
  const seen = new Set<string>();

  return memberships.filter((membership) => {
    const key = [
      membership.lemma,
      membership.scopeCode,
      membership.sourceName,
      membership.sourceScope,
    ].join("\0");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export async function loadSourceLemmaMemberships({
  baseDir = getDefaultBaseDir(),
}: LoadSourceLemmaMembershipsOptions = {}) {
  const sourceDir = path.join(baseDir, "source-lemmas");
  const cacheKey = path.resolve(baseDir);
  const cached = sourceMembershipCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const loadPromise = Promise.all([
    readFile(path.join(sourceDir, "gaokao-2020-lemmas.txt"), "utf8"),
    readFile(path.join(sourceDir, "cet-2016-lemmas.tsv"), "utf8"),
  ]).then(([gaokaoRaw, cetRaw]) =>
    uniqueMemberships([
      ...readGaokaoMemberships(gaokaoRaw),
      ...readCetMemberships(cetRaw),
    ]),
  );

  sourceMembershipCache.set(cacheKey, loadPromise);

  return loadPromise;
}

export async function findSourceLemmaMembershipsForLemma({
  lemma,
  baseDir,
}: {
  lemma: string;
  baseDir?: string;
}) {
  const normalizedLemma = normalizeLemma(lemma);
  const memberships = await loadSourceLemmaMemberships({ baseDir });

  return memberships.filter((membership) => membership.lemma === normalizedLemma);
}

export async function findSourceLemmaMembershipsForLookup({
  lemma,
  baseDir,
}: {
  lemma: string;
  baseDir?: string;
}) {
  const lookupKeys = new Set(sourceLookupKeys(lemma));
  const memberships = await loadSourceLemmaMemberships({ baseDir });

  return memberships.filter((membership) => lookupKeys.has(membership.lemma));
}

export async function findSourceLemmaMembership({
  lemma,
  activeExamTarget,
  baseDir,
}: FindSourceLemmaMembershipOptions) {
  if (activeExamTarget === "postgrad") {
    return null;
  }

  const memberships = await findSourceLemmaMembershipsForLemma({ lemma, baseDir });

  return (
    memberships.find((membership) => membership.scopeCode === activeExamTarget)
    ?? null
  );
}
