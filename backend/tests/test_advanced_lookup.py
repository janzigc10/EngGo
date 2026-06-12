import json

from backend.app.answering.advanced_lookup import (
    AdvancedLookupService,
    root_fragment_query,
    semantic_expression_terms,
)
from backend.app.answering.provider import ChatProviderError, GenerateAnswerResult
from backend.app.content.ecdict import EcdictBasicProfile
from backend.app.retrieval.normalize_query import normalize_query
from backend.app.retrieval.types import (
    ConfusionGroup,
    ConfusionGroupMember,
    RetrievalCandidate,
)
from backend.app.retrieval.repository import StructuredLookupUnavailable


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
        in_scope_error=None,
        meaning_error=None,
    ):
        self.meaning_candidates = meaning_candidates or []
        self.exact_entries = exact_entries or {}
        self.groups = groups or []
        self.lookalikes = lookalikes or []
        self.lemma_entries = lemma_entries or []
        self.in_scope_entries = in_scope_entries or []
        self.in_scope_error = in_scope_error
        self.meaning_error = meaning_error

    def find_meaning_candidates(self, _active_exam_target, _meaning_keyword):
        if self.meaning_error:
            raise self.meaning_error
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
        if self.in_scope_error:
            raise self.in_scope_error
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


class FailingProvider:
    def __init__(self):
        self.calls = []

    def generate_answer(self, **kwargs):
        self.calls.append(kwargs)
        raise ChatProviderError(
            "provider unavailable",
            status_code=503,
            provider_request_id="provider_req_failed",
        )


def ecdict_profile(
    lemma: str,
    meanings: list[str],
    *,
    tag: str = "",
    definition: str = "",
) -> EcdictBasicProfile:
    return EcdictBasicProfile(
        canonical=lemma,
        lookup_key=lemma,
        entry_kind="word",
        match_kind="exact",
        meanings=meanings,
        raw_translation="\n".join(meanings),
        tag=tag,
        definition=definition,
    )


class SearchableEcdictLookup:
    def __init__(self, profiles):
        self.profiles = {profile.canonical: profile for profile in profiles}
        self.searches = []

    def __call__(self, query: str):
        return self.profiles.get(query)

    def search(self, predicate, *, limit=18, preferred_tags=None):
        self.searches.append(
            {
                "limit": limit,
                "preferredTags": preferred_tags,
            },
        )
        return [
            profile
            for profile in self.profiles.values()
            if predicate(profile)
        ][:limit]


def write_source_lemma_fixture(base_dir, lemmas: list[str]) -> None:
    source_dir = base_dir / "source-lemmas"
    source_dir.mkdir()
    (source_dir / "gaokao-2020-lemmas.txt").write_text("", encoding="utf-8")
    (source_dir / "cet-2016-lemmas.tsv").write_text(
        "lemma\tsource_scope\n"
        + "\n".join(f"{lemma}\tcet6-extra" for lemma in lemmas)
        + "\n",
        encoding="utf-8",
    )


