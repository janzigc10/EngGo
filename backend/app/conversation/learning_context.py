import re
from typing import Any

from backend.app.schemas.chat import (
    ChatSuccessResponse,
    ConversationalLearningContext,
    ExamTarget,
    LearningCandidateRef,
    LearningFocus,
)


def build_conversation_context(
    *,
    payload: ChatSuccessResponse,
    active_exam_target: ExamTarget,
    source_message_id: str,
) -> ConversationalLearningContext | None:
    if payload.answerKind != "grounded" or not payload.grounding:
        return None

    grounding = payload.grounding
    if grounding.get("resolution") == "no_match":
        return None

    candidates = _candidate_refs_from_grounding(grounding)
    if not candidates:
        return None

    focus = None
    if len(candidates) == 1:
        candidate = candidates[0]
        focus = LearningFocus(
            kind="lemma",
            label=candidate.label,
            lemma=candidate.lemma,
            index=candidate.index,
        )

    return ConversationalLearningContext(
        activeExamTarget=active_exam_target,
        sourceMessageId=source_message_id,
        topicKind=_topic_kind(grounding),
        focus=focus,
        candidates=candidates,
        availableActions=_available_actions(candidates),
    )


def resolve_follow_up(
    query: str,
    context: ConversationalLearningContext | None,
    active_exam_target: ExamTarget,
) -> dict[str, Any]:
    text = query.strip()
    intent = _follow_up_intent(text)

    if _has_mixed_reference_categories(_reference_categories(text, context)):
        return _clarification(context)

    reference = _follow_up_reference(text)

    if not intent or not reference:
        return {"kind": "not_follow_up"}

    if reference in {"multiple_ordinals", "unsupported_ordinal"}:
        return _clarification(context)

    if _contains_explicit_candidate(text, context):
        return {"kind": "not_follow_up"}

    if not _usable_context(context):
        return _clarification(context)

    targets = _resolve_targets(reference, context)
    if not targets:
        return _clarification(context)

    if intent == "collect":
        action = "collect_group" if reference == "group" else "collect_one"
        return {
            "kind": "resolved_action",
            "action": action,
            "activeExamTarget": active_exam_target,
            "targetRefs": [_candidate_payload(candidate) for candidate in targets],
        }

    query_text = _rewrite_follow_up_query(intent, targets)
    if not query_text:
        return _clarification(context)

    return {
        "kind": "resolved_query",
        "query": query_text,
        "activeExamTarget": active_exam_target,
        "targetRefs": [_candidate_payload(candidate) for candidate in targets],
        "reason": _reference_reason(reference),
    }


def _candidate_refs_from_grounding(
    grounding: dict[str, Any],
) -> list[LearningCandidateRef]:
    for raw_candidates in _candidate_sources(grounding):
        refs = _candidate_refs_from_items(raw_candidates)
        if refs:
            return refs
    return []


def _candidate_refs_from_items(items: list[Any]) -> list[LearningCandidateRef]:
    refs: list[LearningCandidateRef] = []
    seen_lemmas: set[str] = set()

    for item in items:
        if not isinstance(item, dict):
            continue

        lemma = str(item.get("lemma") or "").strip()
        if not lemma:
            continue

        lemma_key = lemma.lower()
        if lemma_key in seen_lemmas:
            continue
        seen_lemmas.add(lemma_key)

        refs.append(
            LearningCandidateRef(
                index=len(refs) + 1,
                lemma=lemma,
                label=str(item.get("label") or lemma).strip() or lemma,
                entryId=_optional_str(item.get("entryId")),
                sourceKind=_optional_str(item.get("sourceKind")),
                partOfSpeech=_optional_str(item.get("partOfSpeech")),
                meaningZh=_meaning_zh(item),
                reviewStatus=_optional_str(item.get("reviewStatus")),
            ),
        )

    return refs


def _candidate_sources(grounding: dict[str, Any]) -> list[list[Any]]:
    sources: list[list[Any]] = []

    comparison_members = _members_from_view(grounding.get("comparisonView"))
    if comparison_members:
        sources.append(comparison_members)

    root_family_members = _members_from_view(grounding.get("rootFamilyView"))
    if root_family_members:
        sources.append(root_family_members)

    main_answer = grounding.get("mainAnswer")
    if isinstance(main_answer, list) and main_answer:
        sources.append(main_answer)

    confusion_boundary = grounding.get("confusionBoundary")
    if isinstance(confusion_boundary, list):
        sources.append(confusion_boundary)

    return sources


