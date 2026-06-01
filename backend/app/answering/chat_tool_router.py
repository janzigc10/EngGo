from dataclasses import dataclass
from typing import Any, Literal

from backend.app.answering.ordinary_lookup import UnsupportedQueryMode
from backend.app.retrieval.normalize_query import normalize_query
from backend.app.schemas.chat import ChatSuccessResponse, ExamTarget


ChatToolName = Literal["ordinary_lookup", "direct_compare", "advanced_lookup"]

fallback_tool_order: tuple[ChatToolName, ...] = (
    "ordinary_lookup",
    "direct_compare",
    "advanced_lookup",
)


@dataclass(frozen=True)
class ChatTool:
    name: ChatToolName
    service: Any


@dataclass(frozen=True)
class ChatToolRoutePlan:
    query: str
    active_exam_target: ExamTarget
    tool_names: tuple[ChatToolName, ...]
    query_mode: str
    normalized_query: dict[str, object]


@dataclass(frozen=True)
class ChatToolExecution:
    tool_name: ChatToolName
    status_code: int
    payload: ChatSuccessResponse


def unique_tool_order(
    primary: tuple[ChatToolName, ...],
) -> tuple[ChatToolName, ...]:
    result: list[ChatToolName] = []

    for tool_name in (*primary, *fallback_tool_order):
        if tool_name in result:
            continue
        result.append(tool_name)

    return tuple(result)


def plan_chat_tool_route(
    *,
    query: str,
    active_exam_target: ExamTarget,
) -> ChatToolRoutePlan:
    normalized_query = normalize_query(query)
    query_mode = normalized_query.query_mode

    if query_mode in {"direct_lookup", "fuzzy_recall"}:
        tool_names = unique_tool_order(("ordinary_lookup",))
    elif query_mode == "direct_compare":
        tool_names = unique_tool_order(("direct_compare",))
    elif query_mode in {
        "meaning_lookup",
        "shape_neighbor_search",
        "root_family_summary",
    }:
        tool_names = unique_tool_order(("advanced_lookup",))
    else:
        tool_names = fallback_tool_order

    return ChatToolRoutePlan(
        query=query,
        active_exam_target=active_exam_target,
        tool_names=tool_names,
        query_mode=query_mode,
        normalized_query=normalized_query.to_json(),
    )


def build_chat_tools(
    *,
    ordinary_lookup_service,
    direct_compare_service,
    advanced_lookup_service,
) -> dict[ChatToolName, ChatTool]:
    services: tuple[tuple[ChatToolName, Any], ...] = (
        ("ordinary_lookup", ordinary_lookup_service),
        ("direct_compare", direct_compare_service),
        ("advanced_lookup", advanced_lookup_service),
    )

    return {
        name: ChatTool(name=name, service=service)
        for name, service in services
        if service is not None
    }


def execute_chat_tool_route(
    *,
    route_plan: ChatToolRoutePlan,
    tools: dict[ChatToolName, ChatTool],
    request_id: str,
    history: list[dict[str, str]],
) -> ChatToolExecution | None:
    for tool_name in route_plan.tool_names:
        tool = tools.get(tool_name)
        if tool is None:
            continue

        try:
            result = tool.service.answer(
                active_exam_target=route_plan.active_exam_target,
                query=route_plan.query,
                request_id=request_id,
                history=history,
            )
        except UnsupportedQueryMode:
            continue

        return ChatToolExecution(
            tool_name=tool_name,
            status_code=result.status_code,
            payload=result.payload,
        )

    return None
