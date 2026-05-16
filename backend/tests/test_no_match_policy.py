from backend.app.answering.no_match_policy import (
    should_use_plain_fallback,
    should_use_spelling_assist,
)
from backend.app.retrieval.normalize_query import normalize_query


def test_low_confidence_single_word_no_match_stays_grounded():
    normalized_query = normalize_query("recent 这个词什么意思")

    assert should_use_plain_fallback(
        query="recent 这个词什么意思",
        normalized_query=normalized_query,
        resolution="no_match",
        no_match_reason="low_confidence",
    ) is False
    assert should_use_spelling_assist(
        query="recent 这个词什么意思",
        normalized_query=normalized_query,
        resolution="no_match",
    ) is False


def test_clear_single_word_learning_question_uses_plain_fallback():
    normalized_query = normalize_query("complex 是什么意思")

    assert should_use_plain_fallback(
        query="complex 是什么意思",
        normalized_query=normalized_query,
        resolution="no_match",
        no_match_reason="out_of_kb",
    ) is True


def test_known_looking_word_with_y_is_not_treated_as_random_blob():
    normalized_query = normalize_query("photosynthesis 是什么意思")

    assert should_use_plain_fallback(
        query="photosynthesis 是什么意思",
        normalized_query=normalized_query,
        resolution="no_match",
        no_match_reason="out_of_kb",
    ) is True


def test_comparison_low_confidence_uses_plain_fallback():
    normalized_query = normalize_query("complex 和 complicate 是一个意思吗")

    assert should_use_plain_fallback(
        query="complex 和 complicate 是一个意思吗",
        normalized_query=normalized_query,
        resolution="no_match",
        no_match_reason="low_confidence",
    ) is True


def test_suspicious_typo_uses_spelling_assist_instead_of_plain_fallback():
    normalized_query = normalize_query("reqxust 是什么意思")

    assert should_use_spelling_assist(
        query="reqxust 是什么意思",
        normalized_query=normalized_query,
        resolution="no_match",
    ) is True
    assert should_use_plain_fallback(
        query="reqxust 是什么意思",
        normalized_query=normalized_query,
        resolution="no_match",
        no_match_reason="out_of_kb",
    ) is False


def test_random_consonant_blob_does_not_use_spelling_or_plain_provider():
    normalized_query = normalize_query("zzqvwm 是什么意思")

    assert should_use_spelling_assist(
        query="zzqvwm 是什么意思",
        normalized_query=normalized_query,
        resolution="no_match",
    ) is False
    assert should_use_plain_fallback(
        query="zzqvwm 是什么意思",
        normalized_query=normalized_query,
        resolution="no_match",
        no_match_reason="out_of_kb",
    ) is False


def test_root_query_does_not_use_plain_provider_fallback():
    normalized_query = normalize_query("re+con 的词根有什么词")

    assert should_use_spelling_assist(
        query="re+con 的词根有什么词",
        normalized_query=normalized_query,
        resolution="no_match",
    ) is False
    assert should_use_plain_fallback(
        query="re+con 的词根有什么词",
        normalized_query=normalized_query,
        resolution="no_match",
        no_match_reason="low_confidence",
    ) is False