def _members_from_view(view: Any) -> list[Any]:
    if isinstance(view, dict) and isinstance(view.get("members"), list):
        return view["members"]
    return []


def _topic_kind(grounding: dict[str, Any]) -> str:
    query_mode = grounding.get("queryMode")
    learning_task = _learning_task(grounding)

    if query_mode == "direct_compare" or grounding.get("comparisonView"):
        return "direct_compare"
    if query_mode == "shape_neighbor_search":
        return "shape_neighbors"
    if learning_task == "word_family" or grounding.get("rootFamilyView"):
        return "word_family"
    if query_mode == "meaning_lookup":
        return "meaning_lookup"
    if _is_broad_vocab_grounding(grounding):
        return "broad_vocab"
    return "standard_lookup"


def _learning_task(grounding: dict[str, Any]) -> str | None:
    plan = grounding.get("learningIntentPlan")
    if isinstance(plan, dict):
        task = plan.get("task")
        if isinstance(task, str):
            return task
    return None


def _is_broad_vocab_grounding(grounding: dict[str, Any]) -> bool:
    query_mode = grounding.get("queryMode")
    answer_style = grounding.get("answerStyle")
    learning_task = _learning_task(grounding)
    broad_modes = {
        "root_family_summary",
        "shape_neighbor_search",
        "meaning_lookup",
        "broad_vocab",
    }
    broad_tasks = {
        "form_filter",
        "semantic_filter",
        "meaning_core",
        "shape_neighbors",
    }
    return (
        query_mode in broad_modes
        or answer_style in {"broad_vocab_summary", "root_family_summary"}
        or learning_task in broad_tasks
    )


def _available_actions(candidates: list[LearningCandidateRef]) -> list[str]:
    if len(candidates) == 1:
        return ["collect_one"]
    return ["collect_one", "collect_group"]


def _follow_up_intent(query: str) -> str | None:
    if _contains_any(query, ["收藏", "加入收藏", "收进生词本"]):
        return "collect"
    if _contains_any(query, ["什么意思", "是什么意思", "是什么", "啥意思", "是啥意思"]):
        return "meaning"
    if _contains_any(query, ["怎么用", "用法", "例句"]):
        return "usage"
    if _contains_any(query, ["区别", "区分", "辨析", "差别"]):
        return "compare"
    if _contains_any(query, ["怎么背", "怎么记", "记忆"]):
        return "memory"
    return None


def _reference_categories(
    query: str,
    context: ConversationalLearningContext | None,
) -> set[str]:
    categories: set[str] = set()

    if "倒数" in query:
        categories.add("unsupported_ordinal")

    ordinal_refs = _ordinal_refs_in_query(query)
    if any(index is None for index in ordinal_refs):
        categories.add("unsupported_ordinal")
    if any(index is not None for index in ordinal_refs):
        categories.add("ordinal")

    if "最后一个" in query:
        categories.add("last")
    if _contains_any(query, ["这组", "这几个", "上面那几个", "刚才那组"]):
        categories.add("group")
    if _contains_any(query, ["这个", "它", "刚才那个", "刚才那个词"]):
        categories.add("near")
    if _contains_explicit_candidate(query, context):
        categories.add("explicit")

    return categories


def _has_mixed_reference_categories(categories: set[str]) -> bool:
    contextual_categories = categories - {"explicit"}
    return (
        ("explicit" in categories and bool(contextual_categories))
        or len(contextual_categories) > 1
    )


def _follow_up_reference(query: str) -> str | int | None:
    if "倒数" in query:
        return "unsupported_ordinal"

    ordinal_refs = _ordinal_refs_in_query(query)
    supported_indexes = [index for index in ordinal_refs if index is not None]
    has_unsupported_ordinal = len(supported_indexes) != len(ordinal_refs)

    if "最后一个" in query and ordinal_refs:
        return "multiple_ordinals"
    if len(ordinal_refs) > 1:
        return "multiple_ordinals"
    if has_unsupported_ordinal:
        return "unsupported_ordinal"
    if len(supported_indexes) == 1:
        return supported_indexes[0]

    if "最后一个" in query:
        return "last"
    if _contains_any(query, ["这组", "这几个", "上面那几个", "刚才那组"]):
        return "group"
    if _contains_any(query, ["这个", "它", "刚才那个", "刚才那个词"]):
        return "near"
    return None


