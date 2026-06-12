from backend.app.content.ecdict import EcdictBasicProfile
from backend.app.retrieval.dynamic_light_grounding import (
    LightGroundingSignal,
    build_light_grounding_candidates,
    merge_dynamic_vocabulary,
    source_lemma_vocabulary,
)
from backend.app.retrieval.normalize_query import normalize_query
from backend.app.retrieval.types import (
    ConfusionGroup,
    ConfusionGroupMember,
    RetrievalCandidate,
)


def candidate(
    lemma,
    meanings=None,
    *,
    part_of_speech="v.",
    scope_codes=None,
    source_kind="structured",
    semantic_match_hints=None,
):
    scopes = scope_codes or ["cet6"]

    return RetrievalCandidate(
        entry_id=f"{source_kind}:{lemma}",
        lemma=lemma,
        meanings_zh=meanings or [f"{lemma} meaning"],
        matched_alias=None,
        scope_codes=scopes,
        in_scope="cet6" in scopes,
        reason="test candidate",
        score=100,
        part_of_speech=part_of_speech,
        source_kind=source_kind,
        semantic_match_hints=semantic_match_hints or [],
    )


def group(group_id, members):
    return ConfusionGroup(
        id=group_id,
        teach_first_entry_id=members[0].entry_id,
        why_confusing="old curated relation",
        common_misuse_points=[],
        semantic_boundary_notes=[],
        labels=["shape_like"],
        purposes=["confusion_untangle"],
        anchor_pattern=None,
        quick_distinction=None,
        exam_hook=None,
        members=[
            ConfusionGroupMember(
                candidate=member,
                ordinal=index,
                emphasis_note=None,
            )
            for index, member in enumerate(members)
        ],
    )


def signal_types(light_candidate):
    return {signal.type for signal in light_candidate.signals}


def ecdict_profile(lemma: str, meanings: list[str]) -> EcdictBasicProfile:
    return EcdictBasicProfile(
        canonical=lemma,
        lookup_key=lemma,
        entry_kind="word",
        match_kind="exact",
        meanings=meanings,
        raw_translation="\n".join(meanings),
        tag="",
    )


def test_explicit_shape_terms_rank_first_with_shape_signals():
    vocabulary = [
        candidate("commander", ["指挥官"], part_of_speech="n."),
        candidate("commend", ["嘉奖；推荐"]),
        candidate("comment", ["评论"], part_of_speech="n. / v."),
        candidate("command", ["命令；指挥"], part_of_speech="n. / v."),
        candidate("commerce", ["商业"], part_of_speech="n."),
        candidate("common", ["常见的"], part_of_speech="adj."),
    ]

    result = build_light_grounding_candidates(
        query="commend、comment、command 这几个很像，怎么区分",
        active_exam_target="cet6",
        vocabulary=vocabulary,
        groups=[],
    )

    assert [item.lemma for item in result[:3]] == ["commend", "comment", "command"]
    for item in result[:3]:
        signals = signal_types(item)
        assert "exact" in signals
        assert {"edit_distance", "ngram_overlap", "common_prefix"} & signals


def test_prefix_query_keeps_scope_and_prefers_prefix_candidates():
    vocabulary = [
        candidate("concept", ["概念"], part_of_speech="n."),
        candidate("confirm", ["确认"]),
        candidate("conform", ["遵从"]),
        candidate("content", ["内容"], part_of_speech="n."),
        candidate("context", ["语境"], part_of_speech="n."),
        candidate("recent", ["最近的"], part_of_speech="adj."),
        candidate("convention", ["惯例"], scope_codes=["postgrad"]),
    ]

    result = build_light_grounding_candidates(
        query="con 开头的词太多了，哪些最容易混在一起",
        active_exam_target="cet6",
        vocabulary=vocabulary,
        groups=[],
    )

    lemmas = [item.lemma for item in result]

    assert lemmas[:5] == ["concept", "confirm", "conform", "content", "context"]
    assert "recent" not in lemmas
    assert "convention" not in lemmas
    assert all("prefix" in signal_types(item) for item in result)