def write_seed_expression_fixture(base_dir) -> None:
    seed_dir = base_dir / "seed"
    seed_dir.mkdir()
    (seed_dir / "entries.json").write_text(
        json.dumps(
            [
                {
                    "id": "comply",
                    "lemma": "comply",
                    "aliases": ["comply with"],
                    "pos": ["verb"],
                    "meaningsZh": ["\u9075\u4ece", "\u9075\u5b88", "\u4f9d\u4ece"],
                    "examScopes": ["cet6", "postgrad"],
                },
                {
                    "id": "conform",
                    "lemma": "conform",
                    "aliases": ["conform to"],
                    "pos": ["verb"],
                    "meaningsZh": ["\u7b26\u5408", "\u9075\u4ece", "\u4f7f\u4e00\u81f4"],
                    "examScopes": ["cet6", "postgrad"],
                },
                {
                    "id": "defer",
                    "lemma": "defer",
                    "aliases": ["defer to"],
                    "pos": ["verb"],
                    "meaningsZh": ["\u542c\u4ece", "\u987a\u4ece", "\u63a8\u8fdf"],
                    "examScopes": ["cet6", "postgrad"],
                },
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (seed_dir / "confusion-groups.json").write_text(
        json.dumps(
            [
                {
                    "id": "comply-conform-defer",
                    "members": ["comply", "conform", "defer"],
                    "labels": ["meaning_near", "collocation_boundary"],
                    "purposes": ["expression_recall", "confusion_untangle"],
                    "teachFirst": "comply",
                    "whyConfusing": "test seed group",
                    "commonMisusePoints": ["watch the collocation"],
                    "semanticBoundaryNotes": [
                        "comply emphasizes following a rule or request.",
                        "conform emphasizes matching a standard.",
                        "defer emphasizes yielding to judgment.",
                    ],
                    "memberNotes": {
                        "conform": "conform to a standard",
                        "defer": "defer to authority",
                    },
                },
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
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


def test_shape_neighbor_can_return_broad_vocab_summary_from_dynamic_pool():
    access = candidate("access", ["使用权；访问"], part_of_speech="n. / v.")
    accept = candidate("accept", ["接受"], part_of_speech="v.")
    accessory = candidate("accessory", ["附件；附属的"], part_of_speech="n. / adj.")
    accent = candidate("accent", ["重音；口音"], part_of_speech="n.")
    accuse = candidate("accuse", ["指责；控告"], part_of_speech="v.")
    across = candidate("across", ["越过；穿过"], part_of_speech="prep. / adv.")
    assess = candidate("assess", ["评价；评估"], part_of_speech="v.")
    excess = candidate("excess", ["超过；过度的"], part_of_speech="n. / adj.")
    success = candidate("success", ["成功"], part_of_speech="n.")
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            exact_entries={"access": access},
            in_scope_entries=[
                access,
                accept,
                accessory,
                accent,
                accuse,
                across,
                assess,
                excess,
                success,
            ],
        ),
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="帮我找一下和access比较像的易混词",
        request_id="req_shape_broad",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "shape_neighbor_search"
    assert grounding["broadQueryMode"] == "broad_vocab"
    assert grounding["answerStyle"] == "broad_vocab_summary"
    assert grounding["groundingStrength"] == "light"
    assert grounding["supportLabel"] == "基于 CET-6 词库候选总结"
    answer_lemmas = [
        line.split(" ", 1)[0]
        for line in result.payload.answer.splitlines()
        if line and not line.startswith("注意")
    ]
    assert answer_lemmas[0] == "access"
    assert "assess" in answer_lemmas
    assert "excess" in answer_lemmas
    assert "accessory" not in answer_lemmas
    assert result.payload.answer.splitlines()[:1] == [
        "access n. / v. 使用权；访问",
    ]
    assert "\n-" not in result.payload.answer
    assert "**" not in result.payload.answer


def test_shape_neighbor_can_use_ecdict_tagged_candidates_when_structured_seed_is_missing():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("evaluate", ["vt. 评估；评价；赋值"], tag="ky"),
            ecdict_profile("evacuate", ["v. 疏散；撤出；排泄"], tag="ky"),
            ecdict_profile("graduate", ["v. 毕业"], tag="cet4"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="给我几个跟evaluate易混的单词",
        request_id="req_evaluate_shape_ecdict",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "shape_neighbor_search"
    assert grounding["broadQueryMode"] == "broad_vocab"
    assert grounding["supportLabel"] == "基于 ECDICT 考研词书候选总结"
    assert [
        item["lemma"]
        for item in grounding["mainAnswer"][:2]
    ] == ["evaluate", "evacuate"]
    assert [
        item["scopeCodes"]
        for item in grounding["mainAnswer"][:2]
    ] == [["postgrad"], ["postgrad"]]


def test_shape_neighbor_short_ecdict_seed_can_reach_near_terms_after_broad_noise():
    noisy_short_profiles = [
        ecdict_profile(f"a{middle}{last}", [f"n. noise {middle}{last}"], tag="ky")
        for middle in "abcdef"
        for last in "abcdefg"
    ]
    ecdict_lookup = SearchableEcdictLookup(
        [
            *noisy_short_profiles,
            ecdict_profile("sow", ["vt. 播种；散布"], tag="ky"),
            ecdict_profile("row", ["n. 一排；划船", "v. 划船"], tag="ky"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="跟sow易混的单词",
        request_id="req_sow_row_shape_ecdict",
    )

    grounding = result.payload.grounding
    answer_lemmas = [item["lemma"] for item in grounding["mainAnswer"]]

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "shape_neighbor_search"
    assert grounding["supportLabel"] == "基于 ECDICT 考研词书候选总结"
    assert answer_lemmas[:2] == ["sow", "row"]
    assert "aaa" not in answer_lemmas


def test_broad_collection_source_lemmas_use_ecdict_basic_meanings(tmp_path):
    write_source_lemma_fixture(tmp_path, ["command", "commend", "comment"])
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=provider,
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda lemma: ecdict_profile(
            lemma,
            [f"n. {lemma} basic meaning"],
        ),
    )

    result = service.answer(
        active_exam_target="cet6",
        query="comm 开头的单词总结",
        request_id="req_comm_source_ecdict",
    )

    grounding = result.payload.grounding
    plan = grounding["broadAnswerPlan"]

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert plan["style"] == "strict_inventory"
    assert plan["answerableLemmas"] == ["command", "commend", "comment"]
    assert plan["candidateOnlyLemmas"] == []
    assert [item["meaningsZh"] for item in grounding["mainAnswer"]] == [
        ["command basic meaning"],
        ["commend basic meaning"],
        ["comment basic meaning"],
    ]
    assert [item["partOfSpeech"] for item in grounding["mainAnswer"]] == [
        "n.",
        "n.",
        "n.",
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


def test_semantic_root_boundary_can_use_dynamic_light_candidates():
    reconcile = candidate("reconcile", ["使和解；调和"])
    reconciliation = candidate("reconciliation", ["和解"], part_of_speech="n.")
    confirm = candidate("confirm", ["确认"])
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            in_scope_entries=[reconcile, reconciliation, confirm],
        ),
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="re+con 的词根有什么词",
        request_id="req_re_con_broad",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "root_family_summary"
    assert grounding["broadQueryMode"] == "broad_vocab"
    assert grounding["answerStyle"] == "broad_vocab_summary"
    assert grounding["groundingStrength"] == "light"
    assert [item["lemma"] for item in grounding["lightCandidates"][:2]] == [
        "reconcile",
        "reconciliation",
    ]


def test_standalone_fragment_query_can_use_dynamic_light_candidates():
    inspect = candidate("inspect", ["检查"], part_of_speech="v.")
    respect = candidate("respect", ["尊重"], part_of_speech="v. / n.")
    suspect = candidate("suspect", ["怀疑"], part_of_speech="v. / n.")
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            in_scope_entries=[inspect, respect, suspect],
        ),
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="spect 这串相关的词怎么整理",
        request_id="req_spect_broad",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "root_family_summary"
    assert grounding["broadQueryMode"] == "broad_vocab"
    assert grounding["answerStyle"] == "broad_vocab_summary"
    assert {
        item["lemma"]
        for item in grounding["lightCandidates"][:3]
    } == {"inspect", "respect", "suspect"}
    assert all(
        any(signal["type"] == "fragment" for signal in item["signals"])
        for item in grounding["lightCandidates"][:3]
    )


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


def test_postgrad_fragment_query_uses_external_dictionary_candidates():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("aspire", ["vi. 渴望；立志"], tag="ky"),
            ecdict_profile("expire", ["vi. 期满；断气", "vt. 呼出"], tag="cet6 ky"),
            ecdict_profile("inspire", ["vt. 鼓舞；激发", "vi. 吸入"], tag="cet6 ky"),
            ecdict_profile("spire", ["n. 尖顶"], tag="cet4"),
            ecdict_profile("plain", ["n. 平原"], tag="ky"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="包含pire的单词",
        request_id="req_postgrad_pire",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert ecdict_lookup.searches
    assert grounding["queryMode"] == "root_family_summary"
    assert grounding["broadQueryMode"] == "broad_vocab"
    assert grounding["supportLabel"] == "基于 ECDICT 考研词书候选总结"
    assert [item["lemma"] for item in grounding["mainAnswer"]] == [
        "spire",
        "aspire",
        "expire",
        "inspire",
    ]
    assert {
        item["sourceKind"]
        for item in grounding["mainAnswer"]
    } == {"external_dictionary_basic"}
    assert "spire" in [item["lemma"] for item in grounding["lightCandidates"]]
    assert [
        item["scopeCodes"]
        for item in grounding["mainAnswer"]
    ] == [["cet4"], ["postgrad"], ["cet6", "postgrad"], ["cet6", "postgrad"]]
    assert "plain" not in result.payload.answer


def test_postgrad_prefix_query_with_meaning_hint_filters_external_candidates():
    noisy_prefix_profiles = [
        ecdict_profile(f"co{first}{second}", [f"n. noise {first}{second}"], tag="ky")
        for first in "abcdef"
        for second in "abcdefg"
    ]
    ecdict_lookup = SearchableEcdictLookup(
        [
            *noisy_prefix_profiles,
            ecdict_profile("coach", ["n. 教练", "v. 训练"], tag="ky"),
            ecdict_profile("coal", ["n. 煤"], tag="ky"),
            ecdict_profile("cooperate", ["vi. 合作；协力；配合"], tag="ky"),
            ecdict_profile("cooperative", ["adj. 合作的；合作社的"], tag="ky"),
            ecdict_profile("corporation", ["n. 公司；合作；法人团体"], tag="ky"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="co开头的意思是合作的单词",
        request_id="req_co_cooperation_prefix",
    )

    grounding = result.payload.grounding
    main_lemmas = [item["lemma"] for item in grounding["mainAnswer"]]

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "root_family_summary"
    assert grounding["broadQueryMode"] == "broad_vocab"
    assert grounding["supportLabel"] == "基于 ECDICT 考研词书候选总结"
    assert main_lemmas == ["cooperate", "cooperative"]
    assert "coach" not in main_lemmas
    assert "coal" not in main_lemmas
    assert "corporation" not in main_lemmas


def test_con_common_or_together_question_resolves_semantic_filter():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("coach", ["n. \u6559\u7ec3", "v. \u8bad\u7ec3"], tag="ky"),
            ecdict_profile("connect", ["v. \u8fde\u63a5\uff1b\u8054\u7cfb"], tag="ky"),
            ecdict_profile("combine", ["v. \u7ed3\u5408\uff1b\u5408\u5e76"], tag="ky"),
            ecdict_profile("concentrate", ["v. \u96c6\u4e2d\uff1b\u96c6\u5408"], tag="ky"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="\u0063\u006f\u006e\u5f00\u5934\u8868\u793a\u5171\u540c\u6216\u4e00\u8d77\u7684\u8bcd",
        request_id="req_con_common_or_together",
    )

    grounding = result.payload.grounding
    main_lemmas = {item["lemma"] for item in grounding["mainAnswer"]}

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["learningIntentPlan"]["task"] == "semantic_filter"
    assert grounding["broadAnswerPlan"]["presentation"] == "semantic_filter_table"
    assert main_lemmas & {"connect", "combine", "concentrate"}
    assert "coach" not in main_lemmas


def test_e_evaluate_question_resolves_semantic_filter_from_service_pool():
    evaluate = candidate(
        "evaluate",
        ["\u8bc4\u4ef7\uff1b\u8bc4\u4f30"],
        part_of_speech="v.",
    )
    estimate = candidate(
        "estimate",
        ["\u4f30\u8ba1\uff1b\u8bc4\u4f30"],
        part_of_speech="v. / n.",
    )
    evacuate = candidate("evacuate", ["\u64a4\u79bb\uff1b\u758f\u6563"], part_of_speech="v.")
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            in_scope_entries=[evaluate, estimate, evacuate],
        ),
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="\u0065\u5f00\u5934\u8868\u793a\u8bc4\u4f30\u8bc4\u4ef7\u7684\u5355\u8bcd",
        request_id="req_e_evaluate",
    )

    grounding = result.payload.grounding
    main_lemmas = {item["lemma"] for item in grounding["mainAnswer"]}

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["learningIntentPlan"]["task"] == "semantic_filter"
    assert grounding["broadAnswerPlan"]["presentation"] == "semantic_filter_table"
    assert {"evaluate", "estimate"} <= main_lemmas
    assert "evacuate" not in main_lemmas


def test_single_letter_semantic_filter_can_use_late_ecdict_matches():
    filler_profiles = [
        ecdict_profile(
            f"e{chr(97 + first)}{chr(97 + second)}{chr(97 + third)}",
            ["n. filler"],
            tag="ky",
        )
        for first in range(26)
        for second in range(26)
        for third in range(26)
    ][:601]
    ecdict_lookup = SearchableEcdictLookup(
        [
            *filler_profiles,
            ecdict_profile("evaluate", ["vt. \u8bc4\u4f30\uff1b\u8bc4\u4ef7"], tag="ky"),
            ecdict_profile(
                "estimate",
                ["n. \u4f30\u8ba1\uff1b\u5224\u65ad", "vt. \u4f30\u8ba1\uff1b\u8bc4\u4ef7"],
                tag="ky",
            ),
            ecdict_profile("evacuate", ["v. \u64a4\u79bb\uff1b\u758f\u6563"], tag="ky"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="\u0065\u5f00\u5934\u8868\u793a\u8bc4\u4f30\u8bc4\u4ef7\u7684\u5355\u8bcd",
        request_id="req_e_evaluate_late_ecdict",
    )

    grounding = result.payload.grounding
    main_lemmas = {item["lemma"] for item in grounding["mainAnswer"]}

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["learningIntentPlan"]["task"] == "semantic_filter"
    assert grounding["broadAnswerPlan"]["presentation"] == "semantic_filter_table"
    assert {"evaluate", "estimate"} <= main_lemmas
    assert "evacuate" not in main_lemmas


def test_con_restrict_question_can_use_ecdict_definition_without_forced_alias():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("confine", ["vt. \u9650\u5236, \u4f7f\u4e0d\u5916\u51fa, \u7981\u95ed"], tag="ky"),
            ecdict_profile(
                "constrain",
                ["vt. \u5f3a\u8feb, \u9650\u5236, \u5173\u62bc"],
                tag="ky",
                definition="v hold back\nv restrict",
            ),
            ecdict_profile(
                "conscript",
                ["vt. \u5f3a\u8feb\u5165\u4f0d"],
                tag="ky",
                definition="v enroll into service compulsorily",
            ),
            ecdict_profile("contain", ["vt. \u5305\u542b, \u5bb9\u7eb3, \u63a7\u5236"], tag="ky"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="\u8868\u793a\u9650\u5236\u6216\u7ea6\u675f\u7684con\u5f00\u5934\u5355\u8bcd",
        request_id="req_con_restrict_ecdict_definition",
    )

    grounding = result.payload.grounding
    main_lemmas = {item["lemma"] for item in grounding["mainAnswer"]}
    main_by_lemma = {item["lemma"]: item for item in grounding["mainAnswer"]}

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["learningIntentPlan"]["task"] == "semantic_filter"
    assert grounding["broadAnswerPlan"]["presentation"] == "semantic_filter_table"
    assert {"confine", "constrain"} <= main_lemmas
    assert main_by_lemma["constrain"]["meaningsZh"] == ["\u5f3a\u8feb, \u9650\u5236, \u5173\u62bc"]
    assert "conscript" not in main_lemmas
    assert "contain" not in main_lemmas


def test_anti_form_prefix_inventory_can_include_non_affix_words():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("antiwar", ["adj. 反战的"], tag="ky"),
            ecdict_profile("antibody", ["n. 抗体"], tag="ky"),
            ecdict_profile("antique", ["n. 古董", "adj. 古时的"], tag="ky"),
            ecdict_profile("anticipate", ["vt. 预料；预期"], tag="ky"),
        ],
    )
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=FakeProvider(),
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="anti开头的词有哪些",
        request_id="req_anti_form_prefix",
    )

    grounding = result.payload.grounding
    main_lemmas = {item["lemma"] for item in grounding["mainAnswer"]}

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert grounding["learningIntentPlan"]["task"] == "form_filter"
    assert grounding["broadAnswerPlan"]["presentation"] == "inventory_table"
    assert {"antiwar", "antibody", "antique", "anticipate"} <= main_lemmas


def test_anti_semantic_prefix_requires_meaning_evidence():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("antiwar", ["adj. 反战的"], tag="ky"),
            ecdict_profile("antibody", ["n. 抗体"], tag="ky"),
            ecdict_profile("antique", ["n. 古董", "adj. 古时的"], tag="ky"),
            ecdict_profile("anticipate", ["vt. 预料；预期"], tag="ky"),
        ],
    )
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=FakeProvider(),
        ecdict_lookup=ecdict_lookup,
    )

    for query in ["anti开头表示反对的词", "anti表示反对的词"]:
        result = service.answer(
            active_exam_target="postgrad",
            query=query,
            request_id=f"req_anti_semantic_prefix_{query}",
        )

        grounding = result.payload.grounding
        main_lemmas = {item["lemma"] for item in grounding["mainAnswer"]}

        assert result.status_code == 200
        assert result.payload.providerRequestId is None
        assert grounding["learningIntentPlan"]["task"] == "semantic_filter"
        assert grounding["broadAnswerPlan"]["presentation"] == "semantic_filter_table"
        assert {"antiwar", "antibody"} <= main_lemmas
        assert "antique" not in main_lemmas
        assert "anticipate" not in main_lemmas


def test_re_semantic_prefix_does_not_keep_reconcile_from_form_only():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("rewrite", ["v. 重写"], tag="ky"),
            ecdict_profile("renew", ["v. 重新开始；更新"], tag="ky"),
            ecdict_profile("reconsider", ["v. 重新考虑"], tag="ky"),
            ecdict_profile("reconcile", ["vt. 使和解，调停，使一致"], tag="ky"),
        ],
    )
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=FakeProvider(),
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="re开头表示再次的词",
        request_id="req_re_again_prefix",
    )

    grounding = result.payload.grounding
    main_lemmas = {item["lemma"] for item in grounding["mainAnswer"]}

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert grounding["learningIntentPlan"]["task"] == "semantic_filter"
    assert {"rewrite", "renew", "reconsider"} <= main_lemmas
    assert "reconcile" not in main_lemmas


