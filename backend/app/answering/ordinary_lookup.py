import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from backend.app.content.ecdict import EcdictBasicProfile
from backend.app.content.source_lemmas import find_source_lemma_memberships_for_lookup
from backend.app.answering.no_match_policy import maybe_plain_no_match_response
from backend.app.retrieval.normalize_query import NormalizedQuery, normalize_query
from backend.app.retrieval.types import RetrievalCandidate
from backend.app.schemas.chat import ChatSuccessResponse


class UnsupportedQueryMode(Exception):
    def __init__(self, query_mode: str):
        super().__init__(f"FastAPI Stage 2 does not support query mode: {query_mode}")
        self.query_mode = query_mode


@dataclass(frozen=True)
class OrdinaryLookupResult:
    status_code: int
    payload: ChatSuccessResponse


exam_target_labels = {
    "gaokao": "高考",
    "cet4": "CET-4",
    "cet6": "CET-6",
    "postgrad": "考研",
}
dictionary_part_of_speech_pattern = re.compile(
    r"\b(n|v|vt|vi|adj|adv|a|ad|prep|conj|pron|phr)\.\s*",
    re.IGNORECASE,
)


def strip_answer_ending(value: str) -> str:
    return re.sub(r"[。！？.!?]+$", "", value.strip())


def normalize_meaning_list(value: str) -> str:
    normalized = strip_answer_ending(value)
    normalized = re.sub(r"\s*[,，;；]\s*", "；", normalized)
    normalized = re.sub(r"；+", "；", normalized)

    return normalized.strip("；").strip()


def normalize_part_of_speech_for_display(value: str) -> str:
    return (
        value.strip()
        .replace(" / ", "/")
        .replace(" /", "/")
        .replace("/ ", "/")
        .replace("ad.", "adv.")
        .replace("a.", "adj.")
    )


def split_dictionary_meaning_sections(value: str) -> list[tuple[str | None, str]]:
    matches = list(dictionary_part_of_speech_pattern.finditer(value))

    if not matches:
        return [(None, value)]

    sections: list[tuple[str | None, str]] = []
    for index, match in enumerate(matches):
        next_match = matches[index + 1] if index + 1 < len(matches) else None
        start = match.end()
        end = next_match.start() if next_match else len(value)
        sections.append((f"{match.group(1)}.", value[start:end]))

    return sections


def format_ordinary_lookup_block(lemma: str, lines: list[str]) -> str:
    return "\n".join([lemma, "", *[line for line in lines if line]])


def build_ecdict_basic_profile_answer(profile: EcdictBasicProfile) -> str:
    lines: list[str] = []

    for meaning in profile.meanings:
        for raw_part_of_speech, raw_meaning in split_dictionary_meaning_sections(meaning):
            normalized_meaning = normalize_meaning_list(raw_meaning)
            if not normalized_meaning:
                continue

            part_of_speech = (
                normalize_part_of_speech_for_display(raw_part_of_speech)
                if raw_part_of_speech
                else "phr."
                if profile.entry_kind == "phrase"
                else ""
            )
            lines.append(
                f"{part_of_speech} {normalized_meaning}".strip()
                if part_of_speech
                else normalized_meaning,
            )

    return format_ordinary_lookup_block(profile.canonical, lines)


def build_structured_standard_lookup_answer(candidate: RetrievalCandidate) -> str:
    part_of_speech = normalize_part_of_speech_for_display(candidate.part_of_speech or "")
    meaning = normalize_meaning_list("；".join(candidate.meanings_zh))
    line = f"{part_of_speech} {meaning}".strip() if part_of_speech else meaning

    return format_ordinary_lookup_block(candidate.lemma, [line])


def build_scope_reminder(
    active_exam_target: str,
    selected_candidates: list[RetrievalCandidate],
    resolution: str,
) -> str:
    active_exam_target_label = exam_target_labels[active_exam_target]

    if resolution == "no_match":
        return f"这次我会继续优先按 {active_exam_target_label} 范围帮你缩小候选，不随意扩到范围外。"

    if all(candidate.in_scope for candidate in selected_candidates):
        return f"这次回答已优先锁定在 {active_exam_target_label} 范围内，后续我也会继续按这个范围帮你筛词。"

    return f"这次先以 {active_exam_target_label} 范围内答案为主。"


