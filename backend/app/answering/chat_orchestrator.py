import re
from typing import Any

from backend.app.answering.no_match_policy import (
    get_unique_english_tokens,
    is_random_like_single_english_token,
    is_suspicious_single_english_token,
)
from backend.app.answering.provider import ChatProviderError
from backend.app.conversation.learning_context import build_manual_conversation_context
from backend.app.schemas.chat import (
    ChatSuccessResponse,
    ConversationalLearningContext,
    ExamTarget,
    LearningCandidateRef,
)


context_reference_pattern = re.compile(
    r"(这几个|这组|这些|它们|上面|刚才|刚才那组|刚才那个|刚才那个词|"
    r"\bthese\b|\bthose\b|\bthem\b|\bthis group\b|\bthese words\b|"
    r"\bthe above\b|\bprevious\b|\blast group\b)",
    re.IGNORECASE,
)
context_question_pattern = re.compile(
    r"(具体|怎么用|用法|例句|口语|书面|正式|常用|自然|写作|阅读|表达|比|比较|区别|差别|"
    r"\buse\b|\busage\b|\bexample\b|\bexamples\b|\bformal\b|\bcommon\b|"
    r"\bspoken\b|\bwritten\b|\bwriting\b|\breading\b|\bdifference\b|\bcompare\b)",
    re.IGNORECASE,
)
deterministic_action_pattern = re.compile(
    r"(怎么背|怎么记|记忆|收藏|加入收藏|收进生词本|还有吗|还有没有|再来几个|再给|"
    r"\bmemorize\b|\bremember\b|\bmore\b)",
    re.IGNORECASE,
)
learning_adjacent_pattern = re.compile(
    r"(英语|单词|词|词义|意思|怎么说|怎么用|用法|例句|区分|区别|辨析|类似|相似|形近|近义|同义|"
    r"表达|口语|书面|正式|常用|自然|写作|阅读|考试|背|记|学习|语法|翻译)",
    re.IGNORECASE,
)


def build_context_continuation_prompt() -> str:
    return "\n".join(
        [
            "你是 EngGo 的受控多轮英语学习助手。",
            "用户正在接着上一轮候选追问，只能围绕 grounding.targetRefs 回答。",
            "不要新增、替换或扩展 targetRefs 以外的单词。",
            "如果用户问用法、口语、正式、写作、阅读或比较，只基于 targetRefs 给短答案。",
            "如果证据不够，直接给一句澄清，不要编例句或开放闲聊。",
        ],
    )


