import { AnswerContent } from "@/components/chat/answer-content";
import type {
  AnswerGrounding,
  ChatGroundingCandidate,
  ChatMessage,
  ComparisonView,
  RootFamilyView,
} from "@/features/chat/types";

type AssistantAnswerProps = {
  message: ChatMessage;
};

const listLikeQueryModes = new Set<AnswerGrounding["queryMode"]>([
  "fuzzy_recall",
  "shape_neighbor_search",
  "root_family_summary",
]);

function normalizedLines(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasMarkdownTable(content: string) {
  const lines = normalizedLines(content);

  return lines.some((line, index) => (
    line.startsWith("|")
    && line.endsWith("|")
    && (lines[index + 1] ?? "").match(/^\|?\s*:?-{3,}:?/)
  ));
}

function stripLemmaPrefix(line: string, lemma: string) {
  const normalizedLemma = lemma.trim();

  if (!normalizedLemma) {
    return line;
  }

  const escapedLemma = normalizedLemma.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedLemma}\\b\\s*`, "i");

  return line.replace(pattern, "").trim();
}

function lookupAnswerLine(candidate: ChatGroundingCandidate, lines: string[]) {
  const lemma = candidate.lemma.trim().toLowerCase();

  return lines.find((line) => {
    const normalized = line.toLowerCase();

    return normalized === lemma || normalized.startsWith(`${lemma} `);
  });
}

function candidateMeaning(
  candidate: ChatGroundingCandidate,
  answerLines: string[],
) {
  const structuredMeaning = candidate.meaningsZh
    .map((meaning) => meaning.trim())
    .filter(Boolean)
    .join("；");

  if (structuredMeaning) {
    return structuredMeaning;
  }

  const answerLine = lookupAnswerLine(candidate, answerLines);

  if (answerLine) {
    return stripLemmaPrefix(answerLine, candidate.lemma);
  }

  return candidate.reason;
}

function singleLookupText(message: ChatMessage, candidate: ChatGroundingCandidate) {
  const lines = normalizedLines(message.content);
  const tail = lines
    .filter((line) => line.toLowerCase() !== candidate.lemma.toLowerCase())
    .join(" ");
  const structuredMeaning = candidateMeaning(candidate, lines);

  return tail || structuredMeaning;
}

function isSingleLookup(grounding: AnswerGrounding) {
  return (
    grounding.resolution === "resolved"
    && grounding.mainAnswer.length === 1
    && (
      grounding.queryMode === "direct_lookup"
      || grounding.queryMode === "meaning_lookup"
      || grounding.matchType === "source_lemma_exact"
      || grounding.matchType === "external_dictionary_exact"
    )
  );
}

function shouldRenderCandidateList(grounding: AnswerGrounding, content: string) {
  return (
    grounding.resolution === "resolved"
    && grounding.mainAnswer.length > 1
    && listLikeQueryModes.has(grounding.queryMode)
    && !hasMarkdownTable(content)
  );
}

function CandidateList({
  content,
  grounding,
}: {
  content: string;
  grounding: AnswerGrounding;
}) {
  const answerLines = normalizedLines(content);
  const count = grounding.mainAnswer.length;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#151515]">
          找到 {count} 个词
        </h3>
        <span className="text-xs font-medium text-[#8a5a10]">
          {grounding.activeExamTargetLabel}
        </span>
      </div>
      <div className="divide-y divide-[#eeeae0] border-y border-[#eeeae0]">
        {grounding.mainAnswer.map((candidate) => {
          const meaning = candidateMeaning(candidate, answerLines);

          return (
            <div
              key={candidate.entryId}
              className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-[#151515]">
                  {candidate.lemma}
                </p>
                {candidate.partOfSpeech ? (
                  <p className="mt-0.5 text-xs text-[#8f8f86]">
                    {candidate.partOfSpeech}
                  </p>
                ) : null}
              </div>
              <p className="min-w-0 break-words text-sm leading-6 text-[#4f4d48]">
                {meaning}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SingleLookup({
  candidate,
  message,
}: {
  candidate: ChatGroundingCandidate;
  message: ChatMessage;
}) {
  const body = singleLookupText(message, candidate);

  return (
    <div className="space-y-3">
      <h3 className="break-words text-base font-semibold text-[#151515]">
        {candidate.lemma}
      </h3>
      {body ? (
        <p className="break-words text-sm leading-7 text-[#2f2f2c]">
          {body}
        </p>
      ) : (
        <AnswerContent content={message.content} />
      )}
    </div>
  );
}

function ComparisonAnswer({ view }: { view: ComparisonView }) {
  return (
    <div className="space-y-4">
      {view.quickDistinction ? (
        <p className="rounded-xl bg-[#f8f6ef] px-3 py-2 text-sm font-medium leading-6 text-[#2f2f2c]">
          {view.quickDistinction}
        </p>
      ) : null}
      <div className="divide-y divide-[#eeeae0] border-y border-[#eeeae0]">
        {view.members.map((member) => (
          <div
            key={member.entryId}
            className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4"
          >
            <p className="break-words text-sm font-semibold text-[#151515]">
              {member.lemma}
            </p>
            <div className="space-y-1 text-sm leading-6 text-[#4f4d48]">
              {member.meaningsZh.length > 0 ? (
                <p>{member.meaningsZh.join("；")}</p>
              ) : null}
              {member.emphasisNote ? (
                <p className="text-[#6f6f68]">{member.emphasisNote}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RootFamilyAnswer({ view }: { view: RootFamilyView }) {
  return (
    <div className="space-y-4">
      {view.coreImage || view.note ? (
        <div className="space-y-1 rounded-xl bg-[#f8f6ef] px-3 py-2">
          {view.coreImage ? (
            <p className="text-sm font-semibold text-[#151515]">
              {view.coreImage}
            </p>
          ) : null}
          {view.note ? (
            <p className="text-sm leading-6 text-[#4f4d48]">{view.note}</p>
          ) : null}
        </div>
      ) : null}
      <div className="divide-y divide-[#eeeae0] border-y border-[#eeeae0]">
        {view.members.map((member) => (
          <div
            key={`${member.entryId ?? member.lemma}-${member.prefix ?? "root"}`}
            className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4"
          >
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-[#151515]">
                {member.lemma}
              </p>
              <p className="mt-0.5 text-xs text-[#8f8f86]">
                {member.partOfSpeech}
              </p>
            </div>
            <p className="break-words text-sm leading-6 text-[#4f4d48]">
              {member.modernMeaningZh}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StructuredAnswer({ message }: { message: ChatMessage }) {
  const grounding = message.grounding;

  if (!grounding || grounding.resolution !== "resolved") {
    return <AnswerContent content={message.content} />;
  }

  if (grounding.comparisonView) {
    return <ComparisonAnswer view={grounding.comparisonView} />;
  }

  if (grounding.rootFamilyView?.members.length) {
    return <RootFamilyAnswer view={grounding.rootFamilyView} />;
  }

  if (isSingleLookup(grounding)) {
    return (
      <SingleLookup
        candidate={grounding.mainAnswer[0]}
        message={message}
      />
    );
  }

  if (shouldRenderCandidateList(grounding, message.content)) {
    return (
      <CandidateList
        content={message.content}
        grounding={grounding}
      />
    );
  }

  return <AnswerContent content={message.content} />;
}

export function AssistantAnswer({ message }: AssistantAnswerProps) {
  return (
    <article className="mr-auto min-w-0 max-w-full sm:max-w-[94%]">
      <div className="rounded-2xl border border-[#e5e1d7] bg-white px-4 py-4 shadow-[0_12px_32px_rgba(21,21,21,0.05)] sm:px-5">
        <StructuredAnswer message={message} />
      </div>
    </article>
  );
}

export function AssistantLoadingAnswer() {
  return (
    <div
      aria-live="polite"
      className="mr-auto min-w-0 max-w-full rounded-2xl border border-[#e5e1d7] bg-white px-4 py-4 shadow-[0_12px_32px_rgba(21,21,21,0.05)] sm:max-w-[94%] sm:px-5"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-[#6f6f68]">
        <span>正在查词库</span>
        <span className="flex gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8f8f86]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8f8f86] [animation-delay:120ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8f8f86] [animation-delay:240ms]" />
        </span>
      </div>
      <div className="mt-4 space-y-2" aria-hidden="true">
        <div className="h-2.5 w-3/4 rounded-full bg-[#f1eee7]" />
        <div className="h-2.5 w-1/2 rounded-full bg-[#f1eee7]" />
      </div>
    </div>
  );
}
