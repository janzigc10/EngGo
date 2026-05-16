from backend.app.answering.direct_compare import DirectCompareService
from backend.app.answering.provider import GenerateAnswerResult
from backend.app.retrieval.types import (
    ConfusionGroup,
    ConfusionGroupMember,
    RetrievalCandidate,
)


def candidate(lemma, *, in_scope=True):
    return RetrievalCandidate(
        entry_id=lemma,
        lemma=lemma,
        meanings_zh=[f"{lemma} meaning"],
        matched_alias=None,
        scope_codes=["cet6"],
        in_scope=in_scope,
        reason="structured exact match",
        score=100,
        part_of_speech="n.",
        source_kind="structured",
    )


class FakeRepository:
    def __init__(self, candidates, groups=None, in_scope_entries=None):
        self.candidates = candidates
        self.groups = groups or []
        self.in_scope_entries = in_scope_entries or []
        self.lookups = []
        self.group_entry_ids = None

    def find_exact_entry(self, active_exam_target, lookup):
        self.lookups.append((active_exam_target, lookup))
        return self.candidates.get(lookup)

    def find_confusion_groups_for_entry_ids(self, active_exam_target, entry_ids):
        assert active_exam_target in {"cet4", "cet6", "postgrad", "gaokao"}
        self.group_entry_ids = entry_ids
        return self.groups

    def find_in_scope_entries(self, _active_exam_target):
        return self.in_scope_entries


class FakeProvider:
    def __init__(self):
        self.calls = []

    def generate_answer(self, **kwargs):
        self.calls.append(kwargs)
        return GenerateAnswerResult(
            answer="provider compare answer",
            provider_request_id="provider_req_compare",
        )


def group(group_id, members, *, purposes=None):
    return ConfusionGroup(
        id=group_id,
        teach_first_entry_id=members[0].entry_id,
        why_confusing="same exam shape",
        common_misuse_points=["do not swap them"],
        semantic_boundary_notes=["each word keeps a different meaning"],
        labels=["shape_like", "exam_high_value"],
        purposes=purposes or ["confusion_untangle"],
        anchor_pattern="acc/ass/exc",
        quick_distinction="access is entry, assess is judge, excess is extra",
        exam_hook="pick by meaning first",
        members=[
            ConfusionGroupMember(
                candidate=member,
                ordinal=index,
                emphasis_note=f"{member.lemma} note",
            )
            for index, member in enumerate(members)
        ],
    )