def test_prefix_query_with_cooperation_meaning_adds_semantic_signal():
    vocabulary = [
        candidate("coach", ["教练；训练"], part_of_speech="n. / v."),
        candidate("coal", ["煤"], part_of_speech="n."),
        candidate("cooperate", ["合作；协力；配合"]),
        candidate("cooperative", ["合作的；合作社的"], part_of_speech="adj."),
        candidate("corporation", ["公司；合作；法人团体"], part_of_speech="n."),
    ]

    result = build_light_grounding_candidates(
        query="co开头的意思是合作的单词",
        active_exam_target="cet6",
        vocabulary=vocabulary,
        groups=[],
    )

    lemmas = [item.lemma for item in result]

    assert lemmas[:2] == ["cooperate", "cooperative"]
    assert all("meaning_keyword" in signal_types(item) for item in result[:2])
    corporation = next(item for item in result if item.lemma == "corporation")
    assert "meaning_keyword" not in signal_types(corporation)


def test_intent_plan_hard_filters_prefix_suffix_candidates():
    vocabulary = [
        candidate("reconcile", ["使和解"], part_of_speech="vt."),
        candidate("recite", ["背诵"], part_of_speech="v."),
        candidate("reptile", ["爬行动物"], part_of_speech="n."),
        candidate("facile", ["容易的"], part_of_speech="adj."),
    ]
    plan = normalize_query("re开头cile结尾的单词").intent_plan

    result = build_light_grounding_candidates(
        query="re开头cile结尾的单词",
        active_exam_target="cet6",
        vocabulary=vocabulary,
        groups=[],
        intent_plan=plan,
    )

    assert [item.lemma for item in result] == ["reconcile"]
    assert {"prefix", "suffix"} <= signal_types(result[0])


def test_intent_plan_hard_filters_prefix_meaning_candidates():
    vocabulary = [
        candidate("coach", ["教练；训练"], part_of_speech="n. / v."),
        candidate("coal", ["煤"], part_of_speech="n."),
        candidate("cooperate", ["合作；协力；配合"]),
        candidate("cooperative", ["合作的；合作社的"], part_of_speech="adj."),
        candidate("corporation", ["公司；合作；法人团体"], part_of_speech="n."),
    ]
    plan = normalize_query("co开头的意思是合作的单词").intent_plan

    result = build_light_grounding_candidates(
        query="co开头的意思是合作的单词",
        active_exam_target="cet6",
        vocabulary=vocabulary,
        groups=[],
        intent_plan=plan,
    )

    assert [item.lemma for item in result] == ["cooperate", "cooperative"]
    assert all("meaning_keyword" in signal_types(item) for item in result)


def test_pre_meaning_does_not_match_pressure():
    vocabulary = [
        candidate("precede", ["先于；在...之前"]),
        candidate("prevent", ["预防；阻止"]),
        candidate("pressure", ["压力；施压"], part_of_speech="n. / v."),
    ]
    plan = normalize_query("pre开头表示提前或预先的单词").intent_plan

    result = build_light_grounding_candidates(
        query="pre开头表示提前或预先的单词",
        active_exam_target="cet6",
        vocabulary=vocabulary,
        groups=[],
        intent_plan=plan,
    )

    assert [item.lemma for item in result] == ["precede", "prevent"]


def test_anti_meaning_filter_excludes_form_only_prefix_words():
    vocabulary = [
        candidate("antiwar", ["反战的"], part_of_speech="adj."),
        candidate("antibody", ["抗体"], part_of_speech="n."),
        candidate("antique", ["古董"], part_of_speech="n. / adj."),
        candidate("anticipate", ["预料；预期"]),
    ]
    plan = normalize_query("anti开头表示反对的词").intent_plan

    result = build_light_grounding_candidates(
        query="anti开头表示反对的词",
        active_exam_target="cet6",
        vocabulary=vocabulary,
        groups=[],
        intent_plan=plan,
    )

    lemmas = [item.lemma for item in result]

    assert lemmas == ["antiwar", "antibody"]
    assert all("meaning_keyword" in signal_types(item) for item in result)


