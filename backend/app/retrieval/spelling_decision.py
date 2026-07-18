from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from backend.app.retrieval.spelling_candidates import (
        SpellingCandidate,
        SpellingCandidateResult,
    )


SpellingDecisionKind = Literal[
    "auto_correct",
    "clarify_candidates",
    "no_reliable_candidate",
]

_ascii_word_pattern = re.compile(r"^[a-z]+$")
_long_consonant_run_pattern = re.compile(r"[bcdfghjklmnpqrstvwxz]{5,}")
_vowel_pattern = re.compile(r"[aeiouy]")


@dataclass(frozen=True)
class SpellingDecisionThresholds:
    """Frozen policy knobs; calibration may replace the whole value object later."""

    auto_correct_max_distance: int = 1
    clarification_max_distance: int = 2
    min_distance_margin: int = 1
    max_clarification_candidates: int = 3

    def __post_init__(self) -> None:
        integer_fields = {
            "auto_correct_max_distance": self.auto_correct_max_distance,
            "clarification_max_distance": self.clarification_max_distance,
            "min_distance_margin": self.min_distance_margin,
            "max_clarification_candidates": self.max_clarification_candidates,
        }
        for field_name, value in integer_fields.items():
            if isinstance(value, bool) or not isinstance(value, int):
                raise TypeError(f"{field_name} must be an integer")

        if self.auto_correct_max_distance < 0:
            raise ValueError("auto_correct_max_distance must be non-negative")
        if self.clarification_max_distance < self.auto_correct_max_distance:
            raise ValueError(
                "clarification_max_distance must be greater than or equal to "
                "auto_correct_max_distance"
            )
        if self.min_distance_margin < 1:
            raise ValueError("min_distance_margin must be at least 1")
        if not 1 <= self.max_clarification_candidates <= 3:
            raise ValueError("max_clarification_candidates must be between 1 and 3")


FROZEN_DEFAULT_SPELLING_DECISION_THRESHOLDS = SpellingDecisionThresholds()


@dataclass(frozen=True)
class SpellingDecision:
    kind: SpellingDecisionKind
    candidates: tuple[SpellingCandidate, ...]
    reason_code: str


def _safe_decision(reason_code: str) -> SpellingDecision:
    return SpellingDecision(
        kind="no_reliable_candidate",
        candidates=(),
        reason_code=reason_code,
    )


def _normalize_term(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if not _ascii_word_pattern.fullmatch(normalized):
        return None
    return normalized


def _is_random_like(normalized_term: str) -> bool:
    # Keep the same conservative product boundary as the existing no-match policy,
    # without making retrieval depend on the answering layer.
    return len(normalized_term) >= 5 and (
        _long_consonant_run_pattern.search(normalized_term) is not None
        or _vowel_pattern.search(normalized_term) is None
    )


def _ordered_unique_candidates(
    candidates: object,
    *,
    normalized_term: str,
) -> tuple[SpellingCandidate, ...]:
    if not isinstance(candidates, (list, tuple)):
        return ()

    ordered: list[SpellingCandidate] = []
    seen_lemmas: set[str] = set()
    for candidate in candidates:
        lemma = _normalize_term(getattr(candidate, "lemma", None))
        distance = getattr(candidate, "edit_distance", None)
        if lemma is None or lemma == normalized_term or lemma in seen_lemmas:
            continue
        if isinstance(distance, bool) or not isinstance(distance, int) or distance < 0:
            continue
        seen_lemmas.add(lemma)
        ordered.append(candidate)
    return tuple(ordered)


def _distance_order_is_valid(candidates: tuple[SpellingCandidate, ...]) -> bool:
    return all(
        left.edit_distance <= right.edit_distance
        for left, right in zip(candidates, candidates[1:])
    )


class SpellingDecisionPolicy:
    """Turns local candidate evidence into a conservative product decision."""

    def __init__(
        self,
        thresholds: SpellingDecisionThresholds = FROZEN_DEFAULT_SPELLING_DECISION_THRESHOLDS,
    ) -> None:
        if not isinstance(thresholds, SpellingDecisionThresholds):
            raise TypeError("thresholds must be SpellingDecisionThresholds")
        self.thresholds = thresholds

    def decide(
        self,
        term: str,
        result: SpellingCandidateResult,
    ) -> SpellingDecision:
        normalized_term = _normalize_term(term)
        if normalized_term is None:
            return _safe_decision("invalid_term")

        result_term = _normalize_term(getattr(result, "term", None))
        if result_term != normalized_term:
            return _safe_decision("candidate_term_mismatch")

        if getattr(result, "input_is_known_word", False) is True:
            return _safe_decision("valid_word")

        status = getattr(result, "status", None)
        if status == "candidate_source_unavailable":
            return _safe_decision("candidate_source_unavailable")
        if status != "ready":
            return _safe_decision("candidate_source_not_ready")

        if getattr(result, "global_competition_complete", False) is not True:
            return _safe_decision("global_competition_incomplete")

        if _is_random_like(normalized_term):
            return _safe_decision("random_like")

        candidates = _ordered_unique_candidates(
            getattr(result, "candidates", ()),
            normalized_term=normalized_term,
        )
        if not candidates:
            return _safe_decision("no_reliable_candidate")
        if not _distance_order_is_valid(candidates):
            return _safe_decision("candidate_order_invalid")

        top_candidate = candidates[0]
        second_candidate = candidates[1] if len(candidates) > 1 else None
        distance_margin = (
            second_candidate.edit_distance - top_candidate.edit_distance
            if second_candidate is not None
            else None
        )
        can_auto_correct = (
            getattr(top_candidate, "in_active_exam_scope", False) is True
            and top_candidate.edit_distance
            <= self.thresholds.auto_correct_max_distance
            and (
                distance_margin is None
                or distance_margin >= self.thresholds.min_distance_margin
            )
        )
        if can_auto_correct:
            return SpellingDecision(
                kind="auto_correct",
                candidates=(top_candidate,),
                reason_code="high_confidence",
            )

        clarification_candidates = tuple(
            candidate
            for candidate in candidates
            if candidate.edit_distance <= self.thresholds.clarification_max_distance
        )[: self.thresholds.max_clarification_candidates]
        if len(clarification_candidates) >= 2:
            return SpellingDecision(
                kind="clarify_candidates",
                candidates=clarification_candidates,
                reason_code="ambiguous_candidates",
            )

        return _safe_decision("no_reliable_candidate")
