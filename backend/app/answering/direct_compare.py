from dataclasses import dataclass
from pathlib import Path

from backend.app.answering.broad_vocab import (
    build_broad_vocab_answer,
    build_broad_vocab_grounding,
)
from backend.app.answering.ordinary_lookup import (
    UnsupportedQueryMode,
    build_grounding,
    dictionary_candidate,
    build_no_match_answer,
)
from backend.app.retrieval.normalize_query import NormalizedQuery, normalize_query
from backend.app.retrieval.dynamic_light_grounding import (
    build_light_grounding_candidates,
    merge_dynamic_vocabulary,
    source_lemma_vocabulary,
)
from backend.app.retrieval.types import (
    ConfusionGroup,
    RetrievalCandidate,
    normalize_part_of_speech_label,
)
from backend.app.schemas.chat import ChatSuccessResponse


valid_confusion_labels = {
    "shape_like",
    "root_family",
    "prefix_family",
    "meaning_near",
    "collocation_boundary",
    "exam_high_value",
}
valid_confusion_purposes = {
    "confusion_untangle",
    "memory_map",
    "expression_recall",
}


@dataclass(frozen=True)
class DirectCompareResult:
    status_code: int
    payload: ChatSuccessResponse


def unique_candidates(candidates: list[RetrievalCandidate]) -> list[RetrievalCandidate]:
    seen: set[str] = set()
    result: list[RetrievalCandidate] = []

    for candidate in candidates:
        if candidate.entry_id in seen:
            continue

        seen.add(candidate.entry_id)
        result.append(candidate)

    return result


def build_comparison_view(group: ConfusionGroup) -> dict[str, object]:
    return {
        "id": group.id,
        "whyConfusing": group.why_confusing,
        "commonMisusePoints": group.common_misuse_points,
        "semanticBoundaryNotes": group.semantic_boundary_notes,
        "labels": [
            label for label in group.labels if label in valid_confusion_labels
        ],
        "purposes": [
            purpose for purpose in group.purposes if purpose in valid_confusion_purposes
        ],
        "anchorPattern": group.anchor_pattern,
        "quickDistinction": group.quick_distinction,
        "examHook": group.exam_hook,
        "members": [
            {
                "entryId": member.candidate.entry_id,
                "lemma": member.candidate.lemma,
                "meaningsZh": member.candidate.meanings_zh,
                "emphasisNote": member.emphasis_note,
                "inScope": member.candidate.in_scope,
            }
            for member in group.members
        ],
    }


def pick_shared_group(
    active_exam_target: str,
    entry_ids: list[str],
    groups: list[ConfusionGroup],
) -> ConfusionGroup | None:
    candidate_groups = [
        group
        for group in groups
        if all(
            entry_id in {member.candidate.entry_id for member in group.members}
            for entry_id in entry_ids
        )
    ]

    def sort_key(group: ConfusionGroup):
        group_entry_ids = [member.candidate.entry_id for member in group.members]
        exact_member_count = 1 if len(group_entry_ids) == len(entry_ids) else 0
        teach_first = 1 if group.teach_first_entry_id in entry_ids else 0
        in_scope_count = sum(1 for member in group.members if member.candidate.in_scope)
        ordinal_sum = sum(
            next(
                (
                    member.ordinal
                    for member in group.members
                    if member.candidate.entry_id == entry_id
                ),
                100,
            )
            for entry_id in entry_ids
        )

        return (
            -exact_member_count,
            -teach_first,
            -in_scope_count if active_exam_target else 0,
            ordinal_sum,
            group.id,
        )

    return sorted(candidate_groups, key=sort_key)[0] if candidate_groups else None


def build_boundary_candidates(
    group: ConfusionGroup,
    excluded_entry_ids: set[str],
) -> list[RetrievalCandidate]:
    return unique_candidates(
        [
            member.candidate
            for member in group.members
            if member.candidate.entry_id not in excluded_entry_ids
        ],
    )


def build_direct_compare_answer(
    main_answer: list[RetrievalCandidate],
    confusion_boundary: list[RetrievalCandidate],
    comparison_view: dict[str, object] | None,
) -> str:
    candidates = [*main_answer, *confusion_boundary]
    lines: list[str] = []

    for candidate in candidates:
        meaning = "；".join(candidate.meanings_zh[:2])
        part_of_speech = normalize_part_of_speech_label(candidate.part_of_speech)
        lines.append(
            f"{candidate.lemma} {part_of_speech} {meaning}".strip()
            if part_of_speech
            else f"{candidate.lemma} {meaning}".strip(),
        )

    quick_distinction = comparison_view.get("quickDistinction") if comparison_view else None
    if isinstance(quick_distinction, str) and quick_distinction.strip():
        lines.extend(["", f"注意：{quick_distinction.strip()}"])

    return "\n".join(lines)


def covered_exact_compare_terms(candidates, compare_terms: list[str]) -> set[str]:
    compare_term_set = {term.lower() for term in compare_terms}
    return {
        signal.detail.lower()
        for candidate in candidates
        for signal in candidate.signals
        if signal.type == "exact" and signal.detail.lower() in compare_term_set
    }