def test_re_meaning_filter_excludes_reconcile_when_query_means_again():
    vocabulary = [
        candidate("rewrite", ["重写"]),
        candidate("renew", ["重新开始；更新"]),
        candidate("reconsider", ["重新考虑"]),
        candidate("reconcile", ["使和解；调停；使一致"]),
    ]
    plan = normalize_query("re开头表示再次的词").intent_plan

    result = build_light_grounding_candidates(
        query="re开头表示再次的词",
        active_exam_target="cet6",
        vocabulary=vocabulary,
        groups=[],
        intent_plan=plan,
    )

    lemmas = [item.lemma for item in result]

    assert set(lemmas) == {"rewrite", "renew", "reconsider"}
    assert "reconcile" not in lemmas


def test_sub_and_trans_meaning_filters_require_semantic_evidence():
    vocabulary = [
        candidate("subconscious", ["下意识的"], part_of_speech="adj."),
        candidate("subzero", ["零度以下的"], part_of_speech="adj."),
        candidate("subject", ["主题；科目"], part_of_speech="n."),
        candidate("transatlantic", ["横越大西洋的"], part_of_speech="adj."),
        candidate("transmit", ["传送；传播"]),
        candidate("transaction", ["交易"], part_of_speech="n."),
    ]

    sub_result = build_light_grounding_candidates(
        query="sub开头表示下面的词",
        active_exam_target="cet6",
        vocabulary=vocabulary,
        groups=[],
        intent_plan=normalize_query("sub开头表示下面的词").intent_plan,
    )
    trans_result = build_light_grounding_candidates(
        query="trans开头表示跨越的词",
        active_exam_target="cet6",
        vocabulary=vocabulary,
        groups=[],
        intent_plan=normalize_query("trans开头表示跨越的词").intent_plan,
    )

    assert [item.lemma for item in sub_result] == ["subconscious", "subzero"]
    assert {item.lemma for item in trans_result} == {"transatlantic", "transmit"}
    assert "subject" not in [item.lemma for item in sub_result]
    assert "transaction" not in [item.lemma for item in trans_result]


def test_suffix_meaning_filters_exclude_same_suffix_noise():
    vocabulary = [
        candidate("hopeless", ["没有希望的"], part_of_speech="adj."),
        candidate("useless", ["无用的"], part_of_speech="adj."),
        candidate("unless", ["除非"], part_of_speech="conj."),
        candidate("teacher", ["教师"], part_of_speech="n."),
        candidate("worker", ["工人"], part_of_speech="n."),
        candidate("administer", ["管理；执行", "执行遗产管理人的职责"], part_of_speech="v."),
        candidate("better", ["较好的"], part_of_speech="adj. / adv."),
        candidate("water", ["水"], part_of_speech="n."),
    ]

    less_result = build_light_grounding_candidates(
        query="less结尾表示没有的词",
        active_exam_target="cet6",
        vocabulary=vocabulary,
        groups=[],
        intent_plan=normalize_query("less结尾表示没有的词").intent_plan,
    )
    er_result = build_light_grounding_candidates(
        query="er结尾表示人的词",
        active_exam_target="cet6",
        vocabulary=vocabulary,
        groups=[],
        intent_plan=normalize_query("er结尾表示人的词").intent_plan,
    )

    assert {item.lemma for item in less_result} == {"hopeless", "useless"}
    assert {item.lemma for item in er_result} == {"teacher", "worker"}
    assert "unless" not in [item.lemma for item in less_result]
    assert "administer" not in [item.lemma for item in er_result]
    assert "better" not in [item.lemma for item in er_result]
    assert "water" not in [item.lemma for item in er_result]


def test_restrict_semantic_filter_keeps_primary_meaning_conservative():
    vocabulary = [
        candidate("confine", ["\u9650\u5236, \u4f7f\u4e0d\u5916\u51fa, \u7981\u95ed"]),
        candidate("constrain", ["\u5f3a\u8feb, \u9650\u5236, \u5173\u62bc"]),
        candidate("conscript", ["\u5f3a\u8feb\u5165\u4f0d"]),
        candidate("contain", ["\u5305\u542b, \u5bb9\u7eb3, \u63a7\u5236"]),
    ]
    plan = normalize_query("\u8868\u793a\u9650\u5236\u6216\u7ea6\u675f\u7684con\u5f00\u5934\u5355\u8bcd").intent_plan

    result = build_light_grounding_candidates(
        query="\u8868\u793a\u9650\u5236\u6216\u7ea6\u675f\u7684con\u5f00\u5934\u5355\u8bcd",
        active_exam_target="postgrad",
        vocabulary=vocabulary,
        groups=[],
        intent_plan=plan,
    )

    assert [item.lemma for item in result] == ["confine"]
    assert "constrain" not in [item.lemma for item in result]
    assert "conscript" not in [item.lemma for item in result]
    assert "contain" not in [item.lemma for item in result]


