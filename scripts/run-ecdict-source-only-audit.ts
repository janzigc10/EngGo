import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadSourceLemmaMemberships } from "../src/features/content/source-lemma-sources";
import {
  buildEcdictSourceOnlyAudit,
  buildEcdictSourceOnlyAuditMarkdown,
  parseEcdictCsv,
} from "./lib/ecdict-source-only-audit";

type AuditScope = "gaokao" | "cet4" | "cet6";

type AuditOptions = {
  datasetName: string;
  dictionaryPath: string;
  scopes: AuditScope[];
  sampleSize: number;
  outputDir: string;
  reportName: string | null;
};

type StructuredEntry = {
  lemma?: unknown;
};

const DEFAULT_OPTIONS: AuditOptions = {
  datasetName: "real-smoke",
  dictionaryPath: path.join("output", "external-dictionaries", "ecdict.csv"),
  scopes: ["gaokao", "cet4", "cet6"],
  sampleSize: 12,
  outputDir: path.join("output", "ecdict-source-only-audit"),
  reportName: null,
};

function parsePositiveIntegerOption(value: string | undefined, flagName: string) {
  const parsed = Number(value);

  if (!value || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer after ${flagName}.`);
  }

  return parsed;
}

function parseScopes(rawValue: string | undefined) {
  if (!rawValue) {
    throw new Error("Expected comma-separated scopes after --scopes.");
  }

  const scopes = rawValue
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  for (const scope of scopes) {
    if (scope !== "gaokao" && scope !== "cet4" && scope !== "cet6") {
      throw new Error(`Unsupported audit scope: ${scope}.`);
    }
  }

  return [...new Set(scopes)] as AuditScope[];
}

export function parseEcdictSourceOnlyAuditArgs(argv: string[]): AuditOptions {
  const options = { ...DEFAULT_OPTIONS };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextArg = argv[index + 1];

    if (arg === "--") {
      continue;
    }

    if (arg === "--dataset") {
      if (!nextArg) {
        throw new Error("Expected dataset name after --dataset.");
      }

      options.datasetName = nextArg;
      index += 1;
      continue;
    }

    if (arg === "--dictionary") {
      if (!nextArg) {
        throw new Error("Expected dictionary path after --dictionary.");
      }

      options.dictionaryPath = nextArg;
      index += 1;
      continue;
    }

    if (arg === "--scopes") {
      options.scopes = parseScopes(nextArg);
      index += 1;
      continue;
    }

    if (arg === "--sample-size") {
      options.sampleSize = parsePositiveIntegerOption(nextArg, "--sample-size");
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      if (!nextArg) {
        throw new Error("Expected output directory after --output-dir.");
      }

      options.outputDir = nextArg;
      index += 1;
      continue;
    }

    if (arg === "--report-name") {
      if (!nextArg) {
        throw new Error("Expected report name after --report-name.");
      }

      options.reportName = nextArg;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function loadStructuredLemmas(datasetName: string) {
  const entriesPath = path.join(
    process.cwd(),
    "data",
    "exam-vocab",
    datasetName,
    "entries.json",
  );
  const raw = await readFile(entriesPath, "utf8");
  const entries = JSON.parse(raw) as StructuredEntry[];

  return entries
    .map((entry) => (typeof entry.lemma === "string" ? entry.lemma : ""))
    .filter(Boolean);
}

function createReportBaseName(reportName: string | null) {
  if (reportName) {
    return reportName;
  }

  return `ecdict-source-only-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

async function writeReports({
  outputDir,
  baseName,
  json,
  markdown,
}: {
  outputDir: string;
  baseName: string;
  json: unknown;
  markdown: string;
}) {
  await mkdir(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, `${baseName}.json`);
  const markdownPath = path.join(outputDir, `${baseName}.md`);

  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(json, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, markdown, "utf8"),
  ]);

  return { jsonPath, markdownPath };
}

async function main() {
  const options = parseEcdictSourceOnlyAuditArgs(process.argv);
  const [dictionaryRaw, sourceMemberships, structuredLemmas] = await Promise.all([
    readFile(options.dictionaryPath, "utf8"),
    loadSourceLemmaMemberships(),
    loadStructuredLemmas(options.datasetName),
  ]);
  const generatedAt = new Date().toISOString();
  const ecdictRows = parseEcdictCsv(dictionaryRaw);
  const audit = buildEcdictSourceOnlyAudit({
    ecdictRows,
    sourceMemberships,
    structuredLemmas,
    scopes: options.scopes,
    sampleSize: options.sampleSize,
  });
  const report = {
    generatedAt,
    options,
    audit,
  };
  const markdown = buildEcdictSourceOnlyAuditMarkdown({
    generatedAt,
    dictionaryPath: options.dictionaryPath,
    datasetName: options.datasetName,
    audit,
  });
  const reportPaths = await writeReports({
    outputDir: options.outputDir,
    baseName: createReportBaseName(options.reportName),
    json: report,
    markdown,
  });

  console.log("=== ECDICT SOURCE-ONLY AUDIT SUMMARY ===");
  console.log(JSON.stringify(audit.summary, null, 2));
  console.log("\n=== ECDICT SOURCE-ONLY AUDIT REPORTS ===");
  console.log(JSON.stringify(reportPaths, null, 2));
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