def test_suffix_semantic_filters_exclude_same_suffix_noise():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("hopeless", ["adj. 没有希望的"], tag="ky"),
            ecdict_profile("useless", ["adj. 无用的"], tag="ky"),
            ecdict_profile("unless", ["conj. 除非"], tag="ky"),
            ecdict_profile("teacher", ["n. 教师"], tag="ky"),
            ecdict_profile("worker", ["n. 工人"], tag="ky"),
            ecdict_profile(
                "administer",
                ["vt. 管理, 料理, 执行", "vi. 执行遗产管理人的职责, 给予帮助"],
                tag="ky",
            ),
            ecdict_profile("better", ["a. 较好的", "adv. 比较好"], tag="ky"),
            ecdict_profile("water", ["n. 水"], tag="ky"),
        ],
    )
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=FakeProvider(),
        ecdict_lookup=ecdict_lookup,
    )

    for query in ["less结尾表示没有的词", "-less表示没有的词"]:
        less_result = service.answer(
            active_exam_target="postgrad",
            query=query,
            request_id=f"req_less_without_suffix_{query}",
        )
        less_lemmas = {
            item["lemma"] for item in less_result.payload.grounding["mainAnswer"]
        }

        assert less_result.status_code == 200
        assert less_result.payload.grounding["learningIntentPlan"]["task"] == "semantic_filter"
        assert {"hopeless", "useless"} <= less_lemmas
        assert "unless" not in less_lemmas

    for query in ["er结尾表示人的词", "-er表示人的词"]:
        er_result = service.answer(
            active_exam_target="postgrad",
            query=query,
            request_id=f"req_er_person_suffix_{query}",
        )
        er_lemmas = {item["lemma"] for item in er_result.payload.grounding["mainAnswer"]}

        assert er_result.status_code == 200
        assert er_result.payload.grounding["learningIntentPlan"]["task"] == "semantic_filter"
        assert {"teacher", "worker"} <= er_lemmas
        assert "administer" not in er_lemmas
        assert "better" not in er_lemmas
        assert "water" not in er_lemmas