class DirectCompareService:
    def __init__(
        self,
        *,
        repository,
        provider=None,
        source_lemma_base_dir: Path | str | None = None,
        ecdict_lookup=None,
    ):
        self.repository = repository
        self.provider = provider
        self.source_lemma_base_dir = Path(source_lemma_base_dir) if source_lemma_base_dir else None
        self.ecdict_lookup = ecdict_lookup

    def answer(
        self,
        *,
        active_exam_target: str,
        query: str,
        request_id: str,
        history: list[dict[str, str]] | None = None,
    ) -> DirectCompareResult:
        normalized_query = normalize_query(query)

        if normalized_query.query_mode != "direct_compare":
            raise UnsupportedQueryMode(normalized_query.query_mode)

        compare_terms = normalized_query.compare_terms[:4]

        if len(compare_terms) < 2:
            return self.no_match(
                active_exam_target=active_exam_target,
                query=query,
                request_id=request_id,
                normalized_query=normalized_query,
                no_match_reason="low_confidence",
                candidates=[],
            )

        candidates = []
        for term in compare_terms:
            entry = self.repository.find_exact_entry(active_exam_target, term)
            if entry and entry.in_scope:
                candidates.append(entry)
            elif self.ecdict_lookup:
                profile = self.ecdict_lookup(term)
                if profile:
                    candidates.append(
                        dictionary_candidate(
                            profile,
                            active_exam_target=active_exam_target,
                        ),
                    )
        ranked_candidates = unique_candidates(candidates)

        if len(ranked_candidates) < 2:
            broad_result = self.answer_broad_vocab_if_possible(
                active_exam_target=active_exam_target,
                query=query,
                request_id=request_id,
                history=history or [],
                normalized_query=normalized_query,
            )
            if broad_result:
                return broad_result

            return self.no_match(
                active_exam_target=active_exam_target,
                query=query,
                request_id=request_id,
                normalized_query=normalized_query,
                no_match_reason="low_confidence",
                candidates=ranked_candidates,
            )

        entry_ids = [candidate.entry_id for candidate in ranked_candidates]
        groups = self.repository.find_confusion_groups_for_entry_ids(
            active_exam_target,
            entry_ids,
        )
        shared_group = pick_shared_group(active_exam_target, entry_ids, groups)

        comparison_view = build_comparison_view(shared_group) if shared_group else None
        confusion_boundary = (
            build_boundary_candidates(shared_group, set(entry_ids))
            if shared_group
            else []
        )
        grounding = build_grounding(
            active_exam_target=active_exam_target,
            query=query,
            normalized_query=normalized_query,
            resolution="resolved",
            no_match_reason=None,
            match_type=None,
            main_answer=ranked_candidates,
            confusion_boundary=confusion_boundary,
            comparison_view=comparison_view,
            candidates=ranked_candidates,
        )
        if normalized_query.intent_plan is not None:
            grounding["learningIntentPlan"] = normalized_query.intent_plan.to_json()

        return DirectCompareResult(
            status_code=200,
            payload=ChatSuccessResponse(
                answer=build_direct_compare_answer(
                    ranked_candidates,
                    confusion_boundary,
                    comparison_view,
                ),
                answerKind="grounded",
                grounding=grounding,
                requestId=request_id,
                providerRequestId=None,
            ),
        )

    def dynamic_vocabulary(self, active_exam_target: str) -> list[RetrievalCandidate]:
        structured = (
            self.repository.find_in_scope_entries(active_exam_target)
            if hasattr(self.repository, "find_in_scope_entries")
            else []
        )
        source = source_lemma_vocabulary(
            active_exam_target=active_exam_target,
            source_lemma_base_dir=self.source_lemma_base_dir,
            ecdict_lookup=self.ecdict_lookup,
        )

        return merge_dynamic_vocabulary(structured, source)

    def answer_broad_vocab_if_possible(
        self,
        *,
        active_exam_target: str,
        query: str,
        request_id: str,
        history: list[dict[str, str]],
        normalized_query: NormalizedQuery,
    ) -> DirectCompareResult | None:
        vocabulary = self.dynamic_vocabulary(active_exam_target)
        if not vocabulary:
            return None

        candidates = build_light_grounding_candidates(
            query=query,
            active_exam_target=active_exam_target,
            vocabulary=vocabulary,
            groups=[],
            intent_plan=normalized_query.intent_plan,
        )

        if len(candidates) < 2:
            return None

        if normalized_query.compare_terms and len(
            covered_exact_compare_terms(candidates, normalized_query.compare_terms),
        ) < 2:
            return None

        grounding = build_broad_vocab_grounding(
            active_exam_target=active_exam_target,
            query=query,
            normalized_query=normalized_query,
            candidates=candidates,
        )

        return DirectCompareResult(
            status_code=200,
            payload=ChatSuccessResponse(
                answer=build_broad_vocab_answer(candidates, normalized_query),
                answerKind="grounded",
                grounding=grounding,
                requestId=request_id,
                providerRequestId=None,
            ),
        )

    def no_match(
        self,
        *,
        active_exam_target: str,
        query: str,
        request_id: str,
        normalized_query: NormalizedQuery,
        no_match_reason: str,
        candidates: list[RetrievalCandidate],
    ) -> DirectCompareResult:
        grounding = build_grounding(
            active_exam_target=active_exam_target,
            query=query,
            normalized_query=normalized_query,
            resolution="no_match",
            no_match_reason=no_match_reason,
            match_type=None,
            main_answer=[],
            candidates=candidates,
        )

        return DirectCompareResult(
            status_code=200,
            payload=ChatSuccessResponse(
                answer=build_no_match_answer(),
                answerKind="grounded",
                grounding=grounding,
                requestId=request_id,
                providerRequestId=None,
            ),
        )