def build_follow_up_prompt(
    resolution: str,
    main_answer: list[RetrievalCandidate],
    confusion_boundary: list[RetrievalCandidate],
) -> str:
    if resolution == "no_match":
        return "如果你愿意，可以再告诉我中文义项、词首或词尾，或者你容易和哪个词搞混。"

    word_group = [candidate.lemma for candidate in [*main_answer, *confusion_boundary]][:3]

    if not word_group:
        return "如果你愿意，我可以继续根据你的记忆线索帮你缩小候选范围。"

    return f"如果你愿意，我可以继续把 {' / '.join(word_group)} 的区别拆成一眼就能记住的规则。"


def derive_answer_style(
    query_mode: str,
    comparison_view: dict[str, object] | None,
) -> str:
    if query_mode == "root_family_summary":
        return "root_family_summary"

    if query_mode == "shape_neighbor_search":
        return "confusion_untangle"

    if comparison_view:
        purposes = comparison_view.get("purposes")
        if (
            query_mode == "meaning_lookup"
            and isinstance(purposes, list)
            and "expression_recall" in purposes
        ):
            return "expression_recall"

        return "confusion_untangle"

    return "standard_lookup"


def build_grounding(
    *,
    active_exam_target: str,
    query: str,
    normalized_query: NormalizedQuery,
    resolution: str,
    no_match_reason: str | None,
    match_type: str | None,
    main_answer: list[RetrievalCandidate],
    confusion_boundary: list[RetrievalCandidate] | None = None,
    comparison_view: dict[str, object] | None = None,
    root_family_view: dict[str, object] | None = None,
    candidates: list[RetrievalCandidate] | None = None,
) -> dict[str, object]:
    confusion_boundary = confusion_boundary or []
    selected_candidates = [*main_answer, *confusion_boundary]
    spelling_correction = None

    if (
        normalized_query.query_mode == "fuzzy_recall"
        and resolution == "resolved"
        and len(main_answer) == 1
        and len(set(normalized_query.english_terms)) == 1
    ):
        query_term = normalized_query.english_terms[0]
        lemma = main_answer[0].lemma.lower()

        if query_term != lemma:
            spelling_correction = {
                "input": query_term,
                "lemma": lemma,
            }

    return {
        "activeExamTarget": active_exam_target,
        "activeExamTargetLabel": exam_target_labels[active_exam_target],
        "query": query,
        "queryMode": normalized_query.query_mode,
        "answerStyle": derive_answer_style(normalized_query.query_mode, comparison_view),
        "resolution": resolution,
        "noMatchReason": no_match_reason,
        "matchType": match_type,
        "mainAnswer": [candidate.to_json() for candidate in main_answer],
        "confusionBoundary": [candidate.to_json() for candidate in confusion_boundary],
        "scopeReminder": build_scope_reminder(
            active_exam_target,
            selected_candidates,
            resolution,
        ),
        "followUpPrompt": build_follow_up_prompt(
            resolution,
            main_answer,
            confusion_boundary,
        ),
        "comparisonView": comparison_view,
        "rootFamilyView": root_family_view,
        "spellingCorrection": spelling_correction,
    }


def build_no_match_answer() -> str:
    return "当前词库暂未稳定定位到你说的词，为避免答错对象，这次先不硬猜。你可以再告诉我它的中文意思、词首或词尾，或者你容易把它和哪个词搞混。"


def build_spelling_correction_prompt() -> str:
    return (
        "你是 EngGo 的拼写纠错查词助手。请严格根据 grounding 回答。"
        "第一句必须说明用户可能想查的是 grounding.spellingCorrection.lemma，"
        "然后再解释主答案核心义。"
    )


def source_scope_codes(memberships) -> list[str]:
    order = ["gaokao", "cet4", "cet6", "postgrad"]
    scope_codes = {membership.scope_code for membership in memberships}

    return [scope_code for scope_code in order if scope_code in scope_codes]


def source_lemma_candidate(
    *,
    active_exam_target: str,
    lookup: str,
    source_lemma_base_dir: Path,
) -> RetrievalCandidate | None:
    if active_exam_target == "postgrad":
        return None

    memberships = find_source_lemma_memberships_for_lookup(
        lookup,
        base_dir=source_lemma_base_dir,
    )

    if not any(membership.scope_code == active_exam_target for membership in memberships):
        return None

    lemma = memberships[0].lemma if memberships else lookup.strip().lower()

    return RetrievalCandidate(
        entry_id=f"source-lemma:{lemma}",
        lemma=lemma,
        meanings_zh=[],
        matched_alias=None,
        scope_codes=source_scope_codes(memberships),
        in_scope=True,
        reason="source lemma exact match",
        score=18,
        source_kind="source_lemma",
    )