def test_prefix_query_does_not_resolve_exact_same_length_token():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("xyz", ["n. 字母组合"], tag="ky"),
        ],
    )
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=FakeProvider(),
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="xyz开头的单词",
        request_id="req_xyz_prefix_exact_token",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert grounding["queryMode"] == "root_family_summary"
    assert grounding["resolution"] == "no_match"
    assert grounding["mainAnswer"] == []


def test_desert_dessert_similarity_question_resolves_shape_neighbors():
    desert = candidate("desert", ["\u6c99\u6f20\uff1b\u629b\u5f03"], part_of_speech="n. / v.")
    dessert = candidate("dessert", ["\u751c\u70b9"], part_of_speech="n.")
    service = AdvancedLookupService(
        repository=FakeRepository(
            in_scope_entries=[desert, dessert],
        ),
        provider=FakeProvider(),
    )

    result = service.answer(
        active_exam_target="cet6",
        query="\u0064\u0065\u0073\u0065\u0072\u0074 \u0064\u0065\u0073\u0073\u0065\u0072\u0074 \u8fd8\u6709\u6ca1\u6709\u76f8\u4f3c\u7684\u8bcd",
        request_id="req_desert_dessert_shape",
    )

    grounding = result.payload.grounding
    main_lemmas = [item["lemma"] for item in grounding["mainAnswer"]]

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert grounding["learningIntentPlan"]["task"] == "shape_neighbors"
    assert grounding["broadAnswerPlan"]["presentation"] == "shape_neighbor_table"
    assert {"desert", "dessert"} <= set(main_lemmas)


def test_accept_except_collection_recall_uses_both_seed_terms_from_ecdict():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("accept", ["v. \u63a5\u53d7\uff1b\u627f\u8ba4"], tag="ky"),
            ecdict_profile("except", ["prep. \u9664\u4e86"], tag="ky"),
            ecdict_profile("expect", ["v. \u9884\u671f\uff1b\u671f\u5f85"], tag="ky"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="accept \u548c except \u5f88\u50cf\u7684\u5355\u8bcd\u6709\u54ea\u4e9b",
        request_id="req_accept_except_multi_seed_shape",
    )

    grounding = result.payload.grounding
    main_lemmas = [item["lemma"] for item in grounding["mainAnswer"]]

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "shape_neighbor_search"
    assert grounding["learningIntentPlan"]["task"] == "shape_neighbors"
    assert grounding["broadAnswerPlan"]["presentation"] == "shape_neighbor_table"
    assert {"accept", "except"} <= set(main_lemmas)
    assert "expect" in main_lemmas


def test_restrain_constrain_collection_recall_stays_shape_neighbor_broad():
    restrain = candidate("restrain", ["\u6291\u5236\uff1b\u963b\u6b62"], part_of_speech="v.")
    constrain = candidate("constrain", ["\u5f3a\u8feb\uff1b\u9650\u5236"], part_of_speech="v.")
    constraint = candidate("constraint", ["\u9650\u5236\uff1b\u7ea6\u675f"], part_of_speech="n.")
    strain = candidate("strain", ["\u62c9\u7d27\uff1b\u538b\u529b"], part_of_speech="n. / v.")
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            in_scope_entries=[restrain, constrain, constraint, strain],
        ),
        provider=provider,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="restrain \u548c constrain \u5f88\u50cf\u7684\u5355\u8bcd",
        request_id="req_restrain_constrain_multi_seed_shape",
    )

    grounding = result.payload.grounding
    main_lemmas = [item["lemma"] for item in grounding["mainAnswer"]]

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "shape_neighbor_search"
    assert grounding["learningIntentPlan"]["task"] == "shape_neighbors"
    assert grounding["broadAnswerPlan"]["presentation"] == "shape_neighbor_table"
    assert {"restrain", "constrain"} <= set(main_lemmas)


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


def test_root_fragment_parses_chinese_adjacent_prefix_suffix_constraints():
    fragment = root_fragment_query("re开头cile结尾的单词")

    assert fragment["id"] == "fragment-prefix-re-suffix-cile"
    assert fragment["constraints"] == [
        {"type": "prefix", "value": "re"},
        {"type": "suffix", "value": "cile"},
    ]


def test_postgrad_prefix_suffix_query_filters_ecdict_candidates():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("reconcile", ["vt. 使和解，调停，使一致"], tag="ky"),
            ecdict_profile("recite", ["v. 背诵，朗诵"], tag="ky"),
            ecdict_profile("reptile", ["n. 爬行动物"], tag="ky"),
            ecdict_profile("facile", ["adj. 容易的，肤浅的"], tag="ky"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="re开头cile结尾的单词",
        request_id="req_re_cile",
    )

    grounding = result.payload.grounding
    main_lemmas = [item["lemma"] for item in grounding["mainAnswer"]]
    light_lemmas = [item["lemma"] for item in grounding["lightCandidates"]]
    light_signals = {
        signal["type"]
        for signal in grounding["lightCandidates"][0]["signals"]
    }

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "root_family_summary"
    assert grounding["broadQueryMode"] == "broad_vocab"
    assert grounding["learningIntentPlan"]["task"] == "form_filter"
    assert grounding["learningIntentPlan"]["minimumAnswerableCandidates"] == 1
    assert main_lemmas == ["reconcile"]
    assert light_lemmas == ["reconcile"]
    assert {"prefix", "suffix"} <= light_signals


def test_prefix_suffix_query_uses_ecdict_when_structured_repository_unavailable():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile(
                "reconcile",
                ["vt. \u4f7f\u548c\u89e3\uff1b\u8c03\u505c\uff1b\u4f7f\u4e00\u81f4"],
                tag="ky",
            ),
            ecdict_profile("recite", ["v. \u80cc\u8bf5\uff1b\u6717\u8bfb"], tag="ky"),
            ecdict_profile("facile", ["adj. \u5bb9\u6613\u7684\uff1b\u80a4\u6d45\u7684"], tag="ky"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            in_scope_error=StructuredLookupUnavailable("database unavailable"),
        ),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="\u0072\u0065\u5f00\u5934\u0063\u0069\u006c\u0065\u7ed3\u5c3e\u7684\u5355\u8bcd",
        request_id="req_re_cile_db_unavailable",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert [item["lemma"] for item in grounding["mainAnswer"]] == ["reconcile"]
    assert grounding["learningIntentPlan"]["task"] == "form_filter"
    assert grounding["broadAnswerPlan"]["presentation"] == "inventory_table"


