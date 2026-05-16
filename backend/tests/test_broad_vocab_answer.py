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
    assert plan["presentation"] == "inventory_table"
    assert plan["candidateBudget"]["groups"] == "0"
    assert plan["candidateBudget"]["terms"] == "12-20"
    assert len(grounding["mainAnswer"]) == 14
    assert grounding["selectedMainTerms"] == [item.lemma for item in candidates]


def test_collection_plan_defaults_to_inventory_table_without_forced_groups():
    query = "\u0063\u006f\u006d\u006d \u5f00\u5934\u7684\u5355\u8bcd\u603b\u7ed3"
    candidates = [
        light_candidate(
            "command",
            meanings=["\u547d\u4ee4\uff1b\u6307\u6325"],
            part_of_speech="n./v.",
            signals=[
                LightGroundingSignal("prefix", 110, "comm"),
                LightGroundingSignal("common_prefix", 60, "comm"),
                LightGroundingSignal("ngram_overlap", 45, "command/comment"),
            ],
        ),
        light_candidate(
            "comment",
            meanings=["\u8bc4\u8bba"],
            part_of_speech="n./v.",
            signals=[
                LightGroundingSignal("prefix", 109, "comm"),
                LightGroundingSignal("common_prefix", 60, "comm"),
                LightGroundingSignal("ngram_overlap", 45, "comment/command"),
            ],
        ),
        light_candidate(
            "commend",
            meanings=["\u79f0\u8d5e\uff1b\u63a8\u8350"],
            part_of_speech="vt.",
            signals=[
                LightGroundingSignal("prefix", 108, "comm"),
                LightGroundingSignal("common_prefix", 60, "comm"),
                LightGroundingSignal("ngram_overlap", 44, "commend/comment"),
            ],
        ),
        light_candidate(
            "commander",
            signals=[LightGroundingSignal("prefix", 80, "comm")],
        ),
        light_candidate(
            "commemorate",
            signals=[LightGroundingSignal("prefix", 79, "comm")],
        ),
    ]

    grounding = build_broad_vocab_grounding(
        active_exam_target="cet6",
        query=query,
        normalized_query=normalize_query(query),
        candidates=candidates,
    )

    plan = grounding["broadAnswerPlan"]
    sections = plan["candidateSections"]

    assert plan["presentation"] == "inventory_table"
    assert sections[0]["role"] == "inventory_terms"
    assert sections[0]["lemmas"] == [
        "command",
        "comment",
        "commend",
        "commander",
        "commemorate",
    ]
    assert (
        plan["candidateBudget"]["rule"]
        == "Use a compact inventory table with word, POS, and meaning only."
    )


def test_broad_grounding_normalizes_part_of_speech_to_abbreviations():
    query = "\u0063\u006f\u006d\u006d \u5f00\u5934\u7684\u5355\u8bcd\u603b\u7ed3"
    grounding = build_broad_vocab_grounding(
        active_exam_target="cet6",
        query=query,
        normalized_query=normalize_query(query),
        candidates=[
            light_candidate(
                "comment",
                part_of_speech="noun / verb",
            ),
            light_candidate(
                "common",
                part_of_speech="adjective",
            ),
        ],
    )

    assert [item["partOfSpeech"] for item in grounding["mainAnswer"]] == [
        "n. / v.",
        "adj.",
    ]


def test_collection_confusion_cues_still_use_simple_inventory_table():
    query = "\u0063\u006f\u006d\u006d \u5f00\u5934\u54ea\u4e9b\u8bcd\u5bb9\u6613\u6df7"
    grounding = build_broad_vocab_grounding(
        active_exam_target="cet6",
        query=query,
        normalized_query=normalize_query(query),
        candidates=[
            light_candidate(
                "command",
                signals=[
                    LightGroundingSignal("prefix", 110, "comm"),
                    LightGroundingSignal("ngram_overlap", 45, "command/comment"),
                ],
            ),
            light_candidate(
                "comment",
                signals=[
                    LightGroundingSignal("prefix", 109, "comm"),
                    LightGroundingSignal("ngram_overlap", 45, "comment/command"),
                ],
            ),
            light_candidate(
                "community",
                signals=[LightGroundingSignal("prefix", 80, "comm")],
            ),
        ],
    )

    plan = grounding["broadAnswerPlan"]

    assert plan["presentation"] == "inventory_table"
    assert plan["candidateSections"] == [
        {"role": "inventory_terms", "lemmas": ["command", "comment", "community"]},
    ]
    assert (
        plan["candidateBudget"]["rule"]
        == "Use a compact inventory table with word, POS, and meaning only."
    )