def _ordinal_refs_in_query(query: str) -> list[int | None]:
    refs: list[int | None] = []
    for match in re.finditer(r"第([0-9]+|[零〇一二两三四五六七八九十]+)[个個]", query):
        index = _parse_ordinal_number(match.group(1))
        refs.append(index if index in {1, 2, 3, 4, 5} else None)
    return refs


def _parse_ordinal_number(value: str) -> int | None:
    if value.isdigit():
        return int(value)

    digit_values = {
        "零": 0,
        "〇": 0,
        "一": 1,
        "二": 2,
        "两": 2,
        "三": 3,
        "四": 4,
        "五": 5,
        "六": 6,
        "七": 7,
        "八": 8,
        "九": 9,
    }
    if value in digit_values:
        return digit_values[value]
    if "十" not in value:
        return None

    parts = value.split("十")
    if len(parts) != 2:
        return None

    tens_text, ones_text = parts
    tens = 1 if not tens_text else digit_values.get(tens_text)
    ones = 0 if not ones_text else digit_values.get(ones_text)
    if tens is None or ones is None:
        return None
    return tens * 10 + ones


def _contains_explicit_candidate(
    query: str,
    context: ConversationalLearningContext | None,
) -> bool:
    if not context:
        return False
    lowered = query.lower()
    return any(candidate.lemma.lower() in lowered for candidate in context.candidates)


def _usable_context(context: ConversationalLearningContext | None) -> bool:
    return bool(context and context.expiresAfterTurns > 0 and context.candidates)


def _resolve_targets(
    reference: str | int,
    context: ConversationalLearningContext,
) -> list[LearningCandidateRef]:
    candidates = context.candidates

    if isinstance(reference, int):
        if 1 <= reference <= len(candidates):
            return [candidates[reference - 1]]
        return []

    if reference == "last":
        return [candidates[-1]] if candidates else []

    if reference == "group":
        return list(candidates)

    if reference == "near":
        if context.focus and context.focus.index:
            focus_index = context.focus.index
            if 1 <= focus_index <= len(candidates):
                return [candidates[focus_index - 1]]
        if len(candidates) == 1:
            return [candidates[0]]
        return []

    return []


def _rewrite_follow_up_query(
    intent: str,
    targets: list[LearningCandidateRef],
) -> str | None:
    lemmas = [candidate.lemma for candidate in targets]
    if not lemmas:
        return None

    if len(lemmas) == 1:
        lemma = lemmas[0]
        if intent == "meaning":
            return f"{lemma} 是什么意思"
        if intent == "usage":
            return f"{lemma} 怎么用"
        return None

    joined = " ".join(lemmas)
    if intent == "compare":
        return f"{joined} 怎么区分"
    if intent == "memory":
        return f"{joined} 怎么背"
    return None


def _reference_reason(reference: str | int) -> str:
    if isinstance(reference, int) or reference == "last":
        return "ordinal_target"
    if reference == "group":
        return "group_target"
    return "focused_target"


def _clarification(
    context: ConversationalLearningContext | None,
) -> dict[str, Any]:
    return {
        "kind": "clarification",
        "message": "我还不知道你说的是哪一个词。你可以点一个，或把那组词再发我一下。",
        "options": (
            [_candidate_payload(candidate) for candidate in context.candidates[:5]]
            if context
            else []
        ),
    }


def _candidate_payload(candidate: LearningCandidateRef) -> dict[str, Any]:
    return candidate.model_dump()


def _contains_any(value: str, patterns: list[str]) -> bool:
    return any(pattern in value for pattern in patterns)


def _meaning_zh(item: dict[str, Any]) -> str | None:
    value = item.get("meaningZh")
    if isinstance(value, str):
        return _compact_text(value)

    values = item.get("meaningsZh")
    if isinstance(values, list):
        parts = [_compact_text(value) for value in values if isinstance(value, str)]
        compacted = "；".join(part for part in parts if part)
        return compacted or None

    return None


def _compact_text(value: str) -> str:
    return " ".join(value.strip().split())


def _optional_str(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None
