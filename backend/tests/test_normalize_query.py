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


def test_compare_query_is_unsupported_for_stage_2():
    result = normalize_query("access assess excess 怎么区分")

    assert result.query_mode == "direct_compare"
    assert result.compare_terms == ["access", "assess", "excess"]
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