def test_meaning_lookup_uses_ecdict_when_structured_repository_unavailable():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile(
                "action",
                ["n. \u884c\u52a8\uff1b\u6d3b\u52a8\uff1b\u52a8\u4f5c"],
                tag="ky",
            ),
            ecdict_profile(
                "activate",
                ["vt. \u4f7f\u6d3b\u52a8\uff1b\u4f7f\u6fc0\u6d3b"],
                tag="ky",
            ),
            ecdict_profile(
                "activity",
                ["n. \u6d3b\u52a8\uff1b\u884c\u52a8\uff1b\u6d3b\u8dc3"],
                tag="ky",
            ),
            ecdict_profile(
                "active",
                ["adj. \u79ef\u6781\u7684\uff1b\u6d3b\u8dc3\u7684"],
                tag="ky",
            ),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="\u6d3b\u52a8\u7684\u82f1\u6587\u662f\u4ec0\u4e48",
        request_id="req_activity_meaning_ecdict",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "meaning_lookup"
    assert grounding["resolution"] == "resolved"
    assert grounding["learningIntentPlan"]["task"] == "meaning_core"
    assert [item["lemma"] for item in grounding["mainAnswer"]][:1] == ["activity"]


def test_semantic_expression_uses_provider_without_claiming_wordbook_hit():
    provider = FakeProvider(answer="follow 的正式表达可以用 comply with 或 adhere to。")
    service = AdvancedLookupService(
        repository=FakeRepository(),
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="more formal way to say follow",
        request_id="req_semantic_expression",
        route_decision={
            "intent": "semantic_expression",
            "confidence": 0.91,
            "terms": ["follow"],
            "style": "formal",
        },
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.answerKind == "plain"
    assert result.payload.answer == "follow 的正式表达可以用 comply with 或 adhere to。"
    assert result.payload.providerRequestId == "provider_req_advanced"
    assert grounding["queryMode"] == "semantic_expression"
    assert grounding["answerStyle"] == "semantic_expression"
    assert grounding["terms"] == ["follow"]
    assert grounding["style"] == "formal"
    assert grounding["mainAnswer"] == []
    assert "not a wordbook hit" in "\n".join(grounding["rules"])


def test_semantic_expression_provider_failure_returns_bounded_plain_fallback():
    provider = FailingProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(),
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="more formal way to say follow",
        request_id="req_semantic_expression_fallback",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.answerKind == "plain"
    assert result.payload.providerRequestId == "provider_req_failed"
    assert "更正式" in result.payload.answer
    assert grounding["queryMode"] == "semantic_expression"
    assert grounding["resolution"] == "resolved"
    assert grounding["terms"] == ["follow"]
    assert provider.calls


def test_semantic_expression_terms_ignore_style_cue_words():
    normalized = normalize_query("more natural way to say get")

    assert semantic_expression_terms(normalized) == ["get"]


def test_unsupported_root_combo_no_longer_resolves_weak_candidates():
    service = AdvancedLookupService(
        repository=FakeRepository(
            in_scope_entries=[
                candidate("antique", ["古董"]),
                candidate("anew", ["重新"]),
                candidate("attic", ["阁楼"]),
            ],
        ),
        provider=FakeProvider(),
    )

    result = service.answer(
        active_exam_target="cet6",
        query="anti+dis 的词根有什么词",
        request_id="req_anti_dis_gate",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert grounding["queryMode"] == "root_family_summary"
    assert grounding["resolution"] == "no_match"
    assert grounding["mainAnswer"] == []


def test_gaokao_meaning_lookup_rejects_non_current_ecdict_tags():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile(
                "viaduct",
                ["n. \u9ad8\u67b6\u6865\uff1b\u9ad8\u67b6\u94c1\u8def"],
                tag="gre",
            ),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="gaokao",
        query="\u9ad8\u67b6\u6865\u600e\u4e48\u8bf4",
        request_id="req_viaduct_gre_rejected",
    )

    grounding = result.payload.grounding
    main_lemmas = [item["lemma"] for item in grounding.get("mainAnswer", [])]

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "meaning_lookup"
    assert grounding["resolution"] == "no_match"
    assert "viaduct" not in main_lemmas


def test_gaokao_meaning_lookup_rejects_untagged_ecdict_candidates():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile(
                "ventiduct",
                ["n. \u901a\u98ce\u7ba1"],
                tag="",
            ),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="gaokao",
        query="\u901a\u98ce\u7ba1\u600e\u4e48\u8bf4",
        request_id="req_ventiduct_untagged_rejected",
    )

    grounding = result.payload.grounding
    main_lemmas = [item["lemma"] for item in grounding.get("mainAnswer", [])]

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "meaning_lookup"
    assert grounding["resolution"] == "no_match"
    assert "ventiduct" not in main_lemmas


def test_gaokao_meaning_lookup_accepts_current_scope_ecdict_tags():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile(
                "restrict",
                ["v. \u9650\u5236\uff1b\u7ea6\u675f"],
                tag="gk",
            ),
            ecdict_profile(
                "constrain",
                ["v. \u9650\u5236\uff1b\u7ea6\u675f\uff1b\u5f3a\u8feb"],
                tag="gre",
            ),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="gaokao",
        query="\u9650\u5236\u7528\u82f1\u8bed\u600e\u4e48\u8bf4",
        request_id="req_restrict_gaokao_scope",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "meaning_lookup"
    assert grounding["resolution"] == "resolved"
    assert [item["lemma"] for item in grounding["mainAnswer"]][:1] == [
        "restrict",
    ]
    assert "constrain" not in [item["lemma"] for item in grounding["mainAnswer"]]


def test_meaning_lookup_uses_seed_expression_group_when_structured_repository_unavailable(tmp_path):
    write_seed_expression_fixture(tmp_path)
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        provider=provider,
        source_lemma_base_dir=tmp_path,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="\u9075\u4ece\u600e\u4e48\u8bf4",
        request_id="req_seed_comply_conform_defer",
        history=[{"role": "user", "content": "previous message"}],
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
    assert provider.calls[0]["history"] == [{"role": "user", "content": "previous message"}]


def test_seed_expression_provider_failure_returns_grounded_fallback(tmp_path):
    write_seed_expression_fixture(tmp_path)
    provider = FailingProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        provider=provider,
        source_lemma_base_dir=tmp_path,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="\u9075\u4ece\u600e\u4e48\u8bf4",
        request_id="req_seed_expression_providerless",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.answerKind == "grounded"
    assert result.payload.providerRequestId == "provider_req_failed"
    assert grounding["queryMode"] == "meaning_lookup"
    assert grounding["answerStyle"] == "expression_recall"
    assert grounding["resolution"] == "resolved"
    assert grounding["mainAnswer"][0]["lemma"] == "comply"
    assert provider.calls


def test_phrase_hint_bypasses_seed_expression_group_for_rule_phrase(tmp_path):
    write_seed_expression_fixture(tmp_path)
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("comply", ["v. \u9075\u5b88\uff1b\u670d\u4ece"], tag="cet6"),
            ecdict_profile("conform", ["v. \u9075\u4ece\uff1b\u7b26\u5408"], tag="cet6"),
            ecdict_profile("defer", ["v. \u542c\u4ece\uff1b\u987a\u4ece"], tag="cet6"),
            ecdict_profile("follow", ["v. \u9075\u5faa\uff1b\u9075\u5b88"], tag="cet6"),
            ecdict_profile("observe", ["v. \u9075\u5b88\uff1b\u89c2\u5bdf"], tag="cet6"),
            ecdict_profile("obey", ["v. \u9075\u5b88\uff1b\u670d\u4ece"], tag="cet6"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        provider=provider,
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="\u9075\u5b88\u89c4\u5219\u7528\u82f1\u6587\u600e\u4e48\u8bf4",
        request_id="req_rule_phrase_bypasses_seed_group",
    )

    grounding = result.payload.grounding
    main_lemmas = [item["lemma"] for item in grounding["mainAnswer"]]

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert grounding["queryMode"] == "meaning_lookup"
    assert grounding["answerStyle"] == "broad_vocab_summary"
    assert main_lemmas[:2] == ["follow", "observe"]
    assert "defer" not in main_lemmas
    assert provider.calls == []


