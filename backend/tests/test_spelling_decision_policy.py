from dataclasses import FrozenInstanceError, dataclass, replace

import pytest

from backend.app.retrieval.spelling_decision import (
    FROZEN_DEFAULT_SPELLING_DECISION_THRESHOLDS,
    SpellingDecisionPolicy,
    SpellingDecisionThresholds,
)


@dataclass(frozen=True)
class Candidate:
    lemma: str
    edit_distance: int
    in_active_exam_scope: bool = True
    scope_codes: tuple[str, ...] = ("cet4",)
    source_kind: str = "compact_wordbook"
    reason_codes: tuple[str, ...] = ()
    rank_key: tuple[int, int, str] = (0, 0, "")


@dataclass(frozen=True)
class Result:
    term: str
    status: str = "ready"
    input_is_known_word: bool = False
    global_competition_complete: bool = True
    candidates: tuple[Candidate, ...] = ()
    lexicon_version: str = "fixture-v1"


def candidate(lemma: str, distance: int, *, in_scope: bool = True) -> Candidate:
    return Candidate(
        lemma=lemma,
        edit_distance=distance,
        in_active_exam_scope=in_scope,
        scope_codes=("cet4",) if in_scope else (),
        source_kind="compact_wordbook" if in_scope else "ecdict",
        reason_codes=("active_exam_scope" if in_scope else "global_competitor",),
        rank_key=(distance, 0 if in_scope else 1, lemma),
    )


def policy(*, margin: int = 1, max_candidates: int = 3) -> SpellingDecisionPolicy:
    return SpellingDecisionPolicy(
        SpellingDecisionThresholds(
            auto_correct_max_distance=1,
            clarification_max_distance=2,
            min_distance_margin=margin,
            max_clarification_candidates=max_candidates,
        )
    )


def test_frozen_default_is_conservative_and_validates_injected_thresholds():
    assert FROZEN_DEFAULT_SPELLING_DECISION_THRESHOLDS == SpellingDecisionThresholds(
        auto_correct_max_distance=1,
        clarification_max_distance=2,
        min_distance_margin=1,
        max_clarification_candidates=3,
    )
    with pytest.raises(FrozenInstanceError):
        FROZEN_DEFAULT_SPELLING_DECISION_THRESHOLDS.auto_correct_max_distance = 2
    with pytest.raises(ValueError, match="between 1 and 3"):
        SpellingDecisionThresholds(max_clarification_candidates=4)


def test_single_high_confidence_candidate_auto_corrects_after_input_normalization():
    result = Result(term="reqeust", candidates=(candidate("request", 1),))

    decision = policy().decide("  REQEUST  ", result)

    assert decision.kind == "auto_correct"
    assert [item.lemma for item in decision.candidates] == ["request"]
    assert decision.reason_code == "high_confidence"


def test_distance_margin_controls_auto_correct_vs_clarification():
    result = Result(
        term="acess",
        candidates=(candidate("access", 1), candidate("across", 2)),
    )

    auto = policy(margin=1).decide("acess", result)
    cautious = policy(margin=2).decide("acess", result)

    assert auto.kind == "auto_correct"
    assert [item.lemma for item in auto.candidates] == ["access"]
    assert cautious.kind == "clarify_candidates"
    assert [item.lemma for item in cautious.candidates] == ["access", "across"]


def test_out_of_scope_top_candidate_cannot_auto_and_preserves_distance_order():
    result = Result(
        term="anlize",
        candidates=(
            candidate("alize", 1, in_scope=False),
            candidate("analyze", 2, in_scope=True),
        ),
    )

    decision = policy().decide("anlize", result)

    assert decision.kind == "clarify_candidates"
    assert [item.lemma for item in decision.candidates] == ["alize", "analyze"]
    assert decision.reason_code == "ambiguous_candidates"


def test_single_out_of_scope_candidate_degrades_to_safe_no_match():
    result = Result(
        term="viadcut",
        candidates=(candidate("viaduct", 1, in_scope=False),),
    )

    decision = policy().decide("viadcut", result)

    assert decision.kind == "no_reliable_candidate"
    assert decision.candidates == ()
    assert decision.reason_code == "no_reliable_candidate"


def test_in_scope_top_still_auto_corrects_when_global_runner_up_exists():
    result = Result(
        term="reqeust",
        candidates=(
            candidate("request", 1, in_scope=True),
            candidate("bequest", 2, in_scope=False),
        ),
    )

    decision = policy().decide("reqeust", result)

    assert decision.kind == "auto_correct"
    assert [item.lemma for item in decision.candidates] == ["request"]
    assert decision.reason_code == "high_confidence"


def test_tie_preserves_provider_order_deduplicates_and_caps_clarification_at_three():
    form = candidate("form", 1)
    farm = candidate("farm", 1)
    firm = candidate("firm", 1, in_scope=False)
    result = Result(
        term="frorm",
        candidates=(form, farm, replace(form), firm, candidate("foam", 2)),
    )

    decision = policy().decide("frorm", result)

    assert decision.kind == "clarify_candidates"
    assert [item.lemma for item in decision.candidates] == ["form", "farm", "firm"]
    assert decision.reason_code == "ambiguous_candidates"


@pytest.mark.parametrize(
    ("result", "expected_reason"),
    [
        (
            Result(
                term="request",
                input_is_known_word=True,
                candidates=(candidate("requesting", 1),),
            ),
            "valid_word",
        ),
        (
            Result(
                term="reqeust",
                status="candidate_source_unavailable",
                candidates=(candidate("request", 1),),
            ),
            "candidate_source_unavailable",
        ),
        (
            Result(
                term="reqeust",
                global_competition_complete=False,
                candidates=(candidate("request", 1),),
            ),
            "global_competition_incomplete",
        ),
    ],
)
def test_protected_states_never_auto_correct(result: Result, expected_reason: str):
    decision = policy().decide(result.term, result)

    assert decision.kind == "no_reliable_candidate"
    assert decision.candidates == ()
    assert decision.reason_code == expected_reason


def test_random_like_term_is_rejected_even_with_a_near_candidate():
    result = Result(term="xqzplm", candidates=(candidate("example", 2),))

    decision = policy().decide("xqzplm", result)

    assert decision.kind == "no_reliable_candidate"
    assert decision.candidates == ()
    assert decision.reason_code == "random_like"


def test_invalid_distance_order_is_safe_instead_of_silently_reordering_for_auto():
    result = Result(
        term="acess",
        candidates=(candidate("across", 2), candidate("access", 1)),
    )

    decision = policy().decide("acess", result)

    assert decision.kind == "no_reliable_candidate"
    assert decision.reason_code == "candidate_order_invalid"