def test_meaning_confusion_queries_use_short_list_plus_note_shape():
    query = "\u8868\u793a\u8bc4\u8bba\u3001\u8bc4\u4ef7\u7684\u8bcd\u6709\u54ea\u4e9b\u5bb9\u6613\u6df7"
    grounding = build_broad_vocab_grounding(
        active_exam_target="cet6",
        query=query,
        normalized_query=normalize_query(query),
        candidates=[
            light_candidate(
                "assess",
                meanings=["\u8bc4\u4ef7\uff1b\u8bc4\u4f30"],
                part_of_speech="v.",
                signals=[LightGroundingSignal("meaning_keyword", 105, "\u8bc4\u4ef7")],
            ),
            light_candidate(
                "comment",
                meanings=["\u8bc4\u8bba"],
                part_of_speech="n. / v.",
                signals=[LightGroundingSignal("meaning_keyword", 105, "\u8bc4\u8bba")],
            ),
            light_candidate(
                "evaluate",
                meanings=["\u8bc4\u4ef7\uff1b\u8bc4\u4f30"],
                part_of_speech="v.",
                signals=[LightGroundingSignal("meaning_keyword", 105, "\u8bc4\u4ef7")],
            ),
        ],
    )

    plan = grounding["broadAnswerPlan"]
    rules = "\n".join(plan["rules"])

    assert plan["style"] == "meaning_core"
    assert plan["presentation"] == "meaning_confusion_list"
    assert plan["candidateBudget"]["rule"] == (
        "Use a compact word + POS + short meaning list, then one 注意 sentence."
    )
    assert "For meaning_confusion_list, list each term as word + POS + short meaning." in rules
    assert "Put each term on its own line; do not combine multiple terms in one sentence." in rules
    assert "After the list, add exactly one 注意 sentence for the core boundary." in rules
    assert "Do not add an opening sentence, examples, collocations, or paragraph-style explanations." in rules


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
    assert plan["candidateBudget"]["terms"] == "explicit terms only"
    assert plan["candidateBudget"]["rule"] == "Answer only the exact user-mentioned terms."
    assert plan["answerableLemmas"] == [
        "commend",
        "comment",
        "command",
    ]
    assert plan["candidateOnlyLemmas"] == []
    assert "commence" in plan["suppressedCandidateLemmas"]
    assert "common" in plan["suppressedCandidateLemmas"]
    assert plan["candidateSections"][0]["role"] == "primary_terms"
    assert [item["lemma"] for item in grounding["mainAnswer"]] == [
        "commend",
        "comment",
        "command",
    ]


def test_semantic_root_boundary_keeps_direct_fragment_matches_first():
    query = "\u0072\u0065+\u0063\u006f\u006e \u7684\u8bcd\u6839\u6709\u4ec0\u4e48\u8bcd"
    grounding = build_broad_vocab_grounding(
        active_exam_target="cet6",
        query=query,
        normalized_query=normalize_query(query),
        candidates=[
            light_candidate(
                "reconcile",
                signals=[LightGroundingSignal("fragment", 110, "re+con")],
            ),
            light_candidate(
                "reconciliation",
                signals=[LightGroundingSignal("fragment", 109, "re+con")],
            ),
            light_candidate(
                "conform",
                signals=[LightGroundingSignal("prefix", 80, "con")],
            ),
        ],
    )

    plan = grounding["broadAnswerPlan"]

    assert plan["style"] == "semantic_root_boundary"
    assert plan["candidateSections"][0]["role"] == "direct_ordered_fragment_matches"
    assert plan["candidateSections"][0]["lemmas"] == [
        "reconcile",
        "reconciliation",
    ]


