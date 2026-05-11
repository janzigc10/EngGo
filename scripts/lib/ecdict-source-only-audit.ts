import type { ExamScopeCode } from "../../src/features/content/import-types";
import {
  cleanEcdictTranslation,
  parseEcdictCsv,
  type CleanEcdictTranslationResult,
  type EcdictRow,
} from "../../src/features/content/ecdict-csv";
import type { SourceLemmaMembership } from "../../src/features/content/source-lemma-sources";

export { cleanEcdictTranslation, parseEcdictCsv };
export type { CleanEcdictTranslationResult, EcdictRow };

type AuditScope = Exclude<ExamScopeCode, "postgrad">;
type AuditQuality = "direct_usable" | "cleaned_usable" | "noisy_or_empty" | "missing";

export type BuildEcdictSourceOnlyAuditOptions = {
  ecdictRows: EcdictRow[];
  sourceMemberships: SourceLemmaMembership[];
  structuredLemmas: string[];
  scopes: AuditScope[];
  sampleSize?: number;
};

export type EcdictAuditItem = {
  lemma: string;
  scopeCode: AuditScope;
  quality: AuditQuality;
  meanings: string[];
  droppedLines: string[];
  rawTranslation: string;
  pos: string;
  tag: string;
};

type QualityCounts = Record<AuditQuality, number>;

type ScopeSummary = {
  total: number;
  matched: number;
  missing: number;
  qualityCounts: QualityCounts;
};

export type EcdictSourceOnlyAudit = {
  summary: {
    totalCandidates: number;
    dictionaryRows: number;
    matched: number;
    missing: number;
    coverageRate: number;
    qualityCounts: QualityCounts;
    byScope: Record<AuditScope, ScopeSummary>;
  };
  samples: {
    directUsable: EcdictAuditItem[];
    cleanedUsable: EcdictAuditItem[];
    noisyOrEmpty: EcdictAuditItem[];
    missing: EcdictAuditItem[];
  };
};

const AUDIT_SCOPES: AuditScope[] = ["gaokao", "cet4", "cet6"];
const SCOPE_PRIORITY = new Map<AuditScope, number>(
  AUDIT_SCOPES.map((scope, index) => [scope, index]),
);

function emptyQualityCounts(): QualityCounts {
  return {
    direct_usable: 0,
    cleaned_usable: 0,
    noisy_or_empty: 0,
    missing: 0,
  };
}

function createEmptyScopeSummary(): ScopeSummary {
  return {
    total: 0,
    matched: 0,
    missing: 0,
    qualityCounts: emptyQualityCounts(),
  };
}

function normalizeLemma(lemma: string) {
  return lemma.trim().toLowerCase();
}

function isLookupFriendlyLemma(lemma: string) {
  return /^[a-z]{3,}$/.test(lemma);
}

function compareAuditCandidates(
  left: Pick<EcdictAuditItem, "lemma" | "scopeCode">,
  right: Pick<EcdictAuditItem, "lemma" | "scopeCode">,
) {
  return (
    left.lemma.localeCompare(right.lemma)
    || (SCOPE_PRIORITY.get(left.scopeCode) ?? 99)
      - (SCOPE_PRIORITY.get(right.scopeCode) ?? 99)
  );
}

function selectBestMembership(
  memberships: SourceLemmaMembership[],
  scopes: AuditScope[],
) {
  return memberships
    .filter((membership) => scopes.includes(membership.scopeCode as AuditScope))
    .sort(
      (left, right) =>
        (SCOPE_PRIORITY.get(left.scopeCode as AuditScope) ?? 99)
        - (SCOPE_PRIORITY.get(right.scopeCode as AuditScope) ?? 99),
    )[0] as SourceLemmaMembership | undefined;
}

function buildSourceOnlyCandidates({
  sourceMemberships,
  structuredLemmas,
  scopes,
}: Pick<
  BuildEcdictSourceOnlyAuditOptions,
  "sourceMemberships" | "structuredLemmas" | "scopes"
>) {
  const structuredLemmaSet = new Set(structuredLemmas.map(normalizeLemma));
  const membershipsByLemma = new Map<string, SourceLemmaMembership[]>();

  for (const membership of sourceMemberships) {
    const lemma = normalizeLemma(membership.lemma);

    if (!isLookupFriendlyLemma(lemma) || structuredLemmaSet.has(lemma)) {
      continue;
    }

    const current = membershipsByLemma.get(lemma) ?? [];

    current.push(membership);
    membershipsByLemma.set(lemma, current);
  }

  return [...membershipsByLemma.entries()]
    .map(([lemma, memberships]) => {
      const bestMembership = selectBestMembership(memberships, scopes);

      if (!bestMembership) {
        return null;
      }

      return {
        lemma,
        scopeCode: bestMembership.scopeCode as AuditScope,
      };
    })
    .filter((candidate): candidate is { lemma: string; scopeCode: AuditScope } =>
      Boolean(candidate)
    )
    .sort(compareAuditCandidates);
}

function classifyAuditItem(row: EcdictRow | undefined, cleanResult: CleanEcdictTranslationResult) {
  if (!row) {
    return "missing";
  }

  if (cleanResult.meanings.length === 0) {
    return "noisy_or_empty";
  }

  if (cleanResult.droppedLines.length > 0) {
    return "cleaned_usable";
  }

  return "direct_usable";
}

