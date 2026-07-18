from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


ExamTarget = Literal["gaokao", "cet4", "cet6", "postgrad"]
MessageRole = Literal["user", "assistant"]
AnswerKind = Literal["grounded", "plain"]
AnswerSurfaceType = Literal[
    "lookup",
    "phrase_lookup",
    "candidate_list",
    "compare",
    "expression_advice",
    "context_choice",
    "root_family",
    "clarification",
    "plain",
]


def _compact_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None

    compacted = value.strip()
    return compacted or None


def _string_list(value: Any) -> list[str]:
    if isinstance(value, str):
        compacted = value.strip()
        return [compacted] if compacted else []

    if not isinstance(value, list):
        return []

    return [
        item.strip()
        for item in value
        if isinstance(item, str) and item.strip()
    ]


def _normalized_answer_lines(answer: str) -> list[str]:
    return [
        line.strip()
        for line in answer.replace("\r\n", "\n").split("\n")
        if line.strip()
    ]


def _answer_line_for_lemma(lines: list[str], lemma: str) -> str | None:
    normalized_lemma = lemma.strip().lower()
    if not normalized_lemma:
        return None

    for line in lines:
        lowered = line.lower()
        if lowered == normalized_lemma or lowered.startswith(f"{normalized_lemma} "):
            return line

    return None


def _strip_lemma_prefix(line: str, lemma: str) -> str:
    normalized_lemma = lemma.strip()
    if not normalized_lemma:
        return line.strip()

    lowered = line.lower()
    lemma_lowered = normalized_lemma.lower()
    if lowered == lemma_lowered:
        return ""

    if lowered.startswith(f"{lemma_lowered} "):
        return line[len(normalized_lemma):].strip()

    return line.strip()


def _candidate_meaning(candidate: dict[str, Any], lines: list[str]) -> str | None:
    meaning = "；".join(_string_list(candidate.get("meaningsZh")))
    if not meaning:
        meaning = _compact_string(candidate.get("meaningZh")) or ""
    if not meaning:
        meaning = _compact_string(candidate.get("modernMeaningZh")) or ""

    if meaning:
        return meaning

    lemma = _compact_string(candidate.get("lemma")) or ""
    answer_line = _answer_line_for_lemma(lines, lemma)
    if answer_line:
        stripped = _strip_lemma_prefix(answer_line, lemma)
        if stripped:
            return stripped

    return _compact_string(candidate.get("reason"))


def _surface_item(
    candidate: Any,
    *,
    lines: list[str],
    fallback_index: int,
) -> dict[str, Any] | None:
    if not isinstance(candidate, dict):
        return None

    lemma = _compact_string(candidate.get("lemma"))
    if not lemma:
        return None

    item = {
        "id": (
            _compact_string(candidate.get("entryId"))
            or _compact_string(candidate.get("id"))
            or f"{lemma}-{fallback_index}"
        ),
        "lemma": lemma,
        "label": _compact_string(candidate.get("label")) or lemma,
        "partOfSpeech": _compact_string(candidate.get("partOfSpeech")),
        "meaningZh": _candidate_meaning(candidate, lines),
        "sourceKind": _compact_string(candidate.get("sourceKind")),
        "entryKind": _compact_string(candidate.get("entryKind")),
        "reason": _compact_string(candidate.get("reason")),
        "prefix": _compact_string(candidate.get("prefix")),
        "priority": _compact_string(candidate.get("priority")),
        "inScope": (
            candidate.get("inScope")
            if isinstance(candidate.get("inScope"), bool)
            else None
        ),
        "reviewStatus": _compact_string(candidate.get("reviewStatus")),
    }

    return {key: value for key, value in item.items() if value is not None}


def _surface_items(candidates: Any, *, lines: list[str]) -> list[dict[str, Any]]:
    if not isinstance(candidates, list):
        return []

    items = [
        _surface_item(candidate, lines=lines, fallback_index=index)
        for index, candidate in enumerate(candidates)
    ]
    return [item for item in items if item is not None]


def _lookup_answer_title(lines: list[str], item: dict[str, Any]) -> str:
    first_line = lines[0] if lines else ""
    if first_line and len(first_line) <= 80 and not first_line.startswith(("#", "|", "- ")):
        return first_line

    return str(item["lemma"])


def _lookup_answer_body(lines: list[str], title: str) -> str | None:
    if not lines:
        return None

    if lines[0].strip().lower() == title.strip().lower():
        body = " ".join(lines[1:]).strip()
        return body or None

    return None