def test_broad_prompt_blocks_learning_card_tail_and_invented_mnemonics():
    prompt = build_broad_vocab_system_prompt()

    assert "collection_map" in prompt
    assert "focused_compare" in prompt
    assert "Do not invent mnemonics" in prompt
    assert "Do not end with a follow-up invitation" in prompt
    assert "Do not use emoji" in prompt
    assert "Do not mention suppressedCandidateLemmas" in prompt
    assert "Do not add collocations, usage columns, example phrases, or derived forms" in prompt
    assert "Do not repeat activeExamTargetLabel or supportLabel" in prompt
    assert "include partOfSpeech" in prompt
    assert "include one short meaning from meaningsZh" in prompt
    assert "Use POS abbreviations like n., v., adj.; do not expand them to noun, verb, adjective" in prompt
    assert "inventory_table" in prompt
    assert "confusion_organizer" not in prompt
    assert "单词 | 词性 | 核心义" in prompt
    assert "备注" not in prompt
    assert "Do not split inventory answers into semantic group headings" in prompt
    assert "core difference" not in prompt
    assert "supplemental candidates" not in prompt
    assert "Do not add remarks, reasons, notes, explanations, or wrap-up sentences" in prompt
    assert "Do not invent broad semantic category titles" in prompt
    assert "meaning_confusion_list" in prompt
    assert "one 注意 sentence" in prompt
    assert "Put each term on its own line" in prompt
    assert "Do not add an opening sentence, examples, collocations, or paragraph-style explanations" in prompt


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

    assert "For inventory_table, use a compact markdown table: 单词 | 词性 | 核心义." in rules
    assert "Do not split inventory answers into semantic group headings." in rules
    assert "Do not add a fourth column, reason column, notes column, or dash placeholders." in rules
    assert "Do not add remarks, reasons, notes, explanations, or wrap-up sentences." in rules
    assert "Do not claim same-root, derivation, or etymology in inventory answers." in rules
    assert "Do not add collocations, usage columns, example phrases, or derived forms." in rules
    assert "Do not repeat activeExamTargetLabel or supportLabel in the answer body." in rules
    assert "For each answerable term, include partOfSpeech plus one short meaning from meaningsZh." in rules
    assert "For each answerable term, include one short meaning from meaningsZh." in rules


def test_inventory_table_does_not_have_remarks_or_reason_columns():
    query = "\u0063\u006f\u006d\u006d \u5f00\u5934\u7684\u5355\u8bcd\u603b\u7ed3"
    grounding = build_broad_vocab_grounding(
        active_exam_target="cet6",
        query=query,
        normalized_query=normalize_query(query),
        candidates=[
            light_candidate(
                "command",
                signals=[
                    LightGroundingSignal("prefix", 110, "comm"),
                    LightGroundingSignal("ngram_overlap", 45, "command/comment"),
                ],
            ),
            light_candidate(
                "comment",
                signals=[
                    LightGroundingSignal("prefix", 109, "comm"),
                    LightGroundingSignal("ngram_overlap", 45, "comment/command"),
                ],
            ),
        ],
    )

    rules = "\n".join(grounding["broadAnswerPlan"]["rules"])

    assert "备注" not in rules
    assert "candidate-internal confusion hints" not in rules
    assert "shared word-family" not in rules
    assert "Do not add a fourth column, reason column, notes column, or dash placeholders." in rules


def test_collection_confusion_cue_rules_do_not_request_core_difference():
    query = "\u0063\u006f\u006d\u006d \u5f00\u5934\u54ea\u4e9b\u8bcd\u5bb9\u6613\u6df7"
    grounding = build_broad_vocab_grounding(
        active_exam_target="cet6",
        query=query,
        normalized_query=normalize_query(query),
        candidates=[
            light_candidate(
                "command",
                signals=[
                    LightGroundingSignal("prefix", 110, "comm"),
                    LightGroundingSignal("ngram_overlap", 45, "command/comment"),
                ],
            ),
            light_candidate(
                "comment",
                signals=[
                    LightGroundingSignal("prefix", 109, "comm"),
                    LightGroundingSignal("ngram_overlap", 45, "comment/command"),
                ],
            ),
        ],
    )

    rules = "\n".join(grounding["broadAnswerPlan"]["rules"])

    assert "Start with the most confusable core group." not in rules
    assert "core difference" not in rules
    assert "Use supplemental candidates only after the core group." not in rules
    assert "For inventory_table, use a compact markdown table: 单词 | 词性 | 核心义." in rules
    assert "Do not invent broad semantic category titles for weakly related candidates." in rules


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
    assert plan["candidateSections"] == [
        {"role": "inventory_terms", "lemmas": ["comment"]},
    ]


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
