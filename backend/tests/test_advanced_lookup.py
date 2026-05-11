from backend.app.answering.advanced_lookup import AdvancedLookupService
from backend.app.answering.provider import GenerateAnswerResult
from backend.app.retrieval.types import (
    ConfusionGroup,
    ConfusionGroupMember,
    RetrievalCandidate,
)


def candidate(lemma, meanings=None, *, part_of_speech="v.", in_scope=True):
    return RetrievalCandidate(
        entry_id=lemma,
        lemma=lemma,
        meanings_zh=meanings or [f"{lemma} meaning"],
        matched_alias=None,
        scope_codes=["cet6"],
        in_scope=in_scope,
        reason="test candidate",
        score=100,
        part_of_speech=part_of_speech,
        source_kind="structured",
    )


def group(group_id, members, *, purposes, labels=None):
    return ConfusionGroup(
        id=group_id,
        teach_first_entry_id=members[0].entry_id,
        why_confusing="test group",
        common_misuse_points=["watch the boundary"],
        semantic_boundary_notes=["keep meanings separate"],
        labels=labels or ["meaning_near"],
        purposes=purposes,
        anchor_pattern=None,
        quick_distinction="short boundary",
        exam_hook=None,
        members=[
            ConfusionGroupMember(
                candidate=member,
                ordinal=index,
                emphasis_note=f"{member.lemma} note",
            )
            for index, member in enumerate(members)
        ],
    )


class FakeRepository:
    def __init__(
        self,
        *,
        meaning_candidates=None,
        exact_entries=None,
        groups=None,
        lookalikes=None,
        lemma_entries=None,
        in_scope_entries=None,
    ):
        self.meaning_candidates = meaning_candidates or []
        self.exact_entries = exact_entries or {}
        self.groups = groups or []
        self.lookalikes = lookalikes or []
        self.lemma_entries = lemma_entries or []
        self.in_scope_entries = in_scope_entries or []

    def find_meaning_candidates(self, _active_exam_target, _meaning_keyword):
        return self.meaning_candidates

    def find_exact_entry(self, _active_exam_target, lookup):
        return self.exact_entries.get(lookup)

    def find_confusion_groups_for_entry_ids(self, _active_exam_target, _entry_ids):
        return self.groups

    def find_in_scope_lookalike_candidates(self, _active_exam_target, _needle):
        return self.lookalikes

    def find_entries_by_lemmas(self, _active_exam_target, lemmas):
        lemma_set = set(lemmas)
        return [
            item
            for item in self.lemma_entries
            if item.lemma.lower() in lemma_set
        ]

    def find_in_scope_entries(self, _active_exam_target):
        return self.in_scope_entries


class FakeProvider:
    def __init__(self, answer="provider advanced answer"):
        self.answer = answer
        self.calls = []

    def generate_answer(self, **kwargs):
        self.calls.append(kwargs)
        return GenerateAnswerResult(
            answer=self.answer,
            provider_request_id="provider_req_advanced",
        )


def test_meaning_lookup_uses_expression_group_and_provider():
    comply = candidate("comply", ["遵从"])
    conform = candidate("conform", ["遵守"])
    defer = candidate("defer", ["听从"])
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_candidates=[comply, conform, defer],
            groups=[
                group(
                    "comply-conform-defer",
                    [comply, conform, defer],
                    purposes=["expression_recall"],
                    labels=["meaning_near", "exam_high_value"],
                ),
            ],
        ),
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="遵从怎么说",
        request_id="req_meaning",
        history=[{"role": "user", "content": "之前问过 obey"}],
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.answer == "provider advanced answer"
    assert result.payload.providerRequestId == "provider_req_advanced"
    assert grounding["queryMode"] == "meaning_lookup"
    assert grounding["answerStyle"] == "expression_recall"
    assert grounding["comparisonView"]["id"] == "comply-conform-defer"
    assert grounding["mainAnswer"][0]["lemma"] == "comply"
    assert [item["lemma"] for item in grounding["confusionBoundary"]] == [
        "conform",
        "defer",
    ]
    assert provider.calls[0]["history"] == [{"role": "user", "content": "之前问过 obey"}]


def test_shape_neighbor_uses_shape_group_and_provider():
    recent = candidate("recent", ["最近的"], part_of_speech="adj.")
    resent = candidate("resent", ["怨恨"], part_of_speech="v.")
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            exact_entries={"recent": recent},
            groups=[
                group(
                    "recent-resent",
                    [recent, resent],
                    purposes=["confusion_untangle"],
                    labels=["shape_like", "exam_high_value"],
                ),
            ],
        ),
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="跟 recent 很像的词有哪些",
        request_id="req_shape",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId == "provider_req_advanced"
    assert grounding["queryMode"] == "shape_neighbor_search"
    assert grounding["answerStyle"] == "confusion_untangle"
    assert grounding["comparisonView"]["id"] == "recent-resent"
    assert [item["lemma"] for item in grounding["mainAnswer"]] == ["recent", "resent"]
    assert provider.calls[0]["grounding"]["comparisonView"]["id"] == "recent-resent"