def test_postgrad_obey_meaning_lookup_prefers_exam_expression_verb():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("compliance", ["n. \u9075\u5b88\uff1b\u987a\u4ece"], tag="ky"),
            ecdict_profile("obedience", ["n. \u670d\u4ece\uff1b\u9075\u5b88"], tag="ky"),
            ecdict_profile("obedient", ["adj. \u670d\u4ece\u7684\uff1b\u987a\u4ece\u7684"], tag="ky"),
            ecdict_profile("obey", ["v. \u9075\u5b88\uff1b\u670d\u4ece"], tag="ky"),
            ecdict_profile("abide", ["v. \u9075\u5b88\uff1b\u5fcd\u53d7"], tag="ky"),
            ecdict_profile("comply", ["v. \u9075\u5b88\uff1b\u670d\u4ece"], tag="ky"),
            ecdict_profile("conform", ["v. \u9075\u5b88\uff1b\u7b26\u5408"], tag="ky"),
        ],
    )
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="\u9075\u5b88\u7684\u82f1\u6587\u662f\u5565",
        request_id="req_obey_meaning_prefers_comply",
    )

    grounding = result.payload.grounding
    main_lemmas = [item["lemma"] for item in grounding["mainAnswer"]]

    assert result.status_code == 200
    assert grounding["queryMode"] == "meaning_lookup"
    assert grounding["learningIntentPlan"]["task"] == "meaning_core"
    assert main_lemmas[0] == "comply"


def test_postgrad_express_opinion_lookup_prefers_expression_verb():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("expression", ["n. \u8868\u8fbe\uff1b\u8868\u60c5"], tag="ky"),
            ecdict_profile("outlook", ["n. \u89c2\u70b9\uff1b\u524d\u666f"], tag="ky"),
            ecdict_profile("statement", ["n. \u9648\u8ff0\uff1b\u58f0\u660e"], tag="ky"),
            ecdict_profile("viewpoint", ["n. \u89c2\u70b9"], tag="ky"),
            ecdict_profile("express", ["vt. \u5feb\u9012\uff1b\u8868\u8fbe\uff1b\u8868\u793a"], tag="ky"),
        ],
    )
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="\u8868\u793a\u8868\u8fbe\u89c2\u70b9\u7684\u8bcd\u6709\u54ea\u4e9b\u54ea\u4e9b\u8003\u8bd5\u5e38\u89c1",
        request_id="req_express_opinion_prefers_verb",
    )

    grounding = result.payload.grounding
    main_lemmas = [item["lemma"] for item in grounding["mainAnswer"]]

    assert result.status_code == 200
    assert grounding["queryMode"] == "meaning_lookup"
    assert grounding["learningIntentPlan"]["task"] == "meaning_core"
    assert main_lemmas[0] == "express"


def test_chinese_expression_recall_uses_cleaned_ecdict_meaning_hint():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("comply", ["v. 遵守；服从"], tag="ky"),
            ecdict_profile("follow", ["v. 遵循；遵守；跟随"], tag="ky"),
            ecdict_profile("restrict", ["v. 限制；约束"], tag="ky"),
            ecdict_profile("responsible", ["adj. 有责任的；负责的"], tag="ky"),
            ecdict_profile("undertake", ["v. 承担；从事"], tag="ky"),
            ecdict_profile("express", ["v. 表达；表示；陈述"], tag="ky"),
            ecdict_profile("opinion", ["n. 意见；观点"], tag="ky"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    cases = [
        ("遵守的英文是啥", {"comply", "follow"}),
        ("限制用英语怎么说", {"restrict"}),
        ("表达遵守的单词", {"comply", "follow"}),
        ("表示承担责任的词有哪些", {"responsible"}),
        ("表示表达观点的词有哪些哪些考试常见", {"express"}),
    ]

    for query, expected_lemmas in cases:
        result = service.answer(
            active_exam_target="postgrad",
            query=query,
            request_id=f"req_{query}",
        )

        grounding = result.payload.grounding
        main_lemmas = [item["lemma"] for item in grounding["mainAnswer"]]

        assert result.status_code == 200
        assert result.payload.providerRequestId is None
        assert grounding["queryMode"] == "meaning_lookup"
        assert grounding["resolution"] == "resolved"
        assert grounding["learningIntentPlan"]["task"] == "meaning_core"
        assert expected_lemmas.intersection(main_lemmas), query

    assert provider.calls == []


def test_meaning_lookup_weak_reverse_candidates_become_plain_expression_advice():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("disobedience", ["n. 不服从；不遵守"], tag="ky"),
            ecdict_profile("subdue", ["vt. 征服；抑制；使遵从"], tag="ky"),
        ],
    )
    provider = FakeProvider(answer="可以说 follow、observe 或 comply with。")
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="遵循的英文是什么",
        request_id="req_follow_weak_meaning_gate",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.answerKind == "plain"
    assert result.payload.answer == "可以说 follow、observe 或 comply with。"
    assert result.payload.providerRequestId == "provider_req_advanced"
    assert grounding["queryMode"] == "meaning_lookup"
    assert grounding["answerStyle"] == "meaning_expression_advice"
    assert grounding["resolution"] == "no_match"
    assert grounding["noMatchReason"] == "low_confidence"
    assert grounding["mainAnswer"] == []
    assert grounding["followUpPrompt"]
    assert grounding["weakCandidateLemmas"] == ["disobedience", "subdue"]
    assert "not a wordbook hit" in "\n".join(grounding["rules"])
    assert provider.calls


def test_meaning_lookup_weak_expression_candidate_uses_bounded_advice_without_provider():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("hiss", ["v. 发出嘘声；表示不满"], tag="ky"),
        ],
    )
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="表达观点的英文是什么",
        request_id="req_express_opinion_weak_meaning_gate",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.answerKind == "plain"
    assert result.payload.providerRequestId is None
    assert "express an opinion" in result.payload.answer
    assert "hiss" not in result.payload.answer
    assert grounding["queryMode"] == "meaning_lookup"
    assert grounding["answerStyle"] == "meaning_expression_advice"
    assert grounding["resolution"] == "no_match"
    assert grounding["noMatchReason"] == "low_confidence"
    assert grounding["mainAnswer"] == []
    assert grounding["followUpPrompt"]
    assert grounding["weakCandidateLemmas"] == ["hiss"]