function pushSample(
  samples: EcdictSourceOnlyAudit["samples"],
  item: EcdictAuditItem,
  sampleSize: number,
) {
  const bucket = item.quality === "direct_usable"
    ? samples.directUsable
    : item.quality === "cleaned_usable"
      ? samples.cleanedUsable
      : item.quality === "noisy_or_empty"
        ? samples.noisyOrEmpty
        : samples.missing;

  if (bucket.length < sampleSize) {
    bucket.push(item);
  }
}

export function buildEcdictSourceOnlyAudit({
  ecdictRows,
  sourceMemberships,
  structuredLemmas,
  scopes,
  sampleSize = 12,
}: BuildEcdictSourceOnlyAuditOptions): EcdictSourceOnlyAudit {
  const dictionaryByWord = new Map(
    ecdictRows.map((row) => [normalizeLemma(row.word), row]),
  );
  const candidates = buildSourceOnlyCandidates({
    sourceMemberships,
    structuredLemmas,
    scopes,
  });
  const byScope = Object.fromEntries(
    AUDIT_SCOPES.map((scope) => [scope, createEmptyScopeSummary()]),
  ) as Record<AuditScope, ScopeSummary>;
  const qualityCounts = emptyQualityCounts();
  const samples: EcdictSourceOnlyAudit["samples"] = {
    directUsable: [],
    cleanedUsable: [],
    noisyOrEmpty: [],
    missing: [],
  };

  for (const candidate of candidates) {
    const row = dictionaryByWord.get(candidate.lemma);
    const cleanResult = row
      ? cleanEcdictTranslation(row.translation)
      : { meanings: [], droppedLines: [] };
    const quality = classifyAuditItem(row, cleanResult);
    const scopeSummary = byScope[candidate.scopeCode];

    qualityCounts[quality] += 1;
    scopeSummary.qualityCounts[quality] += 1;
    scopeSummary.total += 1;

    if (row) {
      scopeSummary.matched += 1;
    } else {
      scopeSummary.missing += 1;
    }

    pushSample(
      samples,
      {
        lemma: candidate.lemma,
        scopeCode: candidate.scopeCode,
        quality,
        meanings: cleanResult.meanings,
        droppedLines: cleanResult.droppedLines,
        rawTranslation: row?.translation ?? "",
        pos: row?.pos ?? "",
        tag: row?.tag ?? "",
      },
      sampleSize,
    );
  }

  const matched = candidates.length - qualityCounts.missing;

  return {
    summary: {
      totalCandidates: candidates.length,
      dictionaryRows: ecdictRows.length,
      matched,
      missing: qualityCounts.missing,
      coverageRate: candidates.length === 0 ? 0 : matched / candidates.length,
      qualityCounts,
      byScope,
    },
    samples,
  };
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSampleItems(items: EcdictAuditItem[]) {
  if (items.length === 0) {
    return "- none";
  }

  return items
    .map((item) => {
      const meanings = item.meanings.length > 0 ? item.meanings.join(" / ") : "(none)";
      const dropped = item.droppedLines.length > 0
        ? `; dropped=${item.droppedLines.join(" / ")}`
        : "";

      return `- ${item.lemma} [${item.scopeCode}]: ${meanings}${dropped}`;
    })
    .join("\n");
}

export function buildEcdictSourceOnlyAuditMarkdown({
  generatedAt,
  dictionaryPath,
  datasetName,
  audit,
}: {
  generatedAt: string;
  dictionaryPath: string;
  datasetName: string;
  audit: EcdictSourceOnlyAudit;
}) {
  return [
    "# ECDICT Source-Only Audit",
    "",
    `Generated: ${generatedAt}`,
    `Dataset: ${datasetName}`,
    `Dictionary: ${dictionaryPath}`,
    "",
    "## Summary",
    "",
    `- source-only candidates: ${audit.summary.totalCandidates}`,
    `- dictionary rows: ${audit.summary.dictionaryRows}`,
    `- matched: ${audit.summary.matched}`,
    `- missing: ${audit.summary.missing}`,
    `- coverage: ${formatPercent(audit.summary.coverageRate)}`,
    "",
    "## Quality Counts",
    "",
    `- direct_usable: ${audit.summary.qualityCounts.direct_usable}`,
    `- cleaned_usable: ${audit.summary.qualityCounts.cleaned_usable}`,
    `- noisy_or_empty: ${audit.summary.qualityCounts.noisy_or_empty}`,
    `- missing: ${audit.summary.qualityCounts.missing}`,
    "",
    "## Samples: Direct Usable",
    "",
    formatSampleItems(audit.samples.directUsable),
    "",
    "## Samples: Cleaned Usable",
    "",
    formatSampleItems(audit.samples.cleanedUsable),
    "",
    "## Samples: Noisy Or Empty",
    "",
    formatSampleItems(audit.samples.noisyOrEmpty),
    "",
    "## Samples: Missing",
    "",
    formatSampleItems(audit.samples.missing),
    "",
  ].join("\n");
}
