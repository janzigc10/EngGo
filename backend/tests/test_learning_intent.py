import pytest

from backend.app.retrieval.learning_intent import build_learning_intent_plan
from backend.app.retrieval.normalize_query import normalize_query


def plan_for(query: str):
    normalized = normalize_query(query)
    return build_learning_intent_plan(normalized)


def serialized_constraints(plan):
    return [constraint.to_json() for constraint in plan.constraints]


def test_form_filter_keeps_prefix_and_suffix_as_hard_constraints():
    plan = plan_for("re开头cile结尾的单词")

    assert plan.task == "form_filter"
    assert plan.output_style == "strict_inventory"
    assert plan.allow_expansion is False
    assert plan.minimum_answerable_candidates == 1
    assert serialized_constraints(plan) == [
        {"type": "prefix", "value": "re", "hard": True},
        {"type": "suffix", "value": "cile", "hard": True},
    ]


def test_prefix_meaning_query_is_semantic_filter_not_prefix_inventory():
    plan = plan_for("co开头的意思是合作的单词")

    assert plan.task == "semantic_filter"
    assert plan.output_style == "teacher_table"
    assert plan.allow_expansion is False
    assert {"type": "prefix", "value": "co", "hard": True} in serialized_constraints(plan)
    meaning = next(item for item in serialized_constraints(plan) if item["type"] == "meaning")
    assert meaning["value"] == "合作"
    assert meaning["hard"] is True
    assert set(meaning["alternatives"]) >= {"合作", "协作", "配合"}


def test_word_family_request_allows_grounded_derivative_expansion():
    plan = plan_for("respect派生词")

    assert plan.task == "word_family"
    assert plan.seed_terms == ["respect"]
    assert plan.output_style == "teacher_table"
    assert plan.allow_expansion is True
    assert "derivative_family" in plan.allowed_expansion_kinds


def test_one_letter_prefix_with_explicit_cue_is_semantic_filter():
    plan = plan_for("e开头表示评估评价的单词")

    assert plan.task == "semantic_filter"
    assert {"type": "prefix", "value": "e", "hard": True} in serialized_constraints(plan)


def test_word_family_study_wording_wins_over_ordinary_lookup():
    plan = plan_for("sign这组词怎么背")

    assert plan.task == "word_family"
    assert plan.seed_terms == ["sign"]


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
def test_english_seed_expansion_wording_routes_to_word_family(query):
    normalized = normalize_query(query)

    assert normalized.query_mode == "root_family_summary"
    assert normalized.intent_plan.task == "word_family"
    assert normalized.intent_plan.seed_terms == [normalized.english_terms[0]]


@pytest.mark.parametrize(
    "query",
    [
        "contribute意思相关的短语",
        "contribute意思相关词",
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
def test_semantic_related_writing_and_collocation_do_not_route_to_word_family(query):
    normalized = normalize_query(query)

    assert normalized.query_mode != "root_family_summary"
    assert normalized.intent_plan.task != "word_family"


def test_meaning_constraint_splits_or_words_into_alternatives():
    plan = normalize_query("con开头表示共同或一起的词").intent_plan

    meaning = next(item for item in plan.constraints if item.type == "meaning")

    assert set(meaning.alternatives) >= {"共同", "一起", "合作", "联合", "连接"}


def test_restrict_meaning_aliases_stay_narrow():
    plan = normalize_query("表示限制或约束的con开头单词").intent_plan

    meaning = next(item for item in plan.constraints if item.type == "meaning")

    assert set(meaning.alternatives) >= {"限制", "约束", "制约"}
    assert "强迫" not in meaning.alternatives


def test_internal_ci_word_is_not_stripped_from_meaning_constraint():
    plan = normalize_query("v开头表示词汇量的单词").intent_plan

    assert plan.task == "semantic_filter"
    assert {"type": "prefix", "value": "v", "hard": True} in serialized_constraints(plan)

    meaning = next(item for item in plan.constraints if item.type == "meaning")

    assert meaning.value == "词汇量"


def test_expression_recall_cleans_chinese_prefix_noise():
    normalized = normalize_query("表达遵守的单词")

    assert normalized.query_mode == "meaning_lookup"
    assert normalized.intent_plan.task == "meaning_core"

    meaning = next(
        item for item in normalized.intent_plan.constraints if item.type == "meaning"
    )

    assert meaning.value == "遵守"
    assert set(meaning.alternatives) >= {"遵守", "遵循", "遵从", "服从"}


@pytest.mark.parametrize(
    ("query", "expected_hint", "expected_alternatives"),
    [
        (
            "表示承担责任的词有哪些",
            "承担责任",
            {"承担责任", "负责", "有责任"},
        ),
        (
            "表示表达观点的词有哪些哪些考试常见",
            "表达观点",
            {"表达观点", "表达", "观点", "陈述"},
        ),
    ],
)
def test_expression_recall_strips_collection_request_suffixes(
    query,
    expected_hint,
    expected_alternatives,
):
    plan = normalize_query(query).intent_plan

    meaning = next(item for item in plan.constraints if item.type == "meaning")

    assert plan.task == "meaning_core"
    assert meaning.value == expected_hint
    assert set(meaning.alternatives) >= expected_alternatives