def test_hidden_semantic_hint_does_not_create_public_meaning_signal():
    vocabulary = [
        candidate(
            "constrain",
            ["\u5f3a\u8feb, \u9650\u5236, \u5173\u62bc"],
            semantic_match_hints=["\u9650\u5236"],
        ),
        candidate("conscript", ["\u5f3a\u8feb\u5165\u4f0d"]),
    ]
    plan = normalize_query("\u8868\u793a\u9650\u5236\u6216\u7ea6\u675f\u7684con\u5f00\u5934\u5355\u8bcd").intent_plan

    result = build_light_grounding_candidates(
        query="\u8868\u793a\u9650\u5236\u6216\u7ea6\u675f\u7684con\u5f00\u5934\u5355\u8bcd",
        active_exam_target="postgrad",
        vocabulary=vocabulary,
        groups=[],
        intent_plan=plan,
    )

    assert [item.lemma for item in result] == ["constrain"]
    assert "meaning_keyword" not in signal_types(result[0])
    assert "meaning_keyword" not in result[0].reason
    assert all(
        signal["type"] != "meaning_keyword"
        for signal in result[0].to_json()["signals"]
    )
    assert all(
        signal["type"] != "_semantic_match_hint"
        for signal in result[0].to_json()["signals"]
    )


def test_meaning_query_prioritizes_core_semantic_matches():
    vocabulary = [
        candidate("request", ["请求；要求"]),
        candidate("require", ["要求；需要"]),
        candidate("demand", ["强烈要求"]),
        candidate("claim", ["声称；索赔"], part_of_speech="n. / v."),
        candidate("command", ["命令；指挥"], part_of_speech="n. / v."),
        candidate("belief", ["信念"], part_of_speech="n."),
    ]

    result = build_light_grounding_candidates(
        query="表示要求别人做事的词有哪些容易混",
        active_exam_target="cet6",
        vocabulary=vocabulary,
        groups=[],
    )

    lemmas = [item.lemma for item in result]

    assert lemmas[:3] == ["demand", "request", "require"]
    assert "belief" not in lemmas
    assert all("meaning_keyword" in signal_types(item) for item in result[:3])


def test_review_meaning_query_excludes_broad_opinion_nouns():
    vocabulary = [
        candidate("assess", ["评价；评估"]),
        candidate("comment", ["发表意见；评论"], part_of_speech="n. / v."),
        candidate("evaluate", ["评价；评估"]),
        candidate("review", ["复习；审查；评论"], part_of_speech="v. / n."),
        candidate("attitude", ["态度；看法"], part_of_speech="n."),
        candidate("belief", ["信念；看法"], part_of_speech="n."),
    ]

    result = build_light_grounding_candidates(
        query="表示评论、评价的词有哪些容易混",
        active_exam_target="cet6",
        vocabulary=vocabulary,
        groups=[],
    )

    lemmas = [item.lemma for item in result]

    assert lemmas == ["assess", "comment", "evaluate", "review"]
    assert "attitude" not in lemmas
    assert "belief" not in lemmas
    assert all("meaning_keyword" in signal_types(item) for item in result)


def test_curated_group_boosts_without_being_required():
    recent = candidate("recent", ["最近的"], part_of_speech="adj.")
    resent = candidate("resent", ["怨恨"])
    decent = candidate("decent", ["得体的"], part_of_speech="adj.")
    receipt = candidate("receipt", ["收据"], part_of_speech="n.")

    without_group = build_light_grounding_candidates(
        query="recent 这个词我总看错，附近有哪些像它的词",
        active_exam_target="cet6",
        vocabulary=[recent, resent, decent, receipt],
        groups=[],
    )
    with_group = build_light_grounding_candidates(
        query="recent 这个词我总看错，附近有哪些像它的词",
        active_exam_target="cet6",
        vocabulary=[recent, resent, decent, receipt],
        groups=[group("recent-resent", [recent, resent])],
    )

    assert "resent" in [item.lemma for item in without_group]
    assert "resent" in [item.lemma for item in with_group]

    resent_result = next(item for item in with_group if item.lemma == "resent")
    assert "structured_group" in signal_types(resent_result)
    assert resent_result.structured_group_ids == ["recent-resent"]