def test_meaning_lookup_quality_gate_keeps_direct_cooperation_hit_grounded():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("cooperate", ["v. 合作；协作；配合"], tag="ky"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="合作的英文是什么",
        request_id="req_cooperate_quality_gate",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.answerKind == "grounded"
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["queryMode"] == "meaning_lookup"
    assert grounding["resolution"] == "resolved"
    assert [item["lemma"] for item in grounding["mainAnswer"]] == ["cooperate"]


def test_meaning_lookup_preferred_lemma_survives_ecdict_search_window():
    decoys = [
        ecdict_profile(f"bridle{index}", ["n. 约束"], tag="cet6")
        for index in (
            "aa",
            "ab",
            "ac",
            "ad",
            "ae",
            "af",
            "ag",
            "ah",
            "ai",
            "aj",
            "ak",
            "al",
            "am",
            "an",
            "ao",
            "ap",
            "aq",
            "ar",
            "as",
            "at",
            "au",
            "av",
            "aw",
            "ax",
            "ay",
            "az",
            "ba",
            "bb",
            "bc",
            "bd",
            "be",
            "bf",
            "bg",
            "bh",
            "bi",
            "bj",
            "bk",
            "bl",
            "bm",
            "bn",
            "bo",
            "bp",
            "bq",
            "br",
            "bs",
            "bt",
            "bu",
            "bv",
            "bw",
            "bx",
            "by",
            "bz",
            "ca",
            "cb",
            "cc",
            "cd",
            "ce",
            "cf",
            "cg",
            "ch",
            "ci",
            "cj",
            "ck",
            "cl",
            "cm",
            "cn",
            "co",
            "cp",
            "cq",
            "cr",
            "cs",
            "ct",
            "cu",
            "cv",
            "cw",
            "cx",
            "cy",
            "cz",
            "da",
            "db",
            "dc",
            "dd",
            "de",
            "df",
            "dg",
            "dh",
            "di",
            "dj",
            "dk",
            "dl",
            "dm",
            "dn",
            "do",
            "dp",
            "dq",
            "dr",
            "ds",
            "dt",
        )
    ]
    ecdict_lookup = SearchableEcdictLookup(
        [
            *decoys,
            ecdict_profile("restrict", ["vt. 限制；限定；约束"], tag="cet6"),
        ],
    )
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="限制的英文是什么",
        request_id="req_restrict_preferred_window",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert grounding["queryMode"] == "meaning_lookup"
    assert grounding["resolution"] == "resolved"
    assert [item["lemma"] for item in grounding["mainAnswer"]][:1] == ["restrict"]


def test_meaning_lookup_phrase_hints_prefer_expression_targets():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("tick", ["vi. 活动；滴答响"], tag="cet6"),
            ecdict_profile("activity", ["n. 活动；行动；活跃"], tag="gk cet4"),
            ecdict_profile("event", ["n. 事件；活动"], tag="cet6"),
            ecdict_profile("action", ["n. 行动；活动"], tag="cet6"),
            ecdict_profile("respond", ["v. 回答；响应；承担责任"], tag="cet6"),
            ecdict_profile("responsible", ["adj. 有责任的；负责的"], tag="cet6"),
            ecdict_profile("liable", ["adj. 有义务的；应负责的"], tag="cet6"),
            ecdict_profile("thought", ["n. 想法；思想"], tag="cet6"),
            ecdict_profile("notion", ["n. 想法；观念"], tag="cet6"),
            ecdict_profile("express", ["v. 表达；表示；陈述"], tag="cet6"),
            ecdict_profile("state", ["v. 陈述；说明"], tag="cet6"),
            ecdict_profile("voice", ["v. 表达；吐露"], tag="cet6"),
            ecdict_profile("follow", ["v. 遵循；遵守；跟随"], tag="cet6"),
            ecdict_profile("observe", ["v. 遵守；观察"], tag="cet6"),
            ecdict_profile("comply", ["v. 遵守；服从"], tag="cet6"),
            ecdict_profile("obey", ["v. 遵守；服从"], tag="cet6"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    cases = [
        ("活动的英文是什么", "activity", {"tick"}),
        ("负责的英文是什么", "responsible", {"respond"}),
        ("承担责任的英文是什么", "responsible", {"respond"}),
        ("表达想法的英文是什么", "express", {"thought", "notion"}),
        ("提出观点的英文是什么", "state", {"thought", "notion"}),
        ("遵守规则用英文怎么说", "follow", set()),
    ]

    for query, expected_first, forbidden in cases:
        result = service.answer(
            active_exam_target="cet6",
            query=query,
            request_id=f"req_{query}",
        )

        grounding = result.payload.grounding
        main_lemmas = [item["lemma"] for item in grounding["mainAnswer"]]

        assert result.status_code == 200
        assert result.payload.providerRequestId is None
        assert grounding["queryMode"] == "meaning_lookup"
        assert grounding["resolution"] == "resolved"
        assert main_lemmas[0] == expected_first, query
        assert not forbidden.intersection(main_lemmas), query

    assert provider.calls == []


def test_meaning_lookup_phrase_hints_do_not_strip_negative_context():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("responsible", ["adj. 有责任的；负责的；承担责任的"], tag="cet6"),
            ecdict_profile("liable", ["adj. 有义务的；应负责的"], tag="cet6"),
            ecdict_profile("irresponsible", ["adj. 不负责任的；不承担责任的"], tag="cet6"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="不承担责任的英文是什么",
        request_id="req_negative_responsibility_phrase",
    )

    grounding = result.payload.grounding
    main_lemmas = [item["lemma"] for item in grounding["mainAnswer"]]

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert grounding["queryMode"] == "meaning_lookup"
    assert grounding["resolution"] == "resolved"
    assert main_lemmas[0] == "irresponsible"
    assert "responsible" not in main_lemmas
    assert provider.calls == []


def test_responsibility_expression_recall_does_not_admit_bare_responsibility_nouns():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("responsible", ["adj. 有责任的；负责的"], tag="ky"),
            ecdict_profile("responsibility", ["n. 责任；职责"], tag="ky"),
            ecdict_profile("liability", ["n. 责任；债务"], tag="ky"),
            ecdict_profile("duty", ["n. 责任；义务；职责"], tag="ky"),
        ],
    )
    service = AdvancedLookupService(
        repository=FakeRepository(
            meaning_error=StructuredLookupUnavailable("database unavailable"),
        ),
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="表示承担责任的词有哪些",
        request_id="req_responsibility_no_bare_nouns",
    )

    grounding = result.payload.grounding
    main_lemmas = [item["lemma"] for item in grounding["mainAnswer"]]
    light_lemmas = [item["lemma"] for item in grounding["lightCandidates"]]

    assert result.status_code == 200
    assert main_lemmas == ["responsible"]
    assert "responsibility" not in light_lemmas
    assert "liability" not in light_lemmas
    assert "duty" not in light_lemmas


