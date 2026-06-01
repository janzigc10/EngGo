from types import SimpleNamespace

import pytest

from backend.app.answering.chat_tool_router import (
    build_chat_tools,
    execute_chat_tool_route,
    plan_chat_tool_route,
)
from backend.app.answering.ordinary_lookup import UnsupportedQueryMode
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


@pytest.mark.parametrize(
    ("query", "first_tool", "query_mode"),
    [
        ("access 是什么意思", "ordinary_lookup", "fuzzy_recall"),
        ("access assess 怎么区分", "direct_compare", "direct_compare"),
        ("给我几个跟 evaluate 易混的单词", "advanced_lookup", "shape_neighbor_search"),
        ("response 的派生词", "advanced_lookup", "root_family_summary"),
        ("遵循的英文是什么", "advanced_lookup", "meaning_lookup"),
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
    )

    assert execution is not None
    assert execution.tool_name == "advanced_lookup"
    assert direct_service.calls
    assert advanced_service.calls
