import type { WordbookEntry } from "@/features/wordbook/wordbook-types";

export type MeaningChoiceOption = {
  id: string;
  lemma: string;
  meaningZh: string;
  partOfSpeech?: string;
  isCorrect: boolean;
};

export type MeaningChoiceResult =
  | { kind: "ready"; options: MeaningChoiceOption[]; correctOptionId: string }
  | {
      kind: "blocked";
      reason: "missing_correct_meaning" | "insufficient_distractors";
    };

type BuildMeaningChoiceInput = {
  entry: WordbookEntry;
  allEntries: WordbookEntry[];
  seed: string;
};

function hashText(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededRank(seed: string, value: string) {
  return hashText(`${seed}:${value}`);
}

function getPrimaryMeaning(entry: WordbookEntry) {
  return entry.meaningsZh[0]?.trim() ?? "";
}

function getPrimaryPos(entry: WordbookEntry) {
  return entry.pos[0]?.trim();
}

function toOption(
  entry: WordbookEntry,
  meaningZh: string,
  isCorrect: boolean,
): MeaningChoiceOption {
  return {
    id: `${entry.id}:${isCorrect ? "correct" : "distractor"}`,
    lemma: entry.lemma,
    meaningZh,
    partOfSpeech: getPrimaryPos(entry),
    isCorrect,
  };
}

function shuffleOptions(options: MeaningChoiceOption[], seed: string) {
  return [...options].sort(
    (left, right) =>
      seededRank(seed, `${left.id}:${left.meaningZh}`) -
      seededRank(seed, `${right.id}:${right.meaningZh}`),
  );
}

export function buildMeaningChoice({
  entry,
  allEntries,
  seed,
}: BuildMeaningChoiceInput): MeaningChoiceResult {
  const correctMeaning = getPrimaryMeaning(entry);

  if (!correctMeaning) {
    return { kind: "blocked", reason: "missing_correct_meaning" };
  }

  const entryPos = getPrimaryPos(entry);
  const usedMeanings = new Set([correctMeaning]);
  const candidates = allEntries
    .filter((candidate) => candidate.lemma !== entry.lemma)
    .map((candidate) => ({
      entry: candidate,
      meaningZh: getPrimaryMeaning(candidate),
      samePos: Boolean(entryPos && getPrimaryPos(candidate) === entryPos),
    }))
    .filter((candidate) => candidate.meaningZh && !usedMeanings.has(candidate.meaningZh))
    .sort((left, right) => {
      if (left.samePos !== right.samePos) {
        return left.samePos ? -1 : 1;
      }

      const leftLengthGap = Math.abs(left.meaningZh.length - correctMeaning.length);
      const rightLengthGap = Math.abs(right.meaningZh.length - correctMeaning.length);

      if (leftLengthGap !== rightLengthGap) {
        return leftLengthGap - rightLengthGap;
      }

      return (
        seededRank(seed, `${left.entry.lemma}:${left.meaningZh}`) -
        seededRank(seed, `${right.entry.lemma}:${right.meaningZh}`)
      );
    });

  const distractors: MeaningChoiceOption[] = [];

  for (const candidate of candidates) {
    if (usedMeanings.has(candidate.meaningZh)) {
      continue;
    }

    usedMeanings.add(candidate.meaningZh);
    distractors.push(toOption(candidate.entry, candidate.meaningZh, false));

    if (distractors.length === 3) {
      break;
    }
  }

  if (distractors.length < 3) {
    return { kind: "blocked", reason: "insufficient_distractors" };
  }

  const correctOption = toOption(entry, correctMeaning, true);
  const options = shuffleOptions([correctOption, ...distractors], seed);

  return {
    kind: "ready",
    options,
    correctOptionId: correctOption.id,
  };
}
