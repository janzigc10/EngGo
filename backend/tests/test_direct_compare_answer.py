from backend.app.answering.direct_compare import DirectCompareService
from backend.app.answering.provider import ChatProviderError, GenerateAnswerResult
from backend.app.content.ecdict import EcdictBasicProfile
from backend.app.retrieval.repository import StructuredLookupUnavailable
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
    def __init__(
        self,
        candidates,
        groups=None,
        in_scope_entries=None,
        exact_error=None,
        group_error=None,
        in_scope_error=None,
    ):
        self.candidates = candidates
        self.groups = groups or []
        self.in_scope_entries = in_scope_entries or []
        self.exact_error = exact_error
        self.group_error = group_error
        self.in_scope_error = in_scope_error
        self.lookups = []
        self.group_entry_ids = None

    def find_exact_entry(self, active_exam_target, lookup):
        self.lookups.append((active_exam_target, lookup))
        if self.exact_error:
            raise self.exact_error
        return self.candidates.get(lookup)

    def find_confusion_groups_for_entry_ids(self, active_exam_target, entry_ids):
        assert active_exam_target in {"cet4", "cet6", "postgrad", "gaokao"}
        if self.group_error:
            raise self.group_error
        self.group_entry_ids = entry_ids
        return self.groups

    def find_in_scope_entries(self, _active_exam_target):
        if self.in_scope_error:
            raise self.in_scope_error
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


