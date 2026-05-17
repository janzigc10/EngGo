from backend.app.answering.advanced_lookup import (
    AdvancedLookupService,
    root_fragment_query,
)
from backend.app.answering.provider import GenerateAnswerResult
from backend.app.content.ecdict import EcdictBasicProfile
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


def ecdict_profile(lemma: str, meanings: list[str], *, tag: str = "") -> EcdictBasicProfile:
    return EcdictBasicProfile(
        canonical=lemma,
        lookup_key=lemma,
        entry_kind="word",
        match_kind="exact",
        meanings=meanings,
        raw_translation="\n".join(meanings),
        tag=tag,
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
    assert grounding["supportLabel"] == "基于 ECDICT 考研标签候选总结"
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
    assert grounding["supportLabel"] == "基于 ECDICT 考研标签候选总结"
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
    assert grounding["supportLabel"] == "基于 ECDICT 考研标签候选总结"
    assert [item["lemma"] for item in grounding["mainAnswer"]] == [
        "aspire",
        "expire",
        "inspire",
    ]
    assert {
        item["sourceKind"]
        for item in grounding["mainAnswer"]
    } == {"external_dictionary_basic"}
    assert "spire" not in [item["lemma"] for item in grounding["lightCandidates"]]
    assert [
        item["scopeCodes"]
        for item in grounding["mainAnswer"]
    ] == [["postgrad"], ["postgrad"], ["postgrad"]]
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
    assert grounding["supportLabel"] == "基于 ECDICT 考研标签候选总结"
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
