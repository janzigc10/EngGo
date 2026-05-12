from backend.app.answering.broad_vocab import (
    build_broad_vocab_grounding,
    build_broad_vocab_system_prompt,
)
from backend.app.retrieval.dynamic_light_grounding import (
    LightGroundingCandidate,
    LightGroundingSignal,
)
from backend.app.retrieval.normalize_query import normalize_query


def light_candidate(
    lemma,
    *,
    signals=None,
    meanings=None,
    score=100,
    part_of_speech="n.",
    source_kind="structured",
):
    return LightGroundingCandidate(
        entry_id=lemma,
        lemma=lemma,
        meanings_zh=[f"{lemma} meaning"] if meanings is None else meanings,
        scope_codes=["cet6"],
        in_scope=True,
        reason="test",
        score=score,
        part_of_speech=part_of_speech,
        source_kind=source_kind,
        signals=signals or [LightGroundingSignal("prefix", 110, "comm")],
        structured_group_ids=[],
    )


def test_collection_queries_get_map_budget_instead_of_six_item_slice():
    query = "\u0063\u006f\u006d\u006d \u5f00\u5934\u7684\u5355\u8bcd\u603b\u7ed3"
    candidates = [
        light_candidate(f"commword{index}", score=200 - index)
        for index in range(14)
    ]

    grounding = build_broad_vocab_grounding(
        active_exam_target="cet6",
        query=query,
        normalized_query=normalize_query(query),
        candidates=candidates,
    )

    plan = grounding["broadAnswerPlan"]

    assert plan["style"] == "collection_map"
    assert plan["candidateBudget"]["groups"] == "3-5"
    assert plan["candidateBudget"]["terms"] == "12-20"
    assert len(grounding["mainAnswer"]) == 14
    assert grounding["selectedMainTerms"] == [item.lemma for item in candidates]


def test_focused_compare_queries_keep_explicit_terms_tight():
    query = (
        "\u0063\u006f\u006d\u006d\u0065\u006e\u0064 "
        "\u0063\u006f\u006d\u006d\u0065\u006e\u0074 "
        "\u0063\u006f\u006d\u006d\u0061\u006e\u0064 "
        "\u600e\u4e48\u533a\u5206"
    )
    candidates = [
        light_candidate("commend", signals=[LightGroundingSignal("exact", 500, "commend")]),
        light_candidate("comment", signals=[LightGroundingSignal("exact", 499, "comment")]),
        light_candidate(
            "command",
            meanings=[],
            source_kind="source_lemma",
            signals=[LightGroundingSignal("exact", 498, "command")],
        ),
        light_candidate("commence"),
        light_candidate("common"),
        light_candidate("comma"),
        light_candidate("commune"),
    ]

    grounding = build_broad_vocab_grounding(
        active_exam_target="cet6",
        query=query,
        normalized_query=normalize_query(query),
        candidates=candidates,
    )

    plan = grounding["broadAnswerPlan"]

    assert plan["style"] == "focused_compare"
    assert plan["candidateBudget"]["terms"] == "3-5"
    assert plan["answerableLemmas"] == [
        "commend",
        "comment",
        "command",
        "commence",
        "common",
    ]
    assert plan["candidateOnlyLemmas"] == []
    assert [item["lemma"] for item in grounding["mainAnswer"]] == [
        "commend",
        "comment",
        "command",
        "commence",
        "common",
    ]


def test_broad_prompt_blocks_learning_card_tail_and_invented_mnemonics():
    prompt = build_broad_vocab_system_prompt()

    assert "collection_map" in prompt
    assert "focused_compare" in prompt
    assert "Do not invent mnemonics" in prompt
    assert "Do not end with a follow-up invitation" in prompt
    assert "3-5 learning groups" in prompt
    assert "Do not use emoji" in prompt
    assert "Do not mention suppressedCandidateLemmas" in prompt
    assert "Do not use markdown tables" in prompt
    assert "Do not add collocations, usage columns, example phrases, or derived forms" in prompt
    assert "Do not repeat activeExamTargetLabel or supportLabel" in prompt
    assert "include partOfSpeech" in prompt
    assert "include one short meaning from meaningsZh" in prompt


def test_broad_plan_blocks_tables_collocations_and_scope_repetition():
    query = "\u0074\u0069\u006f\u006e \u7ed3\u5c3e\u7684\u8bcd\u6709\u54ea\u4e9b"
    grounding = build_broad_vocab_grounding(
        active_exam_target="cet6",
        query=query,
        normalized_query=normalize_query(query),
        candidates=[
            light_candidate(
                "action",
                signals=[LightGroundingSignal("suffix", 110, "tion")],
            ),
            light_candidate(
                "motion",
                signals=[LightGroundingSignal("suffix", 110, "tion")],
            ),
        ],
    )

    rules = "\n".join(grounding["broadAnswerPlan"]["rules"])

    assert "Use short grouped bullet lists; do not use markdown tables." in rules
    assert "Do not add collocations, usage columns, example phrases, or derived forms." in rules
    assert "Do not repeat activeExamTargetLabel or supportLabel in the answer body." in rules
    assert "For each answerable term, include partOfSpeech plus one short meaning from meaningsZh." in rules
    assert "For each answerable term, include one short meaning from meaningsZh." in rules


def test_collection_plan_suppresses_weak_shape_noise():
    query = "\u0063\u006f\u006d\u006d \u5f00\u5934\u7684\u5355\u8bcd\u603b\u7ed3"
    grounding = build_broad_vocab_grounding(
        active_exam_target="cet6",
        query=query,
        normalized_query=normalize_query(query),
        candidates=[
            light_candidate("comment"),
            light_candidate(
                "comply",
                signals=[LightGroundingSignal("common_prefix", 36, "comm")],
            ),
            light_candidate(
                "curb",
                signals=[LightGroundingSignal("edit_distance", 20, "comm:3")],
            ),
        ],
    )

    plan = grounding["broadAnswerPlan"]

    assert plan["answerableLemmas"] == ["comment"]
    assert plan["suppressedCandidateLemmas"] == ["comply", "curb"]


def test_collection_plan_keeps_source_only_no_meaning_as_candidate_only():
    query = "\u0074\u0069\u006f\u006e \u7ed3\u5c3e\u7684\u8bcd\u6709\u54ea\u4e9b"
    source_only = light_candidate(
        "ination",
        meanings=[],
        source_kind="source_lemma",
        signals=[LightGroundingSignal("suffix", 110, "tion")],
    )
    grounding = build_broad_vocab_grounding(
        active_exam_target="cet6",
        query=query,
        normalized_query=normalize_query(query),
        candidates=[
            light_candidate(
                "action",
                signals=[LightGroundingSignal("suffix", 110, "tion")],
            ),
            source_only,
        ],
    )

    plan = grounding["broadAnswerPlan"]

    assert plan["answerableLemmas"] == ["action"]
    assert plan["candidateOnlyLemmas"] == ["ination"]