class FailingProvider:
    def generate_answer(self, **_kwargs):
        raise ChatProviderError(
            "provider failed",
            status_code=502,
            provider_request_id="provider_req_failed",
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


def ecdict_profile(lemma: str, meanings: list[str]) -> EcdictBasicProfile:
    return EcdictBasicProfile(
        canonical=lemma,
        lookup_key=lemma,
        entry_kind="word",
        match_kind="exact",
        meanings=meanings,
        raw_translation="\n".join(meanings),
        tag="ky",
    )


def test_direct_compare_returns_grounding_without_provider_or_manual_group_dependency():
    access = candidate("access")
    assess = candidate("assess")
    excess = candidate("excess")
    repository = FakeRepository(
        {
            "access": access,
            "assess": assess,
            "excess": excess,
        },
        [group("access-assess-excess", [access, assess, excess])],
    )
    service = DirectCompareService(
        repository=repository,
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
    assert grounding["learningIntentPlan"]["task"] == "focused_compare"
    assert grounding["answerStyle"] == "confusion_untangle"
    assert grounding["resolution"] == "resolved"
    assert grounding["matchType"] is None
    assert [item["lemma"] for item in grounding["mainAnswer"]] == [
        "access",
        "assess",
        "excess",
    ]
    assert grounding["confusionBoundary"] == []
    assert grounding["comparisonView"] is None
    assert repository.group_entry_ids is None
    assert "access" in result.payload.answer
    assert "assess" in result.payload.answer
    assert "excess" in result.payload.answer


def test_direct_compare_uses_provider_when_available():
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

    assert result.payload.providerRequestId == "provider_req_compare"
    assert result.payload.answer == "provider compare answer"
    assert len(provider.calls) == 1
    call = provider.calls[0]
    assert call["history"] == [{"role": "user", "content": "previous"}]
    assert "词典释义" in call["system_prompt"]
    assert "quickDistinction" not in str(call["grounding"])
    assert [item["lemma"] for item in call["grounding"]["mainAnswer"]] == [
        "access",
        "assess",
    ]


def test_direct_compare_does_not_add_unasked_group_members_to_boundary():
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
    assert grounding["confusionBoundary"] == []
    assert grounding["comparisonView"] is None
    assert grounding["answerStyle"] == "confusion_untangle"
    assert "curb" not in result.payload.answer


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
    assert grounding["answerStyle"] == "confusion_untangle"
    assert result.payload.answer == (
        "institute n. institute meaning\n"
        "establish n. establish meaning"
    )


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


def test_direct_compare_uses_ecdict_profiles_for_compact_chinese_and_query():
    profiles = {
        "expire": ecdict_profile("expire", ["vi. 期满；断气", "vt. 呼出"]),
        "inspire": ecdict_profile("inspire", ["vt. 鼓舞；激发", "vi. 吸入"]),
    }
    service = DirectCompareService(
        repository=FakeRepository({}),
        ecdict_lookup=lambda query: profiles.get(query),
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="expire和inspire",
        request_id="req_compact_ecdict_compare",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert grounding["queryMode"] == "direct_compare"
    assert [item["lemma"] for item in grounding["mainAnswer"]] == [
        "expire",
        "inspire",
    ]
    assert {
        item["sourceKind"]
        for item in grounding["mainAnswer"]
    } == {"external_dictionary_basic"}
    assert [
        item["scopeCodes"]
        for item in grounding["mainAnswer"]
    ] == [["postgrad"], ["postgrad"]]
    assert result.payload.answer.splitlines() == [
        "expire vi. 期满；断气；vt. 呼出",
        "inspire vt. 鼓舞；激发；vi. 吸入",
    ]


def test_direct_compare_prefers_ecdict_profiles_over_structured_candidates():
    profiles = {
        "expire": ecdict_profile("expire", ["vi. 期满；断气"]),
        "inspire": ecdict_profile("inspire", ["vt. 鼓舞；激发"]),
    }
    service = DirectCompareService(
        repository=FakeRepository(
            {
                "expire": RetrievalCandidate(
                    entry_id="structured-expire",
                    lemma="expire",
                    meanings_zh=["structured expire"],
                    matched_alias=None,
                    scope_codes=["cet6"],
                    in_scope=True,
                    reason="structured exact match",
                    score=100,
                    part_of_speech="vi.",
                    source_kind="structured",
                ),
                "inspire": RetrievalCandidate(
                    entry_id="structured-inspire",
                    lemma="inspire",
                    meanings_zh=["structured inspire"],
                    matched_alias=None,
                    scope_codes=["cet6"],
                    in_scope=True,
                    reason="structured exact match",
                    score=100,
                    part_of_speech="vt.",
                    source_kind="structured",
                ),
            },
        ),
        ecdict_lookup=lambda query: profiles.get(query),
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="expire和inspire",
        request_id="req_compare_prefers_ecdict",
    )

    grounding = result.payload.grounding

    assert [
        item["sourceKind"]
        for item in grounding["mainAnswer"]
    ] == ["external_dictionary_basic", "external_dictionary_basic"]
    assert "structured expire" not in result.payload.answer
    assert "期满；断气" in result.payload.answer


def test_direct_compare_uses_provider_with_ecdict_when_structured_repository_unavailable():
    profiles = {
        "restrain": ecdict_profile("restrain", ["vt. limit or control"]),
        "constrain": ecdict_profile("constrain", ["vt. force or restrict"]),
    }
    provider = FakeProvider()
    repository = FakeRepository(
        {},
        exact_error=StructuredLookupUnavailable("connection timeout expired"),
        group_error=StructuredLookupUnavailable("connection timeout expired"),
    )
    service = DirectCompareService(
        repository=repository,
        provider=provider,
        ecdict_lookup=lambda query: profiles.get(query),
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="restrain\u548cconstrain",
        request_id="req_compare_ecdict_no_db",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId == "provider_req_compare"
    assert result.payload.answer == "provider compare answer"
    assert len(provider.calls) == 1
    assert [
        item["lemma"]
        for item in provider.calls[0]["grounding"]["mainAnswer"]
    ] == ["restrain", "constrain"]
    assert [item["lemma"] for item in grounding["mainAnswer"]] == [
        "restrain",
        "constrain",
    ]
    assert [
        item["sourceKind"]
        for item in grounding["mainAnswer"]
    ] == ["external_dictionary_basic", "external_dictionary_basic"]
    assert [
        item["scopeCodes"]
        for item in grounding["mainAnswer"]
    ] == [["postgrad"], ["postgrad"]]
    assert grounding["confusionBoundary"] == []
    assert grounding["comparisonView"] is None
    assert repository.group_entry_ids is None


def test_direct_compare_falls_back_to_dictionary_lines_when_provider_fails():
    profiles = {
        "restrain": ecdict_profile("restrain", ["vt. limit or control"]),
        "constrain": ecdict_profile("constrain", ["vt. force or restrict"]),
    }
    service = DirectCompareService(
        repository=FakeRepository({}),
        provider=FailingProvider(),
        ecdict_lookup=lambda query: profiles.get(query),
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="restrain和constrain",
        request_id="req_compare_provider_fallback",
    )

    assert result.status_code == 200
    assert result.payload.providerRequestId == "provider_req_failed"
    assert result.payload.answer.splitlines() == [
        "restrain vt. limit or control",
        "constrain vt. force or restrict",
    ]
    assert "当前没有人工易混组" not in result.payload.answer


def test_direct_compare_dynamic_vocabulary_ignores_unavailable_structured_pool():
    service = DirectCompareService(
        repository=FakeRepository(
            {},
            in_scope_error=StructuredLookupUnavailable("connection timeout expired"),
        ),
    )

    assert service.dynamic_vocabulary("postgrad") == []


def test_direct_compare_out_of_scope_structured_yields_to_ecdict_current_tag():
    profiles = {
        "expire": ecdict_profile("expire", ["vi. 期满；断气"]),
        "inspire": ecdict_profile("inspire", ["vt. 鼓舞；激发"]),
    }
    service = DirectCompareService(
        repository=FakeRepository(
            {
                "expire": RetrievalCandidate(
                    entry_id="structured-expire",
                    lemma="expire",
                    meanings_zh=["期满"],
                    matched_alias=None,
                    scope_codes=["cet6"],
                    in_scope=False,
                    reason="structured exact match",
                    score=100,
                    part_of_speech="vi.",
                    source_kind="structured",
                ),
                "inspire": RetrievalCandidate(
                    entry_id="structured-inspire",
                    lemma="inspire",
                    meanings_zh=["鼓舞"],
                    matched_alias=None,
                    scope_codes=["cet6"],
                    in_scope=False,
                    reason="structured exact match",
                    score=100,
                    part_of_speech="vt.",
                    source_kind="structured",
                ),
            },
        ),
        ecdict_lookup=lambda query: profiles.get(query),
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="expire和inspire",
        request_id="req_compare_out_of_scope_ecdict",
    )

    grounding = result.payload.grounding

    assert [
        item["sourceKind"]
        for item in grounding["mainAnswer"]
    ] == ["external_dictionary_basic", "external_dictionary_basic"]
    assert [
        item["scopeCodes"]
        for item in grounding["mainAnswer"]
    ] == [["postgrad"], ["postgrad"]]
