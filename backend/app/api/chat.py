import re

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from backend.app.answering.ordinary_lookup import UnsupportedQueryMode
from backend.app.answering.provider import ChatProviderError
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

    if content.get("grounding") is None:
        content.pop("grounding", None)

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

    ordinary_lookup_service = getattr(request.app.state, "ordinary_lookup_service", None)

    if ordinary_lookup_service:
        try:
            result = ordinary_lookup_service.answer(
                active_exam_target=payload.activeExamTarget,
                query=payload.query,
                request_id=request_id,
                history=[
                    message.model_dump()
                    for message in payload.history
                ],
            )
            return response_json(result.payload, result.status_code)
        except UnsupportedQueryMode:
            pass
        except ChatProviderError as error:
            return provider_error_response(error, request_id)

    direct_compare_service = getattr(request.app.state, "direct_compare_service", None)

    if direct_compare_service:
        try:
            result = direct_compare_service.answer(
                active_exam_target=payload.activeExamTarget,
                query=payload.query,
                request_id=request_id,
                history=[
                    message.model_dump()
                    for message in payload.history
                ],
            )
            return response_json(result.payload, result.status_code)
        except UnsupportedQueryMode:
            pass
        except ChatProviderError as error:
            return provider_error_response(error, request_id)

    advanced_lookup_service = getattr(request.app.state, "advanced_lookup_service", None)

    if advanced_lookup_service:
        try:
            result = advanced_lookup_service.answer(
                active_exam_target=payload.activeExamTarget,
                query=payload.query,
                request_id=request_id,
                history=[
                    message.model_dump()
                    for message in payload.history
                ],
            )
            return response_json(result.payload, result.status_code)
        except UnsupportedQueryMode:
            pass
        except ChatProviderError as error:
            return provider_error_response(error, request_id)

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
