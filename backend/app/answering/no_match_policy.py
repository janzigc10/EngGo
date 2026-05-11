import re

from backend.app.answering.provider import GenerateAnswerResult
from backend.app.retrieval.normalize_query import NormalizedQuery
from backend.app.schemas.chat import ChatSuccessResponse


learning_intent_pattern = re.compile(
    r"(意思|区别|区分|一样|怎么用|用法|造句|\bmean\b|\bdifference\b|\buse\b)",
    re.IGNORECASE,
)
comparison_intent_pattern = re.compile(
    r"(意思|区别|区分|一样|同义|不同|vs\.?|versus|\bsame\b|\bdifference\b|\bcompare\b|\bor\b)",
    re.IGNORECASE,
)
english_token_pattern = re.compile(r"[A-Za-z][A-Za-z'-]*")


def get_unique_english_tokens(query: str) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []

    for token in english_token_pattern.findall(query):
        normalized = token.lower()
        if normalized in seen:
            continue

        seen.add(normalized)
        result.append(normalized)

    return result


def is_suspicious_single_english_token(token: str) -> bool:
    normalized = token.lower()

    return re.search(r"q(?!u)", normalized) is not None or re.search(
        r"[bcdfghjklmnpqrstvwxyz]{5,}",
        normalized,
    ) is not None


def should_use_spelling_assist(
    *,
    query: str,
    normalized_query: NormalizedQuery,
    resolution: str,
) -> bool:
    if resolution != "no_match":
        return False

    if normalized_query.query_mode == "root_family_summary":
        return False

    english_tokens = get_unique_english_tokens(query)

    return (
        len(english_tokens) == 1
        and is_suspicious_single_english_token(english_tokens[0])
    )


def should_use_plain_fallback(
    *,
    query: str,
    normalized_query: NormalizedQuery,
    resolution: str,
    no_match_reason: str | None,
) -> bool:
    if resolution != "no_match":
        return False

    english_tokens = get_unique_english_tokens(query)

    if not english_tokens:
        return False

    if normalized_query.query_mode == "root_family_summary":
        return False

    if not learning_intent_pattern.search(query):
        return False

    if len(english_tokens) == 1 and is_suspicious_single_english_token(english_tokens[0]):
        return False

    if no_match_reason == "low_confidence":
        return len(english_tokens) >= 2 and comparison_intent_pattern.search(query) is not None

    return True


def build_plain_fallback_prompt() -> str:
    return "\n".join(
        [
            "你是 EngGo 的英语学习助手。请把用户问题当作通用英语学习问题回答。",
            "不要声称来自当前考试词库、当前考试范围、RAG 命中或任何已收录证据。",
            "回答要短、直接、有学习价值；如果涉及词义或区别，先给核心边界。",
            "可以轻提示：这条当前还没有绑定到词库命中结果，所以先不标成范围优先项。",
        ],
    )


def build_spelling_assist_prompt() -> str:
    return "\n".join(
        [
            "你是 EngGo 的拼写候选助手。用户输入的英文看起来可能不是稳定标准词。",
            "请只做拼写候选确认，不要把用户输入直接当成标准词解释。",
            "可以给出 1-3 个最可能的英文候选，每个候选只写一个很短的中文核心义。",
            "必须提醒用户先确认拼写；不要声称来自当前考试词库、当前考试范围、RAG 命中或任何已收录证据。",
            "回答要短，不要展开例句、用法或考试优先级。",
        ],
    )


def build_root_no_match_answer() -> str:
    return "这个词根/前缀组合还没有稳定收录成词族，这次先不展开。你可以给我一个更明确的词根片段，或者直接问某一族。"


def build_general_no_match_answer() -> str:
    return "当前词库暂未稳定定位到你说的词，为避免答错对象，这次先不硬猜。你可以再告诉我它的中文意思、词首或词尾，或者你容易把它和哪个词搞混。"


def maybe_plain_no_match_response(
    *,
    provider,
    active_exam_target: str,
    query: str,
    history: list[dict[str, str]],
    request_id: str,
    normalized_query: NormalizedQuery,
    resolution: str,
    no_match_reason: str | None,
) -> ChatSuccessResponse | None:
    if should_use_spelling_assist(
        query=query,
        normalized_query=normalized_query,
        resolution=resolution,
    ):
        result: GenerateAnswerResult = provider.generate_answer(
            query=query,
            history=history,
            request_id=request_id,
            system_prompt=build_spelling_assist_prompt(),
        )

        return ChatSuccessResponse(
            answer=result.answer,
            answerKind="plain",
            requestId=request_id,
            providerRequestId=result.provider_request_id,
        )

    if should_use_plain_fallback(
        query=query,
        normalized_query=normalized_query,
        resolution=resolution,
        no_match_reason=no_match_reason,
    ):
        result = provider.generate_answer(
            query=query,
            history=history,
            request_id=request_id,
            system_prompt=build_plain_fallback_prompt(),
        )

        return ChatSuccessResponse(
            answer=result.answer,
            answerKind="plain",
            requestId=request_id,
            providerRequestId=result.provider_request_id,
        )

    return None
