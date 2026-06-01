import re

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from backend.app.answering.no_match_policy import (
    get_unique_english_tokens,
    is_random_like_single_english_token,
    is_suspicious_single_english_token,
)
from backend.app.answering.chat_orchestrator import (
    handle_context_continuation,
    recover_no_match,
)
from backend.app.answering.chat_tool_router import (
    build_chat_tools,
    execute_chat_tool_route,
    plan_chat_tool_route,
)
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
capability_pattern = re.compile(
    r"(你能干嘛|你能做什么|你会什么|怎么用这个产品|这个产品怎么用|怎么用你|有什么功能|能帮我什么)",
)
learning_mood_pattern = re.compile(
    r"(不想背词|不想学|记不住|老记不住|背不下来|没状态|没动力|学不进去)",
)


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


def is_random_like_query(query: str) -> bool:
    tokens = get_unique_english_tokens(query)
    return (
        len(tokens) == 1
        and (
            is_random_like_single_english_token(tokens[0])
            or is_suspicious_single_english_token(tokens[0])
        )
    )


def direct_bounded_chat_answer(query: str) -> str | None:
    normalized = query.strip()
    lowered = normalized.lower()

    if greeting_pattern.match(normalized) or normalized in {"你好呀", "哈喽", "在吗"}:
        return (
            "在。我可以陪你按高考、四六级或考研范围查词、辨析易混词，"
            "也可以直接从你记不住的那个词开始。"
        )

    if capability_pattern.search(normalized):
        return (
            "我主要帮你把英语问题缩小到可学、可背的范围：查词、区分易混词、"
            "找形近词、看哪个表达更适合考试语境。你可以直接发一个词、一组词，"
            "或者一句中文意思。"
        )

    if learning_mood_pattern.search(normalized):
        return (
            "那就先不硬背。你可以发一个最近老混的词，我帮你用一句话拆开；"
            "也可以让我给你挑一个 2 分钟的小问题。"
        )

    if lowered in {"help", "?", "？"}:
        return (
            "你可以直接问：`access assess 怎么区分`、`遵循的英文是什么`，"
            "或者 `哪个更正式` 这种接着上一轮候选追问。"
        )

    return None


def unhandled_bounded_fallback_answer(query: str) -> str:
    if is_random_like_query(query):
        return (
            "这个拼写看起来不像稳定英文词，我先不硬猜。你可以确认拼写，"
            "或者告诉我它的中文意思、词首词尾、容易混的那个词。"
        )

    return (
        "这句话我先接住：如果你是在问英语学习问题，可以直接给我一个词、"
        "一组容易混的词，或一句中文意思；如果你想继续刚才那组词，"
        "也可以问“哪个更正式”“哪个更常用”。"
    )


def bounded_plain_response(answer: str, request_id: str) -> JSONResponse:
    return response_json(
        ChatSuccessResponse(
            answer=answer,
            answerKind="plain",
            requestId=request_id,
            providerRequestId=None,
        ),
        200,
    )


def answer_with_tools(
    *,
    request: Request,
    payload: ChatRequest,
    request_id: str,
    query: str,
    active_exam_target: ExamTarget,
    resolved_follow_up: dict,
) -> JSONResponse:
    history = [message.model_dump() for message in payload.history]
    route_plan = plan_chat_tool_route(
        query=query,
        active_exam_target=active_exam_target,
    )
    tools = build_chat_tools(
        ordinary_lookup_service=getattr(
            request.app.state,
            "ordinary_lookup_service",
            None,
        ),
        direct_compare_service=getattr(
            request.app.state,
            "direct_compare_service",
            None,
        ),
        advanced_lookup_service=getattr(
            request.app.state,
            "advanced_lookup_service",
            None,
        ),
    )

    try:
        execution = execute_chat_tool_route(
            route_plan=route_plan,
            tools=tools,
            request_id=request_id,
            history=history,
        )
    except ChatProviderError as error:
        return provider_error_response(error, request_id)

    if execution is None:
        return bounded_plain_response(
            unhandled_bounded_fallback_answer(query),
            request_id,
        )

    recovered_payload = recover_no_match(
        query=query,
        history=history,
        request_id=request_id,
        active_exam_target=active_exam_target,
        service_payload=execution.payload,
        context=payload.conversationContext,
        provider=getattr(request.app.state, "provider", None),
        resolved_follow_up=resolved_follow_up,
    )
    if recovered_payload:
        return response_json(recovered_payload, 200)

    execution.payload.conversationContext = build_conversation_context(
        payload=execution.payload,
        active_exam_target=active_exam_target,
        source_message_id=f"{request_id}:assistant",
    )
    execution.payload.resolvedFollowUp = (
        resolved_follow_up
        if resolved_follow_up.get("kind") != "not_follow_up"
        else None
    )
    return response_json(execution.payload, execution.status_code)


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