def _is_phrase_lookup_item(item: dict[str, Any], title: str) -> bool:
    entry_kind = _compact_string(item.get("entryKind"))
    if entry_kind == "phrase":
        return True

    part_of_speech = (_compact_string(item.get("partOfSpeech")) or "").lower()
    if part_of_speech.startswith("phr"):
        return True

    meaning = (_compact_string(item.get("meaningZh")) or "").lower()
    if meaning.startswith("phr."):
        return True

    return " " in title.strip() or " " in str(item["lemma"]).strip()


def _members_from_comparison_view(
    comparison_view: Any,
    *,
    lines: list[str],
) -> list[dict[str, Any]]:
    if not isinstance(comparison_view, dict):
        return []

    return _surface_items(comparison_view.get("members"), lines=lines)


def _is_expression_advice_grounding(grounding: dict[str, Any]) -> bool:
    return (
        grounding.get("queryMode") == "semantic_expression"
        or grounding.get("answerStyle")
        in {"semantic_expression", "meaning_expression_advice"}
    )


def _is_candidate_list_grounding(grounding: dict[str, Any]) -> bool:
    query_mode = grounding.get("queryMode")
    answer_style = grounding.get("answerStyle")
    learning_task = None
    intent_plan = grounding.get("learningIntentPlan")
    if isinstance(intent_plan, dict):
        learning_task = intent_plan.get("task")

    return (
        query_mode in {
            "fuzzy_recall",
            "shape_neighbor_search",
            "root_family_summary",
        }
        or answer_style == "broad_vocab_summary"
        or grounding.get("broadQueryMode") == "broad_vocab"
        or learning_task in {"shape_neighbors", "word_family", "form_filter"}
    )


def _is_spelling_clarification_grounding(grounding: dict[str, Any]) -> bool:
    return (
        grounding.get("resolution") == "needs_clarification"
        and grounding.get("spellingDecision") == "clarify_candidates"
    )


def _lookup_surface(
    *,
    answer: str,
    grounding: dict[str, Any],
    lines: list[str],
) -> dict[str, Any] | None:
    items = _surface_items(grounding.get("mainAnswer"), lines=lines)
    if len(items) != 1:
        return None

    item = items[0]
    is_spelling_auto_correct = grounding.get("spellingDecision") == "auto_correct"
    title = (
        str(item["lemma"])
        if is_spelling_auto_correct
        else _lookup_answer_title(lines, item)
    )
    body = _lookup_answer_body(lines, title)
    if body and (
        not _compact_string(item.get("meaningZh"))
        or _compact_string(item.get("meaningZh")) == _compact_string(item.get("reason"))
    ):
        item = {
            **item,
            "meaningZh": body,
        }
        items = [item]

    surface_type: AnswerSurfaceType = (
        "lookup"
        if is_spelling_auto_correct
        else (
            "phrase_lookup"
            if _is_phrase_lookup_item(item, title)
            else "lookup"
        )
    )
    return {
        "type": surface_type,
        "title": title,
        "subtitle": "短语" if surface_type == "phrase_lookup" else None,
        "text": answer,
        "items": items,
    }