def lookup_needle(normalized_query: NormalizedQuery) -> str:
    if normalized_query.query_mode == "direct_lookup":
        return " ".join(normalized_query.english_terms).strip() or normalized_query.normalized_text

    return normalized_query.english_terms[0] if normalized_query.english_terms else normalized_query.normalized_text


def dictionary_candidate(profile: EcdictBasicProfile) -> RetrievalCandidate:
    return RetrievalCandidate(
        entry_id=f"external-dictionary-basic:{profile.canonical}",
        lemma=profile.canonical,
        meanings_zh=profile.meanings,
        matched_alias=profile.lookup_key if profile.match_kind == "joined_phrase_alias" else None,
        scope_codes=[],
        in_scope=True,
        reason="external dictionary basic exact match",
        score=12,
        source_kind="external_dictionary_basic",
    )


def should_use_ecdict_exact_fallback(normalized_query: NormalizedQuery) -> bool:
    if normalized_query.query_mode == "direct_lookup":
        return True

    return (
        normalized_query.query_mode == "fuzzy_recall"
        and len(normalized_query.english_terms) == 1
        and normalized_query.meaning_hint == normalized_query.english_terms[0]
    )


def select_stable_candidate(
    candidates: list[RetrievalCandidate],
    *,
    min_score: float,
    min_gap: float,
) -> tuple[RetrievalCandidate | None, str | None, str]:
    exact_candidate = next(
        (
            candidate
            for candidate in candidates
            if candidate.exact_lemma or candidate.exact_alias
        ),
        None,
    )

    if exact_candidate:
        return exact_candidate, "exact", "low_confidence"

    top_candidate = candidates[0] if candidates else None

    if not top_candidate:
        return None, None, "out_of_kb"

    competing_score = next(
        (
            candidate.text_score
            for candidate in candidates[1:]
            if candidate.entry_id != top_candidate.entry_id
        ),
        0,
    )

    if (
        top_candidate.text_score >= min_score
        and top_candidate.text_score - competing_score >= min_gap
    ):
        return top_candidate, "fuzzy", "low_confidence"

    no_match_reason = (
        "low_confidence"
        if top_candidate.text_score >= min_score
        else "out_of_kb"
    )

    return None, None, no_match_reason


def is_single_edit_typo(source: str, target: str) -> bool:
    left = source.lower()
    right = target.lower()

    if left == right or abs(len(left) - len(right)) > 1:
        return False

    left_index = 0
    right_index = 0
    edits = 0

    while left_index < len(left) and right_index < len(right):
        if left[left_index] == right[right_index]:
            left_index += 1
            right_index += 1
            continue

        edits += 1
        if edits > 1:
            return False

        if len(left) == len(right):
            left_index += 1
            right_index += 1
        elif len(left) < len(right):
            right_index += 1
        else:
            left_index += 1

    if left_index < len(left) or right_index < len(right):
        edits += 1

    return edits == 1


def is_adjacent_transposition_typo(source: str, target: str) -> bool:
    left = source.lower()
    right = target.lower()

    if left == right or len(left) != len(right):
        return False

    for index in range(len(left) - 1):
        if left[index] == right[index]:
            continue

        return (
            left[index] == right[index + 1]
            and left[index + 1] == right[index]
            and left[index + 2 :] == right[index + 2 :]
        )

    return False


def bounded_edit_distance(source: str, target: str, max_distance: int) -> int:
    if abs(len(source) - len(target)) > max_distance:
        return max_distance + 1

    previous_row = list(range(len(target) + 1))

    for left_index in range(1, len(source) + 1):
        current_row = [left_index]
        row_minimum = current_row[0]

        for right_index in range(1, len(target) + 1):
            substitution_cost = 0 if source[left_index - 1] == target[right_index - 1] else 1
            value = min(
                previous_row[right_index] + 1,
                current_row[right_index - 1] + 1,
                previous_row[right_index - 1] + substitution_cost,
            )
            current_row.append(value)
            row_minimum = min(row_minimum, value)

        if row_minimum > max_distance:
            return max_distance + 1

        previous_row = current_row

    return previous_row[len(target)]


