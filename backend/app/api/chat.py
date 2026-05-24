import re

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from backend.app.answering.ordinary_lookup import UnsupportedQueryMode
from backend.app.answering.provider import ChatProviderError
from backend.app.conversation.learning_context import (
    build_conversation_context,
    resolve_follow_up,
)
from backend.app.schemas.chat import (
    ChatError,
    ChatErrorResponse,
    ChatRequest,
    ChatSuccessResponse,
)

router = APIRouter()

greeting_pattern = re.compile(r"^(你好|您好|hi|hello|hey)[！!。.\s]*$", re.IGNORECASE)


def response_json(payload: ChatSuccessResponse | ChatErrorResponse, status_code: int) -> JSONResponse:
    content = payload.model_dump()

    for key in ("grounding", "conversationContext", "resolvedFollowUp"):
        if content.get(key) is None:
            content.pop(key, None)

    return JSONResponse(
        status_code=status_code,
        content=content,
        headers={"x-request-id": payload.requestId},
    )


def provider_error_response(error: ChatProviderError, request_id: str) -> JSONResponse:
    if error.status_code == 503:
        return response_json(
            ChatErrorResponse(
                error=ChatError(
                    code="openai_unavailable",
                    message="OPENAI_API_KEY is not configured on the server.",
                ),
                requestId=request_id,
                providerRequestId=error.provider_request_id,
            ),
            503,
        )

    return response_json(
        ChatErrorResponse(
            error=ChatError(
                code="chat_generation_failed",
                message="当前回答服务暂时不可用，请稍后再试。",
            ),
            requestId=request_id,
            providerRequestId=error.provider_request_id,
        ),
        error.status_code,
    )


def answer_with_services(
    *,
    request: Request,
    payload: ChatRequest,
    request_id: str,
    query: str,
    resolved_follow_up: dict,
) -> JSONResponse:
    history = [message.model_dump() for message in payload.history]
    services = (
        getattr(request.app.state, "ordinary_lookup_service", None),
        getattr(request.app.state, "direct_compare_service", None),
        getattr(request.app.state, "advanced_lookup_service", None),
    )

    for service in services:
        if not service:
            continue

        try:
            result = service.answer(
                active_exam_target=payload.activeExamTarget,
                query=query,
                request_id=request_id,
                history=history,
            )
        except UnsupportedQueryMode:
            continue
        except ChatProviderError as error:
            return provider_error_response(error, request_id)

        result.payload.conversationContext = build_conversation_context(
            payload=result.payload,
            active_exam_target=payload.activeExamTarget,
            source_message_id=f"{request_id}:assistant",
        )
        result.payload.resolvedFollowUp = (
            resolved_follow_up
            if resolved_follow_up.get("kind") != "not_follow_up"
            else None
        )
        return response_json(result.payload, result.status_code)

    return response_json(
        ChatErrorResponse(
            error=ChatError(
                code="not_implemented",
                message="FastAPI chat retrieval is not implemented for this query yet.",
            ),
            requestId=request_id,
            providerRequestId=None,
        ),
        501,
    )


@router.post("/api/chat")
async def post_chat(request: Request, payload: ChatRequest) -> JSONResponse:
    request_id = request.state.request_id

    if greeting_pattern.match(payload.query):
        return response_json(
            ChatSuccessResponse(
                answer=(
                    "你好。你可以直接问一个单词、两个易混词，或者给我一个中文意思，"
                    "我会先帮你缩小备考范围。"
                ),
                answerKind="plain",
                requestId=request_id,
                providerRequestId=None,
            ),
            200,
        )

    resolved = resolve_follow_up(
        payload.query,
        payload.conversationContext,
        payload.activeExamTarget,
    )

    if resolved["kind"] == "clarification":
        return response_json(
            ChatSuccessResponse(
                answer=resolved["message"],
                answerKind="plain",
                requestId=request_id,
                providerRequestId=None,
                resolvedFollowUp=resolved,
            ),
            200,
        )

    if resolved["kind"] == "resolved_action":
        return response_json(
            ChatSuccessResponse(
                answer="已帮你记录这次收藏动作。",
                answerKind="plain",
                requestId=request_id,
                providerRequestId=None,
                resolvedFollowUp=resolved,
            ),
            200,
        )

    query = resolved["query"] if resolved["kind"] == "resolved_query" else payload.query
    return answer_with_services(
        request=request,
        payload=payload,
        request_id=request_id,
        query=query,
        resolved_follow_up=resolved,
    )