def build_answer_surface(
    *,
    answer: str,
    answer_kind: AnswerKind | None,
    grounding: dict[str, Any] | None,
    resolved_follow_up: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if resolved_follow_up and resolved_follow_up.get("kind") == "clarification":
        return {
            "type": "clarification",
            "title": "需要你确认一下",
            "text": answer,
            "items": _surface_items(resolved_follow_up.get("options"), lines=[]),
        }

    if resolved_follow_up and resolved_follow_up.get("action") == "context_choice":
        return {
            "type": "context_choice",
            "title": "候选内选择",
            "text": answer,
            "items": _surface_items(resolved_follow_up.get("targetRefs"), lines=[]),
        }

    if resolved_follow_up and resolved_follow_up.get("action") == "show_more":
        items = _surface_items(resolved_follow_up.get("targetRefs"), lines=[])
        return {
            "type": "candidate_list",
            "title": f"找到 {len(items)} 个词" if items else "没有更多稳定候选",
            "text": answer,
            "items": items,
        }

    if not grounding:
        return {
            "type": "plain",
            "text": answer,
        }

    lines = _normalized_answer_lines(answer)

    if _is_spelling_clarification_grounding(grounding):
        items = _surface_items(grounding.get("candidates"), lines=lines)[:3]
        if items:
            subtitle = (
                _compact_string(grounding.get("supportLabel"))
                or _compact_string(grounding.get("activeExamTargetLabel"))
            )
            return {
                "type": "candidate_list",
                "title": f"找到 {len(items)} 个可能的词",
                "subtitle": subtitle,
                "text": answer,
                "items": items,
            }

    if _is_expression_advice_grounding(grounding):
        return {
            "type": "expression_advice",
            "title": "表达建议",
            "text": answer,
            "terms": _string_list(grounding.get("terms")),
            "meaningHint": _compact_string(grounding.get("meaningHint")),
            "style": _compact_string(grounding.get("style")),
            "options": _surface_items(grounding.get("expressionOptions"), lines=lines),
        }

    if (
        grounding.get("resolution") == "resolved"
        and grounding.get("queryMode") == "direct_compare"
    ):
        comparison_members = _members_from_comparison_view(
            grounding.get("comparisonView"),
            lines=lines,
        )
        members = comparison_members or _surface_items(
            grounding.get("mainAnswer"),
            lines=lines,
        )
        if len(members) >= 2:
            return {
                "type": "compare",
                "title": "核心区别",
                "text": answer,
                "members": members,
                "source": "comparison_view" if comparison_members else "main_answer",
            }

    if (
        grounding.get("resolution") == "resolved"
        and isinstance(grounding.get("rootFamilyView"), dict)
    ):
        root_family_view = grounding["rootFamilyView"]
        members = _surface_items(root_family_view.get("members"), lines=lines)
        if members:
            return {
                "type": "root_family",
                "title": _compact_string(root_family_view.get("fragment")) or "词族",
                "subtitle": _compact_string(root_family_view.get("coreImage")),
                "note": _compact_string(root_family_view.get("note")),
                "caution": _compact_string(root_family_view.get("caution")),
                "text": answer,
                "members": members,
                "source": "root_family_view",
            }

    if grounding.get("resolution") == "resolved" and _is_candidate_list_grounding(grounding):
        items = _surface_items(grounding.get("mainAnswer"), lines=lines)
        if len(items) > 1:
            subtitle = (
                _compact_string(grounding.get("supportLabel"))
                or _compact_string(grounding.get("activeExamTargetLabel"))
            )
            return {
                "type": "candidate_list",
                "title": f"找到 {len(items)} 个词",
                "subtitle": subtitle,
                "text": answer,
                "items": items,
            }

    if grounding.get("resolution") == "resolved":
        lookup = _lookup_surface(answer=answer, grounding=grounding, lines=lines)
        if lookup:
            return lookup

    return {
        "type": "plain",
        "text": answer,
    }


class LearningCandidateRef(BaseModel):
    index: int
    lemma: str
    label: str
    entryId: str | None = None
    sourceKind: str | None = None
    partOfSpeech: str | None = None
    meaningZh: str | None = None
    reviewStatus: str | None = None


class LearningFocus(BaseModel):
    kind: Literal["lemma", "phrase", "candidate_group", "meaning_candidate"]
    label: str
    lemma: str | None = None
    index: int | None = None


class ConversationalLearningContext(BaseModel):
    version: Literal[1] = 1
    activeExamTarget: ExamTarget
    activeWordbookId: str | None = None
    sourceMessageId: str
    topicKind: str
    sourceQuery: str | None = None
    focus: LearningFocus | None = None
    candidates: list[LearningCandidateRef] = Field(default_factory=list)
    continuationCandidates: list[LearningCandidateRef] = Field(default_factory=list)
    availableActions: list[str] = Field(default_factory=list)
    expiresAfterTurns: int = 2


class ChatHistoryMessage(BaseModel):
    role: MessageRole
    content: str = Field(min_length=1)

    @field_validator("content")
    @classmethod
    def strip_content(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("message content is required")
        return stripped


class ChatRequest(BaseModel):
    activeExamTarget: ExamTarget
    activeWordbookId: str | None = None
    query: str = Field(min_length=1)
    history: list[ChatHistoryMessage] = Field(default_factory=list)
    conversationContext: ConversationalLearningContext | None = None

    @field_validator("query")
    @classmethod
    def strip_query(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("query is required")
        return stripped


class ChatError(BaseModel):
    code: str
    message: str
    details: Any | None = None


class ChatSuccessResponse(BaseModel):
    answer: str
    answerKind: AnswerKind | None = None
    grounding: dict[str, Any] | None = None
    answerSurface: dict[str, Any] | None = None
    requestId: str
    providerRequestId: str | None = None
    conversationContext: ConversationalLearningContext | None = None
    resolvedFollowUp: dict[str, Any] | None = None

    @model_validator(mode="after")
    def fill_answer_surface(self):
        if self.answerSurface is None:
            self.answerSurface = build_answer_surface(
                answer=self.answer,
                answer_kind=self.answerKind,
                grounding=self.grounding,
                resolved_follow_up=self.resolvedFollowUp,
            )

        return self


class ChatErrorResponse(BaseModel):
    error: ChatError
    requestId: str
    providerRequestId: str | None = None
