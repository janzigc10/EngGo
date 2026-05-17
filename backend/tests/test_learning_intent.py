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


def test_meaning_constraint_splits_or_words_into_alternatives():
    plan = normalize_query("con开头表示共同或一起的词").intent_plan

    meaning = next(item for item in plan.constraints if item.type == "meaning")

    assert set(meaning.alternatives) >= {"共同", "一起", "合作", "联合", "连接"}
