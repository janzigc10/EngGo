import pytest

from backend.app.retrieval.normalize_query import normalize_query


def test_direct_word_lookup_extracts_single_english_term():
    result = normalize_query("accent")

    assert result.query_mode == "direct_lookup"
    assert result.normalized_text == "accent"
    assert result.english_terms == ["accent"]
    assert result.meaning_hint == "accent"
    assert result.is_supported_ordinary_lookup is True


def test_chinese_learning_intent_becomes_fuzzy_recall():
    result = normalize_query("access 是什么意思")

    assert result.query_mode == "fuzzy_recall"
    assert result.normalized_text == "access 是什么意思"
    assert result.english_terms == ["access"]
    assert result.meaning_hint == "access"
    assert result.is_supported_ordinary_lookup is True


def test_direct_phrase_lookup_keeps_words_separate():
    result = normalize_query("make up")

    assert result.query_mode == "direct_lookup"
    assert result.normalized_text == "make up"
    assert result.english_terms == ["make", "up"]
    assert result.meaning_hint == "make up"
    assert result.is_supported_ordinary_lookup is True


def test_phrase_lookup_with_chinese_lookup_suffix_stays_direct_lookup():
    result = normalize_query("make up 是什么意思")

    assert result.query_mode == "direct_lookup"
    assert result.english_terms == ["make", "up"]
    assert result.meaning_hint == "make up"
    assert result.is_supported_ordinary_lookup is True


@pytest.mark.parametrize(
    ("query", "expected_hint"),
    [
        ("表达遵守的单词", "遵守"),
        ("限制用英语怎么说", "限制"),
        ("遵守的英文是啥", "遵守"),
        ("表示表达观点的词有哪些哪些考试常见", "表达观点"),
    ],
)
def test_chinese_expression_recall_cleans_meaning_hint_at_source(
    query,
    expected_hint,
):
    result = normalize_query(query)

    assert result.query_mode == "meaning_lookup"
    assert result.meaning_hint == expected_hint
    assert result.intent_plan.task == "meaning_core"


def test_compare_query_is_unsupported_for_stage_2():
    result = normalize_query("access assess excess 怎么区分")

    assert result.query_mode == "direct_compare"
    assert result.compare_terms == ["access", "assess", "excess"]
    assert result.is_supported_ordinary_lookup is False


def test_compact_chinese_and_between_two_terms_is_direct_compare():
    result = normalize_query("expire和inspire")

    assert result.query_mode == "direct_compare"
    assert result.compare_terms == ["expire", "inspire"]
    assert result.is_supported_ordinary_lookup is False


def test_root_query_is_unsupported_for_stage_2():
    result = normalize_query("re+con 的词根有什么词")

    assert result.query_mode == "root_family_summary"
    assert result.english_terms == ["re", "con"]
    assert result.is_supported_ordinary_lookup is False


def test_shape_neighbor_query_is_detected_before_fuzzy_recall():
    result = normalize_query("跟 recent 很像的词有哪些")

    assert result.query_mode == "shape_neighbor_search"
    assert result.english_terms == ["recent"]
    assert result.is_supported_ordinary_lookup is False


def test_shape_neighbor_find_similar_confusing_word_query_is_detected():
    result = normalize_query("帮我找一下和access比较像的易混词")

    assert result.query_mode == "shape_neighbor_search"
    assert result.english_terms == ["access"]
    assert result.is_supported_ordinary_lookup is False


def test_shape_neighbor_looks_like_query_is_detected():
    result = normalize_query("给我几个跟evacuate长得像的单词")

    assert result.query_mode == "shape_neighbor_search"
    assert result.english_terms == ["evacuate"]
    assert result.is_supported_ordinary_lookup is False


def test_shape_neighbor_query_has_teacher_intent_plan():
    result = normalize_query("跟evacuate很像的单词有哪些")

    assert result.query_mode == "shape_neighbor_search"
    assert result.intent_plan.task == "shape_neighbors"
    assert result.intent_plan.output_style == "teacher_table"
    assert result.intent_plan.allow_expansion is True


def test_plain_like_wording_routes_to_shape_neighbors():
    for query in ["有个像 institute 的词", "有个和 institute 很像的词"]:
        result = normalize_query(query)

        assert result.query_mode == "shape_neighbor_search"
        assert result.english_terms == ["institute"]
        assert result.intent_plan.task == "shape_neighbors"
        assert result.is_supported_ordinary_lookup is False


def test_bare_connector_like_wording_routes_to_shape_neighbors():
    for query, expected_term in [
        ("\u548ccontest\u50cf\u7684\u5355\u8bcd", "contest"),
        ("\u548ccontext\u50cf\u7684\u5355\u8bcd", "context"),
        ("\u8ddf recent \u50cf\u7684\u8bcd", "recent"),
    ]:
        result = normalize_query(query)

        assert result.query_mode == "shape_neighbor_search"
        assert result.english_terms == [expected_term]
        assert result.intent_plan.task == "shape_neighbors"
        assert result.is_supported_ordinary_lookup is False