def test_shape_neighbor_accepts_unlabeled_lookalike_group_like_typescript():
    recent = candidate("recent", ["最近的"], part_of_speech="adj.")
    resent = candidate("resent", ["怨恨"], part_of_speech="v.")
    service = AdvancedLookupService(
        repository=FakeRepository(
            exact_entries={"recent": recent},
            groups=[
                group(
                    "recent-resent",
                    [recent, resent],
                    purposes=["confusion_untangle"],
                    labels=[],
                ),
            ],
        ),
    )

    result = service.answer(
        active_exam_target="cet6",
        query="跟 recent 很像的词有哪些",
        request_id="req_shape_unlabeled",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert grounding["resolution"] == "resolved"
    assert grounding["comparisonView"]["id"] == "recent-resent"
    assert [item["lemma"] for item in grounding["mainAnswer"]] == ["recent", "resent"]


def test_shape_neighbor_dynamic_lookalikes_keep_confusion_style():
    statue = candidate("statue", ["雕像"], part_of_speech="n.")
    status = candidate("status", ["状态"], part_of_speech="n.")
    statute = candidate("statute", ["法规"], part_of_speech="n.")
    service = AdvancedLookupService(
        repository=FakeRepository(
            exact_entries={"statue": statue},
            lookalikes=[statue, status, statute],
        ),
    )

    result = service.answer(
        active_exam_target="cet6",
        query="跟 statue 很像的词有哪些",
        request_id="req_shape_dynamic",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert grounding["resolution"] == "resolved"
    assert grounding["answerStyle"] == "confusion_untangle"
    assert grounding["comparisonView"] is None
    assert [item["lemma"] for item in grounding["mainAnswer"]] == [
        "statue",
        "status",
        "statute",
    ]


def test_root_family_summary_uses_known_family_and_provider():
    candidates = [
        candidate("institute", ["建立；学院"]),
        candidate("institution", ["机构；制度"]),
        candidate("constitute", ["组成；构成"]),
        candidate("substitute", ["替代"]),
    ]
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            lemma_entries=candidates,
            groups=[
                group(
                    "root-stitute",
                    candidates,
                    purposes=["memory_map"],
                    labels=["root_family"],
                ),
            ],
        ),
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="跟 institute 一样那几个词怎么记",
        request_id="req_root",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId == "provider_req_advanced"
    assert grounding["queryMode"] == "root_family_summary"
    assert grounding["answerStyle"] == "root_family_summary"
    assert grounding["resolution"] == "resolved"
    assert grounding["rootFamilyView"]["id"] == "root-stitute"
    assert grounding["comparisonView"]["id"] == "root-stitute"
    assert [item["lemma"] for item in grounding["mainAnswer"]] == [
        "institute",
        "institution",
        "constitute",
        "substitute",
    ]


def test_root_family_known_family_without_candidates_returns_root_no_match():
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(lemma_entries=[]),
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="institute 这一族怎么记",
        request_id="req_root_empty",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "root_family_summary"
    assert grounding["resolution"] == "no_match"
    assert grounding["noMatchReason"] == "low_confidence"
    assert grounding["rootFamilyView"] is None


def test_semantic_root_boundary_returns_root_no_match_without_provider():
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(),
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="re+con 的词根有什么词",
        request_id="req_re_con",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "root_family_summary"
    assert grounding["answerStyle"] == "root_family_summary"
    assert grounding["resolution"] == "no_match"
    assert grounding["mainAnswer"] == []


def test_root_fragment_contains_constraint_returns_matching_family_view():
    construct = candidate("construct", ["建造"], part_of_speech="v.")
    structure = candidate("structure", ["结构"], part_of_speech="n.")
    institute = candidate("institute", ["机构"], part_of_speech="n.")
    service = AdvancedLookupService(
        repository=FakeRepository(
            in_scope_entries=[construct, structure, institute],
        ),
    )

    result = service.answer(
        active_exam_target="cet6",
        query="有 struct 的词",
        request_id="req_struct",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert grounding["resolution"] == "resolved"
    assert grounding["rootFamilyView"]["id"] == "fragment-contains-struct"
    assert [item["lemma"] for item in grounding["mainAnswer"]] == [
        "construct",
        "structure",
    ]


def test_root_fragment_combines_prefix_and_related_contains_constraints():
    concept = candidate("concept", ["概念"], part_of_speech="n.")
    conference = candidate("conference", ["会议"], part_of_speech="n.")
    construct = candidate("construct", ["建造"], part_of_speech="v.")
    recent = candidate("recent", ["最近的"], part_of_speech="adj.")
    service = AdvancedLookupService(
        repository=FakeRepository(
            in_scope_entries=[concept, conference, construct, recent],
        ),
    )

    result = service.answer(
        active_exam_target="cet6",
        query="con 开头 re 相关的词",
        request_id="req_con_re",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert grounding["resolution"] == "resolved"
    assert grounding["rootFamilyView"]["id"] == "fragment-prefix-con-contains-re"
    assert [item["lemma"] for item in grounding["mainAnswer"]] == ["conference"]


def test_root_fragment_prefix_keeps_all_current_scope_matches():
    early_candidates = [
        candidate(f"conword{index}", [f"meaning {index}"], part_of_speech="n.")
        for index in range(15)
    ]
    construct = candidate("construct", ["建造"], part_of_speech="v.")
    convenient = candidate("convenient", ["方便的"], part_of_speech="adj.")
    service = AdvancedLookupService(
        repository=FakeRepository(
            in_scope_entries=[*early_candidates, construct, convenient],
        ),
    )

    result = service.answer(
        active_exam_target="cet6",
        query="con 开头的词有哪些",
        request_id="req_con_all",
    )

    grounding = result.payload.grounding
    lemmas = [item["lemma"] for item in grounding["mainAnswer"]]

    assert result.status_code == 200
    assert grounding["rootFamilyView"]["id"] == "fragment-prefix-con"
    assert "construct" in lemmas
    assert "convenient" in lemmas
