import pytest

from backend.app.retrieval.normalize_query import normalize_query


@pytest.mark.parametrize(
    ("query", "query_mode", "task", "constraints"),
    [
        (
            "con开头表示共同或一起的词",
            "root_family_summary",
            "semantic_filter",
            {"prefix": "con", "meaning_any": {"共同", "一起", "合作", "联合", "连接"}},
        ),
        (
            "e开头表示评估评价的单词",
            "root_family_summary",
            "semantic_filter",
            {"prefix": "e", "meaning_any": {"评估", "评价", "估计"}},
        ),
        (
            "表示限制或约束的con开头单词",
            "root_family_summary",
            "semantic_filter",
            {"prefix": "con", "meaning_any": {"限制", "约束"}},
        ),
        (
            "desert dessert 还有没有相似的词",
            "shape_neighbor_search",
            "shape_neighbors",
            {},
        ),
        (
            "sign这组词怎么背",
            "root_family_summary",
            "word_family",
            {},
        ),
    ],
)
def test_student_wording_maps_to_learning_intent(query, query_mode, task, constraints):
    result = normalize_query(query)

    assert result.query_mode == query_mode
    assert result.intent_plan is not None
    assert result.intent_plan.task == task

    serialized = result.intent_plan.to_json()["constraints"]
    if "prefix" in constraints:
        assert {
            "type": "prefix",
            "value": constraints["prefix"],
            "hard": True,
        } in serialized

    if "meaning_any" in constraints:
        meaning_constraints = [
            item for item in serialized if item["type"] == "meaning"
        ]
        assert meaning_constraints
        actual = set(meaning_constraints[0].get("alternatives", []))
        assert constraints["meaning_any"] <= actual


@pytest.mark.parametrize(
    ("query", "task"),
    [
        ("co开头的意思是合作的单词", "semantic_filter"),
        ("re开头cile结尾的单词", "form_filter"),
        ("包含scribe的考研词", "form_filter"),
        ("adapt和adopt怎么区分", "focused_compare"),
        ("receipt的形近词有哪些", "shape_neighbors"),
        ("mitigate是什么意思", "standard_lookup"),
    ],
)
def test_existing_good_routes_stay_stable(query, task):
    result = normalize_query(query)

    assert result.intent_plan is not None
    assert result.intent_plan.task == task