@pytest.mark.parametrize(
    "query",
    [
        "找一个类似 institute 意思的词",
        "找一个和 institute 意思很像的词",
        "找一个和 institute 含义很像的词",
    ],
)
def test_semantic_similar_meaning_wording_does_not_route_to_shape_neighbors(query):
    result = normalize_query(query)

    assert result.query_mode != "shape_neighbor_search"
    assert result.intent_plan.task != "shape_neighbors"


def test_plain_lookup_for_institute_stays_standard_lookup():
    result = normalize_query("institute 是什么意思")

    assert result.query_mode in {"direct_lookup", "fuzzy_recall"}
    assert result.intent_plan.task == "standard_lookup"
    assert result.is_supported_ordinary_lookup is True


def test_direct_compare_query_has_focused_intent_plan():
    result = normalize_query("access assess excess 怎么区分")

    assert result.query_mode == "direct_compare"
    assert result.intent_plan.task == "focused_compare"
    assert result.intent_plan.allow_expansion is False
    assert result.intent_plan.output_style == "focused_compare"


def test_shape_neighbor_multiple_terms_with_similar_word_cue_is_detected():
    result = normalize_query("desert dessert 还有没有相似的词")

    assert result.query_mode == "shape_neighbor_search"
    assert result.intent_plan.task == "shape_neighbors"


@pytest.mark.parametrize(
    "query",
    [
        "accept \u548c except \u5f88\u50cf\u7684\u5355\u8bcd\u6709\u54ea\u4e9b",
        "\u8ddfconstitute\u548cinstitute\u5f88\u50cf\u7684\u5355\u8bcd",
        "restrain \u548c constrain \u5f88\u50cf\u7684\u5355\u8bcd",
    ],
)
def test_multi_seed_lookalike_collection_wins_over_direct_compare(query):
    result = normalize_query(query)

    assert result.query_mode == "shape_neighbor_search"
    assert result.intent_plan.task == "shape_neighbors"


@pytest.mark.parametrize(
    "query",
    [
        "accept \u548c except \u600e\u4e48\u533a\u5206",
        "restrain \u548c constrain \u7684\u533a\u522b",
    ],
)
def test_multi_seed_compare_stays_focused(query):
    result = normalize_query(query)

    assert result.query_mode == "direct_compare"
    assert result.intent_plan.task == "focused_compare"


def test_direct_compare_stays_focused_before_shape_neighbor_cues():
    result = normalize_query("desert和dessert怎么区分")

    assert result.query_mode == "direct_compare"
    assert result.intent_plan.task == "focused_compare"


def test_study_group_wording_is_root_family_summary():
    result = normalize_query("sign这组词怎么背")

    assert result.query_mode == "root_family_summary"
    assert result.intent_plan.task == "word_family"


@pytest.mark.parametrize(
    "query",
    [
        "respect的拓展词",
        "reduce的拓展词",
        "consequence相关词",
        "contribute相关词",
        "responsible的派生/拓展/相关词怎么分",
    ],
)
def test_english_seed_expansion_wording_is_root_family_summary(query):
    result = normalize_query(query)

    assert result.query_mode == "root_family_summary"
    assert result.intent_plan.task == "word_family"
    assert result.is_supported_ordinary_lookup is False


@pytest.mark.parametrize(
    "query",
    [
        "contribute意思相关的短语",
        "contribute意思相关词",
        "contribute相关意思词",
        "contribute相关含义词",
        "responsible的同义词",
        "responsible同义相关词",
        "responsible相关同义词",
        "respect作文表达怎么用",
        "respect作文相关词",
        "respect相关作文词",
        "respect表达相关词",
        "reduce的搭配",
        "reduce搭配相关词",
        "reduce相关搭配词",
    ],
)
def test_semantic_related_writing_and_collocation_stay_out_of_word_family(query):
    result = normalize_query(query)

    assert result.query_mode != "root_family_summary"
    assert result.intent_plan.task != "word_family"


def test_single_word_study_wording_stays_standard_lookup():
    for query in ["mitigate怎么记", "access怎么背"]:
        result = normalize_query(query)

        assert result.query_mode in {"direct_lookup", "fuzzy_recall"}
        assert result.intent_plan.task == "standard_lookup"


def test_known_root_family_memory_query_is_detected_before_fuzzy_recall():
    result = normalize_query("跟 institute 一样那几个词怎么记")

    assert result.query_mode == "root_family_summary"
    assert result.english_terms == ["institute"]
    assert result.is_supported_ordinary_lookup is False


def test_contains_fragment_query_is_detected_as_root_family_summary():
    result = normalize_query("有 struct 的词")

    assert result.query_mode == "root_family_summary"
    assert result.english_terms == ["struct"]
    assert result.is_supported_ordinary_lookup is False


def test_combined_fragment_query_is_detected_as_root_family_summary():
    result = normalize_query("con 开头 re 相关的词")

    assert result.query_mode == "root_family_summary"
    assert result.english_terms == ["con", "re"]
    assert result.is_supported_ordinary_lookup is False


def test_standalone_fragment_query_is_detected_as_root_family_summary():
    result = normalize_query("spect 这串相关的词怎么整理")

    assert result.query_mode == "root_family_summary"
    assert result.english_terms == ["spect"]
    assert result.is_supported_ordinary_lookup is False