def is_tight_two_edit_typo(source: str, target: str) -> bool:
    left = source.lower()
    right = target.lower()

    if (
        len(left) < 6
        or len(right) < 6
        or left[0] != right[0]
        or left[-1] != right[-1]
        or abs(len(left) - len(right)) > 2
    ):
        return False

    return bounded_edit_distance(left, right, 2) == 2


def is_typo_fallback_candidate(needle: str, candidate: RetrievalCandidate) -> bool:
    return (
        is_single_edit_typo(needle, candidate.lemma)
        or is_adjacent_transposition_typo(needle, candidate.lemma)
        or (
            candidate.text_score >= 0.5
            and is_tight_two_edit_typo(needle, candidate.lemma)
        )
    )


def select_typo_fallback_candidate(
    needle: str,
    candidates: list[RetrievalCandidate],
) -> RetrievalCandidate | None:
    typo_candidates = [
        candidate
        for candidate in candidates
        if candidate.in_scope and is_typo_fallback_candidate(needle, candidate)
    ]

    return typo_candidates[0] if len(typo_candidates) == 1 else None


class OrdinaryLookupService:
    def __init__(
        self,
        *,
        repository,
        source_lemma_base_dir: Path | str,
        ecdict_lookup: Callable[[str], EcdictBasicProfile | None],
        provider=None,
    ):
        self.repository = repository
        self.source_lemma_base_dir = Path(source_lemma_base_dir)
        self.ecdict_lookup = ecdict_lookup
        self.provider = provider

    def answer(
        self,
        *,
        active_exam_target: str,
        query: str,
        request_id: str,
        history: list[dict[str, str]] | None = None,
    ) -> OrdinaryLookupResult:
        normalized_query = normalize_query(query)

        if not normalized_query.is_supported_ordinary_lookup:
            raise UnsupportedQueryMode(normalized_query.query_mode)

        if normalized_query.query_mode == "fuzzy_recall" and len(normalized_query.english_terms) != 1:
            return self.no_match(
                active_exam_target=active_exam_target,
                query=query,
                request_id=request_id,
                normalized_query=normalized_query,
                history=history,
            )

        needle = lookup_needle(normalized_query)
        structured_candidate = self.repository.find_exact_entry(active_exam_target, needle)

        if structured_candidate:
            grounding = build_grounding(
                active_exam_target=active_exam_target,
                query=query,
                normalized_query=normalized_query,
                resolution="resolved",
                no_match_reason=None,
                match_type="exact",
                main_answer=[structured_candidate],
                candidates=[structured_candidate],
            )

            return OrdinaryLookupResult(
                status_code=200,
                payload=ChatSuccessResponse(
                    answer=build_structured_standard_lookup_answer(structured_candidate),
                    answerKind="grounded",
                    grounding=grounding,
                    requestId=request_id,
                    providerRequestId=None,
                ),
            )

        source_candidate = source_lemma_candidate(
            active_exam_target=active_exam_target,
            lookup=needle,
            source_lemma_base_dir=self.source_lemma_base_dir,
        )

        if source_candidate:
            profile = self.ecdict_lookup(needle) or self.ecdict_lookup(source_candidate.lemma)
            grounding = build_grounding(
                active_exam_target=active_exam_target,
                query=query,
                normalized_query=normalized_query,
                resolution="resolved",
                no_match_reason=None,
                match_type="source_lemma_exact",
                main_answer=[source_candidate],
                candidates=[source_candidate],
            )

            return OrdinaryLookupResult(
                status_code=200,
                payload=ChatSuccessResponse(
                    answer=(
                        build_ecdict_basic_profile_answer(profile)
                        if profile
                        else f"{source_candidate.lemma} 暂时没有人工结构化释义，这次先不展开。"
                    ),
                    answerKind="grounded",
                    grounding=grounding,
                    requestId=request_id,
                    providerRequestId=None,
                ),
            )

        if normalized_query.query_mode == "direct_lookup" and len(normalized_query.english_terms) > 1:
            profile = self.ecdict_lookup(needle)

            if profile and profile.entry_kind == "phrase":
                candidate = dictionary_candidate(profile)
                grounding = build_grounding(
                    active_exam_target=active_exam_target,
                    query=query,
                    normalized_query=normalized_query,
                    resolution="resolved",
                    no_match_reason=None,
                    match_type="external_dictionary_exact",
                    main_answer=[candidate],
                    candidates=[candidate],
                )

                return OrdinaryLookupResult(
                    status_code=200,
                    payload=ChatSuccessResponse(
                        answer=build_ecdict_basic_profile_answer(profile),
                        answerKind="grounded",
                        grounding=grounding,
                        requestId=request_id,
                        providerRequestId=None,
                    ),
                )

        if should_use_ecdict_exact_fallback(normalized_query):
            profile = self.ecdict_lookup(needle)

            if profile:
                candidate = dictionary_candidate(profile)
                grounding = build_grounding(
                    active_exam_target=active_exam_target,
                    query=query,
                    normalized_query=normalized_query,
                    resolution="resolved",
                    no_match_reason=None,
                    match_type="external_dictionary_exact",
                    main_answer=[candidate],
                    candidates=[candidate],
                )

                return OrdinaryLookupResult(
                    status_code=200,
                    payload=ChatSuccessResponse(
                        answer=build_ecdict_basic_profile_answer(profile),
                        answerKind="grounded",
                        grounding=grounding,
                        requestId=request_id,
                        providerRequestId=None,
                    ),
                )

        if hasattr(self.repository, "find_english_candidates"):
            ranked_candidates = self.repository.find_english_candidates(
                active_exam_target,
                needle,
            )
            selection, match_type, no_match_reason = select_stable_candidate(
                ranked_candidates,
                min_score=0.62 if normalized_query.query_mode == "direct_lookup" else 0.68,
                min_gap=0.08 if normalized_query.query_mode == "direct_lookup" else 0.12,
            )

            if not selection and normalized_query.query_mode == "fuzzy_recall":
                selection = select_typo_fallback_candidate(needle, ranked_candidates)
                match_type = None

            if selection:
                grounding = build_grounding(
                    active_exam_target=active_exam_target,
                    query=query,
                    normalized_query=normalized_query,
                    resolution="resolved",
                    no_match_reason=None,
                    match_type=match_type,
                    main_answer=[selection],
                    candidates=ranked_candidates,
                )

                if self.provider and grounding["spellingCorrection"]:
                    provider_result = self.provider.generate_answer(
                        query=query,
                        history=history or [],
                        request_id=request_id,
                        system_prompt=build_spelling_correction_prompt(),
                        grounding=grounding,
                    )

                    return OrdinaryLookupResult(
                        status_code=200,
                        payload=ChatSuccessResponse(
                            answer=provider_result.answer,
                            answerKind="grounded",
                            grounding=grounding,
                            requestId=request_id,
                            providerRequestId=provider_result.provider_request_id,
                        ),
                    )

                return OrdinaryLookupResult(
                    status_code=200,
                    payload=ChatSuccessResponse(
                        answer=build_structured_standard_lookup_answer(selection),
                        answerKind="grounded",
                        grounding=grounding,
                        requestId=request_id,
                        providerRequestId=None,
                    ),
                )

            return self.no_match(
                active_exam_target=active_exam_target,
                query=query,
                request_id=request_id,
                normalized_query=normalized_query,
                history=history,
                no_match_reason=no_match_reason,
                candidates=ranked_candidates,
            )

        return self.no_match(
            active_exam_target=active_exam_target,
            query=query,
            request_id=request_id,
            normalized_query=normalized_query,
            history=history,
        )

    def no_match(
        self,
        *,
        active_exam_target: str,
        query: str,
        request_id: str,
        normalized_query: NormalizedQuery,
        history: list[dict[str, str]] | None = None,
        no_match_reason: str = "out_of_kb",
        candidates: list[RetrievalCandidate] | None = None,
    ) -> OrdinaryLookupResult:
        if self.provider:
            plain_payload = maybe_plain_no_match_response(
                provider=self.provider,
                active_exam_target=active_exam_target,
                query=query,
                history=history or [],
                request_id=request_id,
                normalized_query=normalized_query,
                resolution="no_match",
                no_match_reason=no_match_reason,
            )

            if plain_payload:
                return OrdinaryLookupResult(
                    status_code=200,
                    payload=plain_payload,
                )

        grounding = build_grounding(
            active_exam_target=active_exam_target,
            query=query,
            normalized_query=normalized_query,
            resolution="no_match",
            no_match_reason=no_match_reason,
            match_type=None,
            main_answer=[],
            candidates=candidates or [],
        )

        return OrdinaryLookupResult(
            status_code=200,
            payload=ChatSuccessResponse(
                answer=build_no_match_answer(),
                answerKind="grounded",
                grounding=grounding,
                requestId=request_id,
                providerRequestId=None,
            ),
        )
