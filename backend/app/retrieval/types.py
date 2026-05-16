from dataclasses import dataclass


part_of_speech_aliases = {
    "noun": "n.",
    "n": "n.",
    "n.": "n.",
    "verb": "v.",
    "v": "v.",
    "v.": "v.",
    "vt": "vt.",
    "vt.": "vt.",
    "vi": "vi.",
    "vi.": "vi.",
    "adjective": "adj.",
    "adj": "adj.",
    "adj.": "adj.",
    "a": "adj.",
    "a.": "adj.",
    "adverb": "adv.",
    "adv": "adv.",
    "adv.": "adv.",
    "ad": "adv.",
    "ad.": "adv.",
    "preposition": "prep.",
    "prep": "prep.",
    "prep.": "prep.",
    "conjunction": "conj.",
    "conj": "conj.",
    "conj.": "conj.",
    "pronoun": "pron.",
    "pron": "pron.",
    "pron.": "pron.",
    "numeral": "num.",
    "number": "num.",
    "num": "num.",
    "num.": "num.",
    "article": "art.",
    "art": "art.",
    "art.": "art.",
    "interjection": "interj.",
    "interj": "interj.",
    "interj.": "interj.",
    "int": "interj.",
    "int.": "interj.",
    "phrase": "phr.",
    "phr": "phr.",
    "phr.": "phr.",
}


def normalize_part_of_speech_label(value: str | None) -> str | None:
    if not value:
        return None

    parts: list[str] = []
    seen: set[str] = set()
    normalized_value = (
        value.replace(",", "/")
        .replace(";", "/")
        .replace("；", "/")
    )
    for raw_part in normalized_value.split("/"):
        part = " ".join(raw_part.strip().lower().split())
        if not part:
            continue

        normalized = part_of_speech_aliases.get(part, raw_part.strip())
        if normalized in seen:
            continue

        seen.add(normalized)
        parts.append(normalized)

    return " / ".join(parts) if parts else None


ExamScopeCode = str
QueryMode = str
RetrievalResolution = str
NoMatchReason = str
RetrievalMatchType = str


@dataclass(frozen=True)
class RetrievalCandidate:
    entry_id: str
    lemma: str
    meanings_zh: list[str]
    matched_alias: str | None
    scope_codes: list[ExamScopeCode]
    in_scope: bool
    reason: str
    score: int
    part_of_speech: str | None = None
    source_kind: str | None = None
    exact_lemma: bool = False
    exact_alias: bool = False
    text_score: float = 0

    def to_json(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "entryId": self.entry_id,
            "lemma": self.lemma,
            "meaningsZh": self.meanings_zh,
            "matchedAlias": self.matched_alias,
            "scopeCodes": self.scope_codes,
            "inScope": self.in_scope,
            "reason": self.reason,
            "score": self.score,
        }

        if self.part_of_speech is not None:
            normalized_part_of_speech = normalize_part_of_speech_label(
                self.part_of_speech,
            )
            if normalized_part_of_speech:
                payload["partOfSpeech"] = normalized_part_of_speech

        if self.source_kind is not None:
            payload["sourceKind"] = self.source_kind

        return payload


@dataclass(frozen=True)
class ConfusionGroupMember:
    candidate: RetrievalCandidate
    ordinal: int
    emphasis_note: str | None

    @property
    def entry_id(self) -> str:
        return self.candidate.entry_id


@dataclass(frozen=True)
class ConfusionGroup:
    id: str
    teach_first_entry_id: str
    why_confusing: str
    common_misuse_points: list[str]
    semantic_boundary_notes: list[str]
    labels: list[str]
    purposes: list[str]
    anchor_pattern: str | None
    quick_distinction: str | None
    exam_hook: str | None
    members: list[ConfusionGroupMember]


@dataclass(frozen=True)
class RetrievalResult:
    query_mode: QueryMode
    normalized_query: object
    resolution: RetrievalResolution
    no_match_reason: NoMatchReason | None
    match_type: RetrievalMatchType | None
    candidates: list[RetrievalCandidate]
    main_answer: list[RetrievalCandidate]
    confusion_boundary: list[RetrievalCandidate]
    comparison_view: object | None = None
    root_family_view: object | None = None

    def to_json(self) -> dict[str, object]:
        normalized_query_json = (
            self.normalized_query.to_json()
            if hasattr(self.normalized_query, "to_json")
            else self.normalized_query
        )

        return {
            "queryMode": self.query_mode,
            "normalizedQuery": normalized_query_json,
            "resolution": self.resolution,
            "noMatchReason": self.no_match_reason,
            "matchType": self.match_type,
            "candidates": [candidate.to_json() for candidate in self.candidates],
            "mainAnswer": [candidate.to_json() for candidate in self.main_answer],
            "confusionBoundary": [
                candidate.to_json() for candidate in self.confusion_boundary
            ],
            "comparisonView": self.comparison_view,
            "rootFamilyView": self.root_family_view,
        }