def build_context_choice_prompt() -> str:
    return "\n".join(
        [
            "你是 EngGo 的候选内语境选择助手。",
            "只能在 grounding.targetRefs 里的候选中判断，不要新增、替换或扩展其它词。",
            "先给结论；再用每个候选一句话解释语境边界；最后给一句考试表达建议。",
            "如果用户问正式、常用、自然、阅读、表达、书面或口语，都只能基于 targetRefs 回答。",
            "不要编例句、练习题或后续邀请。",
        ],
    )


def context_choice_fallback_answer(targets: list[LearningCandidateRef]) -> str:
    options = " / ".join(candidate.lemma for candidate in targets) or "这组候选"
    return (
        f"我已经锁定候选：{options}。这类语境判断需要生成服务参与，"
        "当前这次我先不硬猜；你也可以改问其中一个词的基础意思或用法。"
    )


def handle_context_choice_action(
    *,
    request: Request,
    payload: ChatRequest,
    resolved: dict,
    request_id: str,
) -> JSONResponse:
    provider = getattr(request.app.state, "provider", None)
    targets = [candidate_from_payload(item) for item in resolved.get("targetRefs", [])]

    if len(targets) < 2:
        message = "我还不知道要在几个候选里做选择。你可以把那组词再发我一下。"
        return response_json(
            ChatSuccessResponse(
                answer=message,
                answerKind="plain",
                requestId=request_id,
                providerRequestId=None,
                resolvedFollowUp={
                    "kind": "clarification",
                    "message": message,
                    "options": [],
                },
            ),
            200,
        )

    context = payload.conversationContext
    next_context = build_manual_conversation_context(
        active_exam_target=resolved["activeExamTarget"],
        source_message_id=f"{request_id}:assistant",
        topic_kind=context.topicKind if context else "broad_vocab",
        source_query=context.sourceQuery if context else None,
        candidates=targets,
        continuation_candidates=(context.continuationCandidates if context else []),
    )

    if provider is None:
        return response_json(
            ChatSuccessResponse(
                answer=context_choice_fallback_answer(targets),
                answerKind="plain",
                requestId=request_id,
                providerRequestId=None,
                conversationContext=next_context,
                resolvedFollowUp=resolved,
            ),
            200,
        )

    try:
        provider_result = provider.generate_answer(
            query=payload.query,
            history=[message.model_dump() for message in payload.history],
            request_id=request_id,
            system_prompt=build_context_choice_prompt(),
            grounding={
                "targetRefs": [candidate.model_dump() for candidate in targets],
                "rules": [
                    "Use only targetRefs.",
                    "Do not introduce words outside targetRefs.",
                    "Give a clear choice when the query asks for formal/common/natural/exam usage.",
                ],
            },
        )
    except ChatProviderError as error:
        return response_json(
            ChatSuccessResponse(
                answer=context_choice_fallback_answer(targets),
                answerKind="plain",
                requestId=request_id,
                providerRequestId=error.provider_request_id,
                conversationContext=next_context,
                resolvedFollowUp=resolved,
            ),
            200,
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

    if action == "context_choice":
        return handle_context_choice_action(
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

    direct_answer = direct_bounded_chat_answer(payload.query)
    if direct_answer:
        return bounded_plain_response(direct_answer, request_id)

    context_continuation = handle_context_continuation(
        query=payload.query,
        history=[message.model_dump() for message in payload.history],
        request_id=request_id,
        active_exam_target=payload.activeExamTarget,
        context=payload.conversationContext,
        provider=getattr(request.app.state, "provider", None),
    )
    if context_continuation:
        return response_json(context_continuation, 200)

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
    return answer_with_tools(
        request=request,
        payload=payload,
        request_id=request_id,
        query=query,
        active_exam_target=active_exam_target,
        resolved_follow_up=resolved,
    )
