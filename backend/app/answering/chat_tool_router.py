from dataclasses import dataclass
import inspect
from typing import Any, Literal

from backend.app.answering.intent_classifier import (
    ClassifiedIntent,
    classify_grey_zone_intent,
)
from backend.app.answering.ordinary_lookup import UnsupportedQueryMode
from backend.app.retrieval.normalize_query import normalize_query
from backend.app.schemas.chat import (
    ChatSuccessResponse,
    ConversationalLearningContext,
    ExamTarget,
)


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
    source: Literal["rule", "llm"] = "rule"
    confidence: float = 1.0
    ambiguity_reasons: tuple[str, ...] = ()
    classified_intent: dict[str, object] | None = None


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


def rule_route_confidence(normalized_query) -> tuple[float, tuple[str, ...]]:
    query_mode = normalized_query.query_mode
    intent_plan = normalized_query.intent_plan
    reasons: list[str] = []

    if query_mode == "direct_compare":
        if len(normalized_query.compare_terms) >= 2:
            return 0.95, ()
        return 0.55, ("compare_cue_without_two_terms",)

    if query_mode == "direct_lookup":
        if len(normalized_query.english_terms) == 1:
            return 0.95, ()
        reasons.append("multi_token_ordinary_lookup")
        return 0.5, tuple(reasons)

    if query_mode == "fuzzy_recall":
        return 0.78, ("fuzzy_or_spelling_path",)

    if query_mode == "semantic_expression":
        return 0.62, ("semantic_expression_cue",)

    if intent_plan is not None and intent_plan.task in {
        "word_family",
        "shape_neighbors",
        "form_filter",
        "semantic_filter",
        "meaning_core",
    }:
        return 0.9, ()

    if query_mode in {"meaning_lookup", "shape_neighbor_search", "root_family_summary"}:
        return 0.82, ("advanced_route_needs_quality_gate",)

    return 0.5, ("unknown_route_mode",)


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
        "semantic_expression",
    }:
        tool_names = unique_tool_order(("advanced_lookup",))
    else:
        tool_names = fallback_tool_order

    confidence, ambiguity_reasons = rule_route_confidence(normalized_query)

    return ChatToolRoutePlan(
        query=query,
        active_exam_target=active_exam_target,
        tool_names=tool_names,
        query_mode=query_mode,
        normalized_query=normalized_query.to_json(),
        confidence=confidence,
        ambiguity_reasons=ambiguity_reasons,
    )


def tool_order_for_classified_intent(
    decision: ClassifiedIntent,
) -> tuple[ChatToolName, ...] | None:
    if decision.intent == "ordinary_lookup":
        return unique_tool_order(("ordinary_lookup",))
    if decision.intent == "direct_compare":
        return unique_tool_order(("direct_compare",))
    if decision.intent in {"advanced_lookup", "semantic_expression"}:
        return unique_tool_order(("advanced_lookup",))
    return None


def apply_classified_intent(
    route_plan: ChatToolRoutePlan,
    decision: ClassifiedIntent,
) -> ChatToolRoutePlan:
    tool_names = tool_order_for_classified_intent(decision)
    if tool_names is None:
        return route_plan

    query_mode = (
        "semantic_expression"
        if decision.intent == "semantic_expression"
        else route_plan.query_mode
    )

    return ChatToolRoutePlan(
        query=route_plan.query,
        active_exam_target=route_plan.active_exam_target,
        tool_names=tool_names,
        query_mode=query_mode,
        normalized_query=route_plan.normalized_query,
        source="llm",
        confidence=decision.confidence,
        ambiguity_reasons=route_plan.ambiguity_reasons,
        classified_intent={
            **decision.to_json(),
            "source": "llm",
            "ruleConfidence": route_plan.confidence,
        },
    )


def maybe_classify_grey_zone_route(
    *,
    route_plan: ChatToolRoutePlan,
    provider,
    history: list[dict[str, str]],
    request_id: str,
    context: ConversationalLearningContext | None,
) -> ChatToolRoutePlan:
    if route_plan.confidence >= 0.85:
        return route_plan
    if (
        route_plan.query_mode != "semantic_expression"
        and "semantic_expression_cue" not in route_plan.ambiguity_reasons
    ):
        return route_plan

    decision = classify_grey_zone_intent(
        provider=provider,
        query=route_plan.query,
        history=history,
        request_id=request_id,
        active_exam_target=route_plan.active_exam_target,
        rule_plan={
            "queryMode": route_plan.query_mode,
            "toolNames": list(route_plan.tool_names),
            "confidence": route_plan.confidence,
            "ambiguityReasons": list(route_plan.ambiguity_reasons),
            "normalizedQuery": route_plan.normalized_query,
        },
        context=context,
    )
    if decision is None:
        return route_plan

    return apply_classified_intent(route_plan, decision)


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
            kwargs = {
                "active_exam_target": route_plan.active_exam_target,
                "query": route_plan.query,
                "request_id": request_id,
                "history": history,
            }
            answer_params = inspect.signature(tool.service.answer).parameters
            if (
                route_plan.classified_intent is not None
                and "route_decision" in answer_params
            ):
                kwargs["route_decision"] = route_plan.classified_intent

            result = tool.service.answer(**kwargs)
        except UnsupportedQueryMode:
            continue

        return ChatToolExecution(
            tool_name=tool_name,
            status_code=result.status_code,
            payload=result.payload,
        )

    return None
