export type EcdictRow = {
  word: string;
  phonetic: string;
  definition: string;
  translation: string;
  pos: string;
  collins: string;
  oxford: string;
  tag: string;
  bnc: string;
  frq: string;
  exchange: string;
  detail: string;
  audio: string;
};

export type CleanEcdictTranslationResult = {
  meanings: string[];
  droppedLines: string[];
};

const ECDICT_HEADERS: Array<keyof EcdictRow> = [
  "word",
  "phonetic",
  "definition",
  "translation",
  "pos",
  "collins",
  "oxford",
  "tag",
  "bnc",
  "frq",
  "exchange",
  "detail",
  "audio",
];

const DOMAIN_PREFIX_PATTERN = /^\[[^\]\s]{1,8}\]\s*/;

function normalizeDictionaryText(value: string) {
  return value.replace(/\\n/g, "\n").replace(/\r\n?/g, "\n");
}

function parseCsvRecords(raw: string) {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const nextChar = raw[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        field += "\"";
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(field);
      records.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  return records.filter((record) => record.some((value) => value.trim()));
}

function mapCsvRecord(record: string[]): EcdictRow {
  return Object.fromEntries(
    ECDICT_HEADERS.map((header, index) => [
      header,
      normalizeDictionaryText(record[index] ?? "").trim(),
    ]),
  ) as EcdictRow;
}

export function parseEcdictCsv(raw: string): EcdictRow[] {
  const records = parseCsvRecords(raw);
  const [, ...dataRows] = records;

  return dataRows
    .map(mapCsvRecord)
    .filter((row) => row.word.trim());
}

export function cleanEcdictTranslation(rawTranslation: string): CleanEcdictTranslationResult {
  const meanings: string[] = [];
  const droppedLines: string[] = [];
  const normalizedTranslation = normalizeDictionaryText(rawTranslation);

  for (const rawLine of normalizedTranslation.split("\n")) {
    const line = rawLine.trim().replace(/\s+/g, " ");

    if (!line) {
      continue;
    }

    if (DOMAIN_PREFIX_PATTERN.test(line)) {
      droppedLines.push(line);
      continue;
    }

    meanings.push(line);
  }

  return {
    meanings,
    droppedLines,
  };
}
