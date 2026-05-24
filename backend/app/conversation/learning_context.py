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