def test_curated_group_does_not_admit_group_only_candidates():
    require = candidate("require", ["要求；需要"])
    belief = candidate("belief", ["信念"], part_of_speech="n.")

    result = build_light_grounding_candidates(
        query="表示要求别人做事的词有哪些容易混",
        active_exam_target="cet6",
        vocabulary=[require, belief],
        groups=[group("require-belief", [require, belief])],
    )

    assert [item.lemma for item in result] == ["require"]
    assert "structured_group" in signal_types(result[0])


def test_light_grounding_signals_are_structured_dataclasses():
    result = build_light_grounding_candidates(
        query="recent 这个词我总看错，附近有哪些像它的词",
        active_exam_target="cet6",
        vocabulary=[
            candidate("recent", ["最近的"], part_of_speech="adj."),
            candidate("resent", ["怨恨"]),
        ],
        groups=[],
    )

    assert isinstance(result[0].signals[0], LightGroundingSignal)
    assert result[0].to_json()["signals"][0]["type"] == result[0].signals[0].type


def test_source_lemma_vocabulary_and_structured_merge(tmp_path):
    source_dir = tmp_path / "source-lemmas"
    source_dir.mkdir()
    (source_dir / "gaokao-2020-lemmas.txt").write_text("access\n", encoding="utf-8")
    (source_dir / "cet-2016-lemmas.tsv").write_text(
        "lemma\tsource_scope\naccent\tcet4\njournal\tcet6-extra\n",
        encoding="utf-8",
    )

    source_candidates = source_lemma_vocabulary(
        active_exam_target="cet6",
        source_lemma_base_dir=tmp_path,
    )
    source_by_lemma = {item.lemma: item for item in source_candidates}

    assert source_by_lemma["accent"].scope_codes == ["cet4", "cet6"]
    assert source_by_lemma["journal"].scope_codes == ["cet6"]

    structured_accent = candidate("accent", ["重音"], part_of_speech="n.")
    merged = merge_dynamic_vocabulary(
        structured_candidates=[structured_accent],
        source_candidates=source_candidates,
    )
    merged_by_lemma = {item.lemma: item for item in merged}

    assert merged_by_lemma["accent"] is structured_accent
    assert merged_by_lemma["journal"].source_kind == "source_lemma"
    postgrad_source = source_lemma_vocabulary(
        active_exam_target="postgrad",
        source_lemma_base_dir=tmp_path,
    )
    assert {item.lemma for item in postgrad_source} == {"access", "accent", "journal"}


def test_source_lemma_vocabulary_derives_pos_from_ecdict_meanings(tmp_path):
    source_dir = tmp_path / "source-lemmas"
    source_dir.mkdir()
    (source_dir / "gaokao-2020-lemmas.txt").write_text("", encoding="utf-8")
    (source_dir / "cet-2016-lemmas.tsv").write_text(
        "lemma\tsource_scope\ncommand\tcet6-extra\naction\tcet6-extra\nstructural\tcet6-extra\n",
        encoding="utf-8",
    )

    source_candidates = source_lemma_vocabulary(
        active_exam_target="cet6",
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda lemma: {
            "command": ecdict_profile(
                "command",
                ["n. 命令, 指挥", "v. 命令, 指挥"],
            ),
            "action": ecdict_profile(
                "action",
                ["n. 行动, 动作", "vt. 对...起诉"],
            ),
            "structural": ecdict_profile(
                "structural",
                ["a. 结构的, 建筑的"],
            ),
        }.get(lemma),
    )
    source_by_lemma = {item.lemma: item for item in source_candidates}

    assert source_by_lemma["command"].part_of_speech == "n. / v."
    assert source_by_lemma["action"].part_of_speech == "n. / vt."
    assert source_by_lemma["structural"].part_of_speech == "adj."
    assert source_by_lemma["structural"].meanings_zh == ["结构的, 建筑的"]
