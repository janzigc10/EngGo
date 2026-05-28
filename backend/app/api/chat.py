import re

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from backend.app.answering.ordinary_lookup import UnsupportedQueryMode
from backend.app.answering.provider import ChatProviderError
from backend.app.conversation.learning_context import (
    build_manual_conversation_context,
    build_conversation_context,
    resolve_follow_up,
)
from backend.app.schemas.chat import (
    ChatError,
    ChatErrorResponse,
    ChatRequest,
    ChatSuccessResponse,
    ExamTarget,
    LearningCandidateRef,
)

router = APIRouter()

greeting_pattern = re.compile(r"^(你好|您好|hi|hello|hey)[！!。.\s]*$", re.IGNORECASE)
exam_target_labels = {
    "gaokao": "高考",
    "cet4": "CET-4",
    "cet6": "CET-6",
    "postgrad": "考研",
}


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
    active_exam_target: ExamTarget,
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
                active_exam_target=active_exam_target,
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
            active_exam_target=active_exam_target,
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


def candidate_from_payload(value: dict) -> LearningCandidateRef:
    return LearningCandidateRef.model_validate(value)


def format_candidate(candidate: LearningCandidateRef) -> str:
    details = " ".join(
        part
        for part in [
            candidate.partOfSpeech,
            candidate.meaningZh,
        ]
        if part
    )

    return f"{candidate.lemma} {details}".strip()


def handle_switch_scope_action(resolved: dict, request_id: str) -> JSONResponse:
    target = resolved["activeExamTarget"]
    label = exam_target_labels.get(target, target)

    return response_json(
        ChatSuccessResponse(
            answer=f"已切换到{label}范围。你可以继续按这个范围问。",
            answerKind="plain",
            requestId=request_id,
            providerRequestId=None,
            resolvedFollowUp=resolved,
        ),
        200,
    )


def handle_show_more_action(
    *,
    payload: ChatRequest,
    resolved: dict,
    request_id: str,
) -> JSONResponse:
    targets = [candidate_from_payload(item) for item in resolved.get("targetRefs", [])]
    context = payload.conversationContext

    if not targets:
        next_context = None
        if context and context.candidates:
            next_context = build_manual_conversation_context(
                active_exam_target=context.activeExamTarget,
                source_message_id=f"{request_id}:assistant",
                topic_kind=context.topicKind,
                source_query=context.sourceQuery,
                candidates=context.candidates,
                continuation_candidates=[],
            )

        return response_json(
            ChatSuccessResponse(
                answer="这组暂时没有更多稳定候选了，我先不硬补。",
                answerKind="plain",
                requestId=request_id,
                providerRequestId=None,
                conversationContext=next_context,
                resolvedFollowUp=resolved,
            ),
            200,
        )

    remaining = list(context.continuationCandidates[5:]) if context else []
    answer = "\n".join(
        [
            "还有这些可以看：",
            *[f"- {format_candidate(candidate)}" for candidate in targets],
        ],
    )
    next_context = build_manual_conversation_context(
        active_exam_target=resolved["activeExamTarget"],
        source_message_id=f"{request_id}:assistant",
        topic_kind=context.topicKind if context else "broad_vocab",
        source_query=context.sourceQuery if context else None,
        candidates=targets,
        continuation_candidates=remaining,
    )

    return response_json(
        ChatSuccessResponse(
            answer=answer,
            answerKind="plain",
            requestId=request_id,
            providerRequestId=None,
            conversationContext=next_context,
            resolvedFollowUp=resolved,
        ),
        200,
    )


def build_study_guidance_prompt() -> str:
    return "\n".join(
        [
            "你是 EngGo 的备考学习建议助手。",
            "只能围绕 grounding.targetRefs 里的词给学习建议，不要新增、替换或扩展其它词。",
            "输出要短，按这三段组织：1. 先背哪条主线；2. 每个词一个抓手；3. 一个常见误区。",
            "不要编押韵、故事、例句、练习题或后续邀请。",
        ],
    )


def handle_study_guidance_action(
    *,
    request: Request,
    payload: ChatRequest,
    resolved: dict,
    request_id: str,
) -> JSONResponse:
    provider = getattr(request.app.state, "provider", None)
    targets = [candidate_from_payload(item) for item in resolved.get("targetRefs", [])]

    if not targets:
        return response_json(
            ChatSuccessResponse(
                answer="我还不知道你想背哪一个词或哪一组词。你可以点一个，或把那组词再发我一下。",
                answerKind="plain",
                requestId=request_id,
                providerRequestId=None,
                resolvedFollowUp={
                    "kind": "clarification",
                    "message": "我还不知道你想背哪一个词或哪一组词。你可以点一个，或把那组词再发我一下。",
                    "options": [],
                },
            ),
            200,
        )

    if provider is None:
        return provider_error_response(
            ChatProviderError(
                "OPENAI_API_KEY is not configured on the server.",
                status_code=503,
            ),
            request_id,
        )

    try:
        provider_result = provider.generate_answer(
            query=payload.query,
            history=[message.model_dump() for message in payload.history],
            request_id=request_id,
            system_prompt=build_study_guidance_prompt(),
            grounding={
                "targetRefs": [candidate.model_dump() for candidate in targets],
                "rules": [
                    "Use only targetRefs.",
                    "Do not introduce words outside targetRefs.",
                    "Keep the answer compact and useful for exam memorization.",
                ],
            },
        )
    except ChatProviderError as error:
        return provider_error_response(error, request_id)

    context = payload.conversationContext
    next_context = build_manual_conversation_context(
        active_exam_target=resolved["activeExamTarget"],
        source_message_id=f"{request_id}:assistant",
        topic_kind=context.topicKind if context else "broad_vocab",
        source_query=context.sourceQuery if context else None,
        candidates=targets,
        continuation_candidates=(context.continuationCandidates if context else []),
    )

    return response_json(
        ChatSuccessResponse(
            answer=provider_result.answer,
            answerKind="plain",
            requestId=request_id,
            providerRequestId=provider_result.provider_request_id,
            conversationContext=next_context,
            resolvedFollowUp=resolved,
        ),
        200,
    )


def handle_resolved_action(
    *,
    request: Request,
    payload: ChatRequest,
    resolved: dict,
    request_id: str,
) -> JSONResponse:
    action = resolved.get("action")

    if action == "switch_scope":
        return handle_switch_scope_action(resolved, request_id)

    if action == "show_more":
        return handle_show_more_action(
            payload=payload,
            resolved=resolved,
            request_id=request_id,
        )

    if action == "study_guidance":
        return handle_study_guidance_action(
            request=request,
            payload=payload,
            resolved=resolved,
            request_id=request_id,
        )

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
        return handle_resolved_action(
            request=request,
            payload=payload,
            resolved=resolved,
            request_id=request_id,
        )

    query = resolved["query"] if resolved["kind"] == "resolved_query" else payload.query
    active_exam_target = resolved.get("activeExamTarget", payload.activeExamTarget)
    return answer_with_services(
        request=request,
        payload=payload,
        request_id=request_id,
        query=query,
        active_exam_target=active_exam_target,
        resolved_follow_up=resolved,
    )