def build_no_match_recovery_prompt() -> str:
    return "\n".join(
        [
            "你是 EngGo 的受控 no-match 恢复助手。",
            "用户的问题没有被当前确定性检索稳定命中。你可以把它当作英语学习问题接住，",
            "但不要声称已经命中当前考试词库或人工易混组。",
            "如果 grounding.targetRefs 存在，只能围绕这些候选回答。",
            "如果没有候选，只给短的学习向解释或澄清方向，不要编造词库证据。",
            "没有候选时不要复述 out_of_kb、scopeReminder、followUpPrompt、queryMode、answerStyle 等内部字段。",
            "如果用户问的是泛英语学习方法，直接给 2-4 条具体学习建议，不要说“没有具体词条可以命中”。",
            "不要进行开放闲聊，不要新增大段例句，不要以 follow-up invitation 结尾。",
        ],
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


def is_context_continuation_query(query: str) -> bool:
    if deterministic_action_pattern.search(query):
        return False

    return (
        context_reference_pattern.search(query) is not None
        and context_question_pattern.search(query) is not None
    )


def has_usable_context(
    context: ConversationalLearningContext | None,
    active_exam_target: ExamTarget,
) -> bool:
    return bool(
        context
        and context.activeExamTarget == active_exam_target
        and context.expiresAfterTurns > 0
        and context.candidates
    )


def is_learning_adjacent_query(query: str) -> bool:
    return (
        learning_adjacent_pattern.search(query) is not None
        or bool(get_unique_english_tokens(query))
    )


def should_use_context_for_recovery(
    *,
    query: str,
    context: ConversationalLearningContext | None,
    active_exam_target: ExamTarget,
    resolved_follow_up: dict,
) -> bool:
    if not has_usable_context(context, active_exam_target):
        return False

    if is_context_continuation_query(query):
        return True

    return resolved_follow_up.get("kind") != "not_follow_up"


def preserved_or_clear_context_follow_up(
    *,
    active_exam_target: ExamTarget,
    resolved_follow_up: dict,
    clears_context: bool,
) -> dict | None:
    if resolved_follow_up.get("kind") != "not_follow_up":
        return resolved_follow_up

    if clears_context:
        return {
            "kind": "resolved_action",
            "action": "clear_context",
            "activeExamTarget": active_exam_target,
            "targetRefs": [],
        }

    return None


def candidate_payloads(candidates: list[LearningCandidateRef]) -> list[dict[str, Any]]:
    return [candidate.model_dump() for candidate in candidates]


def candidate_summary(candidates: list[LearningCandidateRef]) -> str:
    return " / ".join(candidate.lemma for candidate in candidates)


def build_next_context(
    *,
    active_exam_target: ExamTarget,
    source_message_id: str,
    context: ConversationalLearningContext,
    candidates: list[LearningCandidateRef],
) -> ConversationalLearningContext | None:
    return build_manual_conversation_context(
        active_exam_target=active_exam_target,
        source_message_id=source_message_id,
        topic_kind=context.topicKind,
        source_query=context.sourceQuery,
        candidates=candidates,
        continuation_candidates=context.continuationCandidates,
    )


def context_clarification_response(
    *,
    request_id: str,
    context: ConversationalLearningContext | None,
) -> ChatSuccessResponse:
    options = candidate_payloads(context.candidates[:5]) if context else []
    message = "我还不知道你想接着哪一组词说。你可以先发那组词，或重新问一个具体单词。"
    return ChatSuccessResponse(
        answer=message,
        answerKind="plain",
        requestId=request_id,
        providerRequestId=None,
        resolvedFollowUp={
            "kind": "clarification",
            "message": message,
            "options": options,
        },
    )


def deterministic_context_answer(candidates: list[LearningCandidateRef]) -> str:
    return (
        f"我先按刚才这组词接着说：{candidate_summary(candidates)}。"
        "当前没有生成服务参与，所以这次先不扩展；你可以指定其中一个词，"
        "或问“哪个更正式”“哪个更常用”。"
    )


def deterministic_recovery_answer(
    *,
    query: str,
    context: ConversationalLearningContext | None,
) -> str:
    if context and context.candidates:
        return deterministic_context_answer(context.candidates)

    if is_learning_adjacent_query(query):
        return (
            "这看起来像英语学习问题，但当前词库还没稳定定位到对象。"
            "你可以补一个英文词、中文义项、词首词尾，或者给出容易混的那组词。"
        )

    return (
        "这句我先不展开成开放聊天。EngGo 主要帮你查词、辨析易混词、"
        "找表达和接着上一轮词组追问。"
    )


def handle_context_continuation(
    *,
    query: str,
    history: list[dict[str, str]],
    request_id: str,
    active_exam_target: ExamTarget,
    context: ConversationalLearningContext | None,
    provider,
) -> ChatSuccessResponse | None:
    if not is_context_continuation_query(query):
        return None

    if not has_usable_context(context, active_exam_target):
        return context_clarification_response(request_id=request_id, context=context)

    assert context is not None
    targets = list(context.candidates)
    next_context = build_next_context(
        active_exam_target=active_exam_target,
        source_message_id=f"{request_id}:assistant",
        context=context,
        candidates=targets,
    )
    grounding = {
        "orchestrator": "controlled_chat_v1",
        "recoveryKind": "context_continuation",
        "targetRefs": candidate_payloads(targets),
        "rules": [
            "Use only targetRefs.",
            "Do not introduce words outside targetRefs.",
            "Keep the answer short and useful for exam review.",
        ],
    }

    if provider is None:
        return ChatSuccessResponse(
            answer=deterministic_context_answer(targets),
            answerKind="plain",
            requestId=request_id,
            providerRequestId=None,
            conversationContext=next_context,
            resolvedFollowUp={
                "kind": "resolved_action",
                "action": "context_continuation",
                "activeExamTarget": active_exam_target,
                "targetRefs": candidate_payloads(targets),
            },
        )

    try:
        provider_result = provider.generate_answer(
            query=query,
            history=history,
            request_id=request_id,
            system_prompt=build_context_continuation_prompt(),
            grounding=grounding,
        )
    except ChatProviderError as error:
        return ChatSuccessResponse(
            answer=deterministic_context_answer(targets),
            answerKind="plain",
            requestId=request_id,
            providerRequestId=error.provider_request_id,
            conversationContext=next_context,
            resolvedFollowUp={
                "kind": "resolved_action",
                "action": "context_continuation",
                "activeExamTarget": active_exam_target,
                "targetRefs": candidate_payloads(targets),
            },
        )

    return ChatSuccessResponse(
        answer=provider_result.answer,
        answerKind="plain",
        requestId=request_id,
        providerRequestId=provider_result.provider_request_id,
        conversationContext=next_context,
        resolvedFollowUp={
            "kind": "resolved_action",
            "action": "context_continuation",
            "activeExamTarget": active_exam_target,
            "targetRefs": candidate_payloads(targets),
        },
    )


def is_service_no_match(payload: ChatSuccessResponse) -> bool:
    return (
        payload.answerKind == "grounded"
        and isinstance(payload.grounding, dict)
        and payload.grounding.get("resolution") == "no_match"
    )


def is_recoverable_service_no_match(payload: ChatSuccessResponse) -> bool:
    if not is_service_no_match(payload):
        return False

    assert isinstance(payload.grounding, dict)
    query_mode = payload.grounding.get("queryMode")
    answer_style = payload.grounding.get("answerStyle")

    if query_mode == "root_family_summary" or answer_style == "root_family_summary":
        return False

    return answer_style == "standard_lookup" or query_mode in {
        "meaning_lookup",
        "standard_lookup",
        "direct_lookup",
    }


def recover_no_match(
    *,
    query: str,
    history: list[dict[str, str]],
    request_id: str,
    active_exam_target: ExamTarget,
    service_payload: ChatSuccessResponse,
    context: ConversationalLearningContext | None,
    provider,
    resolved_follow_up: dict,
) -> ChatSuccessResponse | None:
    if not is_recoverable_service_no_match(service_payload):
        return None

    if is_random_like_query(query):
        return None

    if not is_learning_adjacent_query(query):
        return ChatSuccessResponse(
            answer=deterministic_recovery_answer(query=query, context=context),
            answerKind="plain",
            requestId=request_id,
            providerRequestId=None,
            resolvedFollowUp=preserved_or_clear_context_follow_up(
                active_exam_target=active_exam_target,
                resolved_follow_up=resolved_follow_up,
                clears_context=True,
            ),
        )

    use_context_targets = should_use_context_for_recovery(
        query=query,
        context=context,
        active_exam_target=active_exam_target,
        resolved_follow_up=resolved_follow_up,
    )
    targets = list(context.candidates) if use_context_targets and context else []
    next_context = (
        build_next_context(
            active_exam_target=active_exam_target,
            source_message_id=f"{request_id}:assistant",
            context=context,
            candidates=targets,
        )
        if context and targets
        else None
    )
    grounding = {
        "orchestrator": "controlled_chat_v1",
        "recoveryKind": "no_match_recovery",
        "activeExamTarget": active_exam_target,
        "targetRefs": candidate_payloads(targets),
        "serviceGrounding": service_payload.grounding,
        "rules": [
            "Do not claim current wordbook hit unless serviceGrounding proves it.",
            "Use targetRefs if present.",
            "Without targetRefs, give bounded learning help or a compact clarification.",
        ],
    }

    if provider is None:
        return ChatSuccessResponse(
            answer=deterministic_recovery_answer(query=query, context=context),
            answerKind="plain",
            requestId=request_id,
            providerRequestId=None,
            conversationContext=next_context,
            resolvedFollowUp=preserved_or_clear_context_follow_up(
                active_exam_target=active_exam_target,
                resolved_follow_up=resolved_follow_up,
                clears_context=not targets,
            ),
        )

    try:
        provider_result = provider.generate_answer(
            query=query,
            history=history,
            request_id=request_id,
            system_prompt=build_no_match_recovery_prompt(),
            grounding=grounding,
        )
    except ChatProviderError as error:
        return ChatSuccessResponse(
            answer=deterministic_recovery_answer(query=query, context=context),
            answerKind="plain",
            requestId=request_id,
            providerRequestId=error.provider_request_id,
            conversationContext=next_context,
            resolvedFollowUp=preserved_or_clear_context_follow_up(
                active_exam_target=active_exam_target,
                resolved_follow_up=resolved_follow_up,
                clears_context=not targets,
            ),
        )

    return ChatSuccessResponse(
        answer=provider_result.answer,
        answerKind="plain",
        requestId=request_id,
        providerRequestId=provider_result.provider_request_id,
        conversationContext=next_context,
        resolvedFollowUp=preserved_or_clear_context_follow_up(
            active_exam_target=active_exam_target,
            resolved_follow_up=resolved_follow_up,
            clears_context=not targets,
        ),
    )
