from dataclasses import dataclass

from backend.app.answering.ordinary_lookup import (
    UnsupportedQueryMode,
    build_grounding,
    build_no_match_answer,
)
from backend.app.retrieval.normalize_query import NormalizedQuery, normalize_query
from backend.app.retrieval.types import (
    ConfusionGroup,
    RetrievalCandidate,
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
    lemmas = " / ".join(candidate.lemma for candidate in candidates)
    lines = [lemmas]

    quick_distinction = comparison_view.get("quickDistinction") if comparison_view else None
    if isinstance(quick_distinction, str) and quick_distinction.strip():
        lines.extend(["", quick_distinction.strip()])

    for candidate in candidates:
        meaning = "；".join(candidate.meanings_zh[:2])
        part_of_speech = f"{candidate.part_of_speech} " if candidate.part_of_speech else ""
        lines.append(f"- {candidate.lemma}: {part_of_speech}{meaning}".strip())

    return "\n".join(lines)


class DirectCompareService:
    def __init__(self, *, repository, provider=None):
        self.repository = repository
        self.provider = provider

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

        candidates = [
            self.repository.find_exact_entry(active_exam_target, term)
            for term in compare_terms
        ]
        ranked_candidates = unique_candidates(
            [candidate for candidate in candidates if candidate is not None],
        )

        if len(ranked_candidates) < 2:
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

        if self.provider:
            provider_result = self.provider.generate_answer(
                query=query,
                history=history or [],
                request_id=request_id,
                system_prompt=(
                    "你是 EngGo 的易混词辨析助手。请严格根据 grounding 回答，"
                    "先给核心区别，再给每个词的短边界。"
                ),
                grounding=grounding,
            )

            return DirectCompareResult(
                status_code=200,
                payload=ChatSuccessResponse(
                    answer=provider_result.answer,
                    answerKind="grounded",
                    grounding=grounding,
                    requestId=request_id,
                    providerRequestId=provider_result.provider_request_id,
                ),
            )

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