def test_direct_compare_returns_comparison_grounding_without_provider():
    access = candidate("access")
    assess = candidate("assess")
    excess = candidate("excess")
    service = DirectCompareService(
        repository=FakeRepository(
            {
                "access": access,
                "assess": assess,
                "excess": excess,
            },
            [group("access-assess-excess", [access, assess, excess])],
        ),
    )

    result = service.answer(
        active_exam_target="cet6",
        query="access assess excess 怎么区分",
        request_id="req_compare",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.answerKind == "grounded"
    assert result.payload.providerRequestId is None
    assert grounding["queryMode"] == "direct_compare"
    assert grounding["answerStyle"] == "confusion_untangle"
    assert grounding["resolution"] == "resolved"
    assert grounding["matchType"] is None
    assert [item["lemma"] for item in grounding["mainAnswer"]] == [
        "access",
        "assess",
        "excess",
    ]
    assert grounding["confusionBoundary"] == []
    assert grounding["comparisonView"]["id"] == "access-assess-excess"
    assert grounding["comparisonView"]["members"][0]["emphasisNote"] == "access note"
    assert "access" in result.payload.answer
    assert "assess" in result.payload.answer
    assert "excess" in result.payload.answer


def test_direct_compare_uses_deterministic_short_answer_when_provider_available():
    access = candidate("access")
    assess = candidate("assess")
    provider = FakeProvider()
    service = DirectCompareService(
        repository=FakeRepository(
            {
                "access": access,
                "assess": assess,
            },
            [group("access-assess-excess", [access, assess])],
        ),
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="access assess 怎么区分",
        request_id="req_compare_provider",
        history=[{"role": "user", "content": "previous"}],
    )

    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert result.payload.answer == (
        "access n. access meaning\n"
        "assess n. assess meaning\n\n"
        "注意：access is entry, assess is judge, excess is extra"
    )
    assert "**" not in result.payload.answer
    assert "\n-" not in result.payload.answer


def test_direct_compare_adds_unasked_group_members_to_boundary():
    restrain = candidate("restrain")
    constrain = candidate("constrain")
    curb = candidate("curb")
    service = DirectCompareService(
        repository=FakeRepository(
            {
                "restrain": restrain,
                "constrain": constrain,
            },
            [
                group(
                    "restrain-constrain-curb",
                    [restrain, constrain, curb],
                    purposes=["expression_recall"],
                ),
            ],
        ),
    )

    result = service.answer(
        active_exam_target="cet6",
        query="restrain constrain 怎么区分",
        request_id="req_boundary",
    )

    grounding = result.payload.grounding

    assert [item["lemma"] for item in grounding["mainAnswer"]] == [
        "restrain",
        "constrain",
    ]
    assert [item["lemma"] for item in grounding["confusionBoundary"]] == ["curb"]
    assert grounding["comparisonView"]["id"] == "restrain-constrain-curb"
    assert grounding["answerStyle"] == "confusion_untangle"


def test_direct_compare_keeps_exact_resolved_terms_without_shared_group():
    institute = candidate("institute")
    establish = candidate("establish")
    service = DirectCompareService(
        repository=FakeRepository(
            {
                "institute": institute,
                "establish": establish,
            },
        ),
    )

    result = service.answer(
        active_exam_target="cet6",
        query="institute establish 怎么区分",
        request_id="req_no_group",
    )

    grounding = result.payload.grounding

    assert grounding["resolution"] == "resolved"
    assert [item["lemma"] for item in grounding["mainAnswer"]] == [
        "institute",
        "establish",
    ]
    assert grounding["confusionBoundary"] == []
    assert grounding["comparisonView"] is None


def test_direct_compare_no_match_when_less_than_two_terms_resolve():
    service = DirectCompareService(
        repository=FakeRepository(
            {
                "access": candidate("access"),
            },
        ),
    )

    result = service.answer(
        active_exam_target="cet6",
        query="access zzzzword 怎么区分",
        request_id="req_no_match",
    )

    assert result.status_code == 200
    assert result.payload.grounding["resolution"] == "no_match"
    assert result.payload.grounding["noMatchReason"] == "low_confidence"
    assert result.payload.grounding["mainAnswer"] == []


def test_direct_compare_dynamic_fallback_requires_two_explicit_terms():
    access = candidate("access")
    assess = candidate("assess")
    excess = candidate("excess")
    provider = FakeProvider()
    service = DirectCompareService(
        repository=FakeRepository(
            {
                "access": access,
            },
            in_scope_entries=[access, assess, excess],
        ),
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="access zzzzword 怎么区分",
        request_id="req_no_broad_for_missing_term",
    )

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert result.payload.grounding["resolution"] == "no_match"
    assert result.payload.grounding["mainAnswer"] == []


def test_direct_compare_can_use_dynamic_light_pool_when_exact_entries_are_missing():
    commend = candidate("commend")
    comment = candidate("comment")
    command = candidate("command")
    provider = FakeProvider()
    service = DirectCompareService(
        repository=FakeRepository(
            {},
            in_scope_entries=[
                commend,
                comment,
                command,
                candidate("contend"),
                candidate("content"),
            ],
        ),
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="commend comment command 怎么区分",
        request_id="req_compare_broad",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "direct_compare"
    assert grounding["broadQueryMode"] == "broad_vocab"
    assert grounding["answerStyle"] == "broad_vocab_summary"
    assert grounding["groundingStrength"] == "light"
    assert [item["lemma"] for item in grounding["lightCandidates"][:3]] == [
        "commend",
        "comment",
        "command",
    ]
    assert result.payload.answer.splitlines()[:3] == [
        "commend n. commend meaning",
        "comment n. comment meaning",
        "command n. command meaning",
    ]
    assert "contend" not in result.payload.answer
    assert "content" not in result.payload.answer
    assert "\n-" not in result.payload.answer