def test_postgrad_word_family_intent_uses_ecdict_tagged_derivatives():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("respect", ["n. 尊重；方面", "v. 尊重"], tag="ky"),
            ecdict_profile("respectful", ["adj. 恭敬的；有礼貌的"], tag="ky"),
            ecdict_profile("respectable", ["adj. 体面的；值得尊敬的"], tag="ky"),
            ecdict_profile("respective", ["adj. 各自的；分别的"], tag="ky"),
            ecdict_profile("respectively", ["adv. 分别地；各自地"], tag="ky"),
            ecdict_profile("irrespective", ["adj. 不考虑的；无关的"], tag="ky"),
            ecdict_profile("self-respect", ["n. 自尊"], tag="ky"),
            ecdict_profile("rescue", ["v. 营救"], tag="ky"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="respect派生词",
        request_id="req_respect_family",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["learningIntentPlan"]["task"] == "word_family"
    assert grounding["broadAnswerPlan"]["presentation"] == "word_family_table"
    assert [item["lemma"] for item in grounding["mainAnswer"]][:4] == [
        "respect",
        "respectful",
        "respectable",
        "respective",
    ]
    assert "rescue" not in [item["lemma"] for item in grounding["lightCandidates"]]


def test_english_seed_expansion_wording_uses_ecdict_word_family_candidates():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("respect", ["n. 尊重；方面", "v. 尊重"], tag="ky"),
            ecdict_profile("respectful", ["adj. 恭敬的；有礼貌的"], tag="ky"),
            ecdict_profile("respectable", ["adj. 体面的；值得尊敬的"], tag="ky"),
            ecdict_profile("reduce", ["v. 减少；降低"], tag="ky"),
            ecdict_profile("reduction", ["n. 减少；降低"], tag="ky"),
            ecdict_profile("reduced", ["adj. 减少了的"], tag="ky"),
            ecdict_profile("reducer", ["n. 减速器；还原剂"], tag="ky"),
            ecdict_profile("consequence", ["n. 结果；后果"], tag="ky"),
            ecdict_profile("consequent", ["adj. 随之发生的"], tag="ky"),
            ecdict_profile("consequently", ["adv. 因此；结果"], tag="ky"),
            ecdict_profile("contribute", ["v. 贡献；投稿"], tag="ky"),
            ecdict_profile("contribution", ["n. 贡献；捐献"], tag="ky"),
            ecdict_profile("contributor", ["n. 贡献者；投稿人"], tag="ky"),
            ecdict_profile("responsible", ["adj. 有责任的；负责的"], tag="ky"),
            ecdict_profile("responsibility", ["n. 责任；职责"], tag="ky"),
            ecdict_profile("responsibly", ["adv. 负责地"], tag="ky"),
            ecdict_profile("rescue", ["v. 营救"], tag="ky"),
            ecdict_profile("redress", ["v. 纠正；补偿"], tag="ky"),
            ecdict_profile("sequence", ["n. 顺序"], tag="ky"),
            ecdict_profile("conduct", ["v. 进行；指挥"], tag="ky"),
            ecdict_profile("responsive", ["adj. 响应的"], tag="ky"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    cases = [
        ("respect的拓展词", {"respect", "respectful", "respectable"}, {"rescue"}),
        ("reduce的拓展词", {"reduce", "reduction", "reduced"}, {"redress"}),
        (
            "consequence相关词",
            {"consequence", "consequent", "consequently"},
            {"sequence"},
        ),
        (
            "contribute相关词",
            {"contribute", "contribution", "contributor"},
            {"conduct"},
        ),
        (
            "responsible的派生/拓展/相关词怎么分",
            {"responsible", "responsibility", "responsibly"},
            {"responsive"},
        ),
    ]

    for query, expected_lemmas, forbidden_lemmas in cases:
        result = service.answer(
            active_exam_target="postgrad",
            query=query,
            request_id=f"req_{query}",
        )

        grounding = result.payload.grounding
        main_lemmas = {item["lemma"] for item in grounding["mainAnswer"]}
        light_lemmas = {item["lemma"] for item in grounding["lightCandidates"]}

        assert result.status_code == 200
        assert result.payload.providerRequestId is None
        assert grounding["queryMode"] == "root_family_summary"
        assert grounding["resolution"] == "resolved"
        assert grounding["learningIntentPlan"]["task"] == "word_family"
        assert grounding["broadAnswerPlan"]["presentation"] == "word_family_table"
        assert expected_lemmas <= main_lemmas, query
        assert forbidden_lemmas.isdisjoint(light_lemmas), query

    assert provider.calls == []


def test_word_family_intent_backfills_tagged_derivatives_from_other_exam_scopes():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("respect", ["n. respect"], tag="ky"),
            ecdict_profile("respectful", ["adj. respectful"], tag="cet4 cet6"),
            ecdict_profile("respectable", ["adj. respectable"], tag="cet6"),
            ecdict_profile("respective", ["adj. respective"], tag="ky"),
            ecdict_profile("rescue", ["v. rescue"], tag="ky"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="respect\u6d3e\u751f\u8bcd",
        request_id="req_respect_family_cross_tag",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert [item["lemma"] for item in grounding["mainAnswer"]][:4] == [
        "respect",
        "respectful",
        "respectable",
        "respective",
    ]
    assert "rescue" not in [item["lemma"] for item in grounding["lightCandidates"]]


def test_respond_word_family_uses_respons_stem_from_ecdict():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("respond", ["v. 回答；响应"], tag="ky"),
            ecdict_profile("response", ["n. 回答；响应；反应"], tag="ky"),
            ecdict_profile("responsive", ["adj. 回答的；响应的"], tag="ky"),
            ecdict_profile("responsible", ["adj. 有责任的；负责的"], tag="ky"),
            ecdict_profile("responsibility", ["n. 责任；职责"], tag="ky"),
            ecdict_profile("correspond", ["v. 符合；通信"], tag="ky"),
            ecdict_profile("rescue", ["v. 营救"], tag="ky"),
        ],
    )
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(in_scope_entries=[]),
        provider=provider,
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="respond\u7684\u6d3e\u751f\u8bcd",
        request_id="req_respond_family",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert grounding["resolution"] == "resolved"
    assert grounding["learningIntentPlan"]["task"] == "word_family"
    assert grounding["broadAnswerPlan"]["presentation"] == "word_family_table"
    lemmas = [item["lemma"] for item in grounding["mainAnswer"]]
    light_lemmas = [item["lemma"] for item in grounding["lightCandidates"]]
    assert lemmas[:4] == [
        "respond",
        "response",
        "responsive",
        "responsible",
    ]
    assert "responsibility" in light_lemmas
    assert "correspond" not in light_lemmas
    assert "rescue" not in light_lemmas


def test_sign_word_family_excludes_shape_noise():
    provider = FakeProvider()
    service = AdvancedLookupService(
        repository=FakeRepository(
            in_scope_entries=[
                candidate("sign", ["v. 签名；示意"]),
                candidate("signal", ["n. 信号"]),
                candidate("signify", ["v. 表示；意味着"]),
                candidate("sigh", ["v. 叹气"]),
                candidate("sight", ["n. 视力；景象"]),
                candidate("scan", ["v. 扫描"]),
                candidate("sick", ["adj. 生病的"]),
            ],
        ),
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="sign\u7684\u6d3e\u751f\u8bcd\u6709\u54ea\u4e9b",
        request_id="req_sign_family",
    )

    grounding = result.payload.grounding
    lemmas = [item["lemma"] for item in grounding["mainAnswer"]]
    light_lemmas = [item["lemma"] for item in grounding["lightCandidates"]]

    assert "sign" in lemmas
    assert "signal" in lemmas
    assert "signify" in lemmas
    assert "sigh" not in lemmas
    assert "sight" not in lemmas
    assert "scan" not in lemmas
    assert "sick" not in lemmas
    assert "sigh" not in light_lemmas
    assert "sight" not in light_lemmas
    assert "scan" not in light_lemmas
    assert "sick" not in light_lemmas
    assert result.payload.providerRequestId is None
    assert provider.calls == []


def test_produce_word_family_excludes_loose_pro_prefix_words():
    ecdict_lookup = SearchableEcdictLookup(
        [
            ecdict_profile("produce", ["v. 生产；制造"], tag="cet6"),
            ecdict_profile("product", ["n. 产品；结果"], tag="cet6"),
            ecdict_profile("productive", ["adj. 多产的；有效益的"], tag="cet6"),
            ecdict_profile("reproduce", ["v. 复制；繁殖"], tag="cet6"),
        ],
    )
    service = AdvancedLookupService(
        repository=FakeRepository(
            in_scope_entries=[
                candidate("provide", ["v. 提供"]),
                candidate("propose", ["v. 提议"]),
                candidate("project", ["n. 项目；v. 投射"]),
                candidate("promote", ["v. 促进；提升"]),
            ],
        ),
        provider=FakeProvider(),
        ecdict_lookup=ecdict_lookup,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="produce\u7684\u540c\u6839\u8bcd\u6216\u6d3e\u751f\u8bcd",
        request_id="req_produce_family",
    )

    grounding = result.payload.grounding
    lemmas = [item["lemma"] for item in grounding["mainAnswer"]]
    light_lemmas = [item["lemma"] for item in grounding["lightCandidates"]]

    assert "produce" in lemmas
    assert "product" in lemmas
    assert "productive" in lemmas
    assert "reproduce" in lemmas
    assert "provide" not in lemmas
    assert "propose" not in lemmas
    assert "project" not in lemmas
    assert "promote" not in lemmas
    assert "provide" not in light_lemmas
    assert "propose" not in light_lemmas
    assert "project" not in light_lemmas
    assert "promote" not in light_lemmas


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
