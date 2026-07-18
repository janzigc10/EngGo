from types import SimpleNamespace

import pytest

from backend.app.answering.intent_classifier import (
    parse_classifier_payload,
    validate_classified_intent,
)
from backend.app.answering.chat_tool_router import (
    build_chat_tools,
    execute_chat_tool_route,
    maybe_classify_grey_zone_route,
    plan_chat_tool_route,
)
from backend.app.answering.ordinary_lookup import UnsupportedQueryMode
from backend.app.answering.provider import GenerateAnswerResult
from backend.app.schemas.chat import ChatSuccessResponse


class RecordingToolService:
    def __init__(self, *, answer: str = "ok", grounding=None):
        self.calls = []
        self.answer_text = answer
        self.grounding = grounding or {
            "queryMode": "direct_lookup",
            "answerStyle": "standard_lookup",
            "resolution": "resolved",
            "mainAnswer": [],
        }

    def answer(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            status_code=200,
            payload=ChatSuccessResponse(
                answer=self.answer_text,
                answerKind="grounded",
                grounding=self.grounding,
                requestId=kwargs["request_id"],
                providerRequestId=None,
            ),
        )


class RejectingToolService:
    def __init__(self):
        self.calls = []

    def answer(self, **kwargs):
        self.calls.append(kwargs)
        raise UnsupportedQueryMode("unsupported")


class JsonClassifierProvider:
    def __init__(self, answer: str):
        self.answer = answer
        self.calls = []

    def generate_answer(self, **kwargs):
        self.calls.append(kwargs)
        return GenerateAnswerResult(
            answer=self.answer,
            provider_request_id="provider_classifier_1",
        )


@pytest.mark.parametrize(
    ("query", "first_tool", "query_mode"),
    [
        ("access 是什么意思", "ordinary_lookup", "fuzzy_recall"),
        ("access assess 怎么区分", "direct_compare", "direct_compare"),
        ("给我几个跟 evaluate 易混的单词", "advanced_lookup", "shape_neighbor_search"),
        ("response 的派生词", "advanced_lookup", "root_family_summary"),
        ("遵循的英文是什么", "advanced_lookup", "meaning_lookup"),
        ("more formal way to say follow", "advanced_lookup", "semantic_expression"),
    ],
)
def test_route_plan_prioritizes_tool_from_query_mode(
    query,
    first_tool,
    query_mode,
):
    plan = plan_chat_tool_route(query=query, active_exam_target="cet6")

    assert plan.tool_names[0] == first_tool
    assert plan.query_mode == query_mode


def test_semantic_expression_route_is_grey_zone_for_classifier():
    plan = plan_chat_tool_route(
        query="more formal way to say follow",
        active_exam_target="cet6",
    )

    assert plan.query_mode == "semantic_expression"
    assert plan.confidence < 0.85
    assert "semantic_expression_cue" in plan.ambiguity_reasons


def test_grey_zone_classifier_can_confirm_semantic_expression_route():
    provider = JsonClassifierProvider(
        '{"intent":"semantic_expression","confidence":0.91,"terms":["follow"],"meaningHint":null,"style":"formal","reason":"formal expression request"}',
    )
    plan = plan_chat_tool_route(
        query="more formal way to say follow",
        active_exam_target="cet6",
    )

    classified = maybe_classify_grey_zone_route(
        route_plan=plan,
        provider=provider,
        history=[],
        request_id="req_classifier_route",
        context=None,
    )

    assert provider.calls
    assert classified.source == "llm"
    assert classified.confidence == pytest.approx(0.91)
    assert classified.classified_intent["terms"] == ["follow"]
    assert classified.classified_intent["style"] == "formal"


def test_classifier_validation_drops_model_expanded_terms():
    parsed = parse_classifier_payload(
        {
            "intent": "semantic_expression",
            "confidence": 0.92,
            "terms": ["follow", "comply"],
            "style": "formal",
        },
    )

    validated = validate_classified_intent(
        parsed,
        query="more formal way to say follow",
        context=None,
    )

    assert validated is not None
    assert validated.terms == ("follow",)


def test_execute_route_plan_calls_selected_tool_first():
    direct_service = RecordingToolService(
        grounding={
            "queryMode": "direct_compare",
            "answerStyle": "confusion_untangle",
            "resolution": "resolved",
            "mainAnswer": [
                {"lemma": "access"},
                {"lemma": "assess"},
            ],
        },
    )
    ordinary_service = RecordingToolService()
    plan = plan_chat_tool_route(
        query="access assess 怎么区分",
        active_exam_target="cet6",
    )
    tools = build_chat_tools(
        ordinary_lookup_service=ordinary_service,
        direct_compare_service=direct_service,
        advanced_lookup_service=None,
    )

    execution = execute_chat_tool_route(
        route_plan=plan,
        tools=tools,
        request_id="req_tool_1",
        history=[],
    )

    assert execution is not None
    assert execution.tool_name == "direct_compare"
    assert direct_service.calls[0]["query"] == "access assess 怎么区分"
    assert ordinary_service.calls == []


def test_execute_route_plan_falls_through_on_unsupported_mode():
    attempted = []
    direct_service = RejectingToolService()
    advanced_service = RecordingToolService(
        answer="advanced fallback",
        grounding={
            "queryMode": "direct_compare",
            "answerStyle": "confusion_untangle",
            "resolution": "resolved",
            "mainAnswer": [],
        },
    )
    plan = plan_chat_tool_route(
        query="access assess 怎么区分",
        active_exam_target="cet6",
    )
    tools = build_chat_tools(
        ordinary_lookup_service=None,
        direct_compare_service=direct_service,
        advanced_lookup_service=advanced_service,
    )

    execution = execute_chat_tool_route(
        route_plan=plan,
        tools=tools,
        request_id="req_tool_2",
        history=[],
        on_tool_attempt=attempted.append,
    )

    assert execution is not None
    assert execution.tool_name == "advanced_lookup"
    assert direct_service.calls
    assert advanced_service.calls
    assert attempted == ["direct_compare", "advanced_lookup"]
