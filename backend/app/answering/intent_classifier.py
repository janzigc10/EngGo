from dataclasses import dataclass
import json
import re
from typing import Any, Literal

from backend.app.answering.provider import ChatProviderError
from backend.app.retrieval.normalize_query import extract_english_terms, normalize_ascii
from backend.app.schemas.chat import ConversationalLearningContext, ExamTarget


ClassifiedIntentName = Literal[
    "ordinary_lookup",
    "direct_compare",
    "advanced_lookup",
    "semantic_expression",
    "semantic_style_followup",
    "bounded_plain",
    "clarification",
]

allowed_intents = {
    "ordinary_lookup",
    "direct_compare",
    "advanced_lookup",
    "semantic_expression",
    "semantic_style_followup",
    "bounded_plain",
    "clarification",
}
allowed_styles = {"formal", "essay", "spoken", "common", "exam"}


@dataclass(frozen=True)
class ClassifiedIntent:
    intent: ClassifiedIntentName
    confidence: float
    terms: tuple[str, ...] = ()
    meaning_hint: str | None = None
    style: str | None = None
    reason: str | None = None
    provider_request_id: str | None = None

    def to_json(self) -> dict[str, object]:
        return {
            "intent": self.intent,
            "confidence": self.confidence,
            "terms": list(self.terms),
            "meaningHint": self.meaning_hint,
            "style": self.style,
            "reason": self.reason,
            "providerRequestId": self.provider_request_id,
        }


def build_intent_classifier_prompt() -> str:
    return "\n".join(
        [
            "你是 EngGo 的受控意图分类器，只返回 JSON，不要输出解释文本。",
            "你不能调用工具，也不能生成最终答案。",
            "只从 allowedIntents 里选择 intent。",
            "terms 只能来自用户原文英文 token 或 grounding.contextCandidates。",
            "不要新增、扩展或替换用户没有提到的英文词。",
            "style 只能是 formal、essay、spoken、common、exam 或 null。",
            "如果没有足够上下文，不要猜 semantic_style_followup，应返回 clarification。",
            "输出格式：{\"intent\":\"semantic_expression\",\"confidence\":0.86,\"terms\":[\"follow\"],\"meaningHint\":null,\"style\":\"formal\",\"reason\":\"...\"}",
        ],
    )


def context_candidate_terms(context: ConversationalLearningContext | None) -> set[str]:
    if context is None:
        return set()
    return {
        candidate.lemma.lower()
        for candidate in context.candidates
        if candidate.lemma
    }


def classifier_grounding(
    *,
    active_exam_target: ExamTarget,
    rule_plan: dict[str, object],
    context: ConversationalLearningContext | None,
) -> dict[str, object]:
    return {
        "allowedIntents": sorted(allowed_intents),
        "allowedStyles": sorted(allowed_styles),
        "activeExamTarget": active_exam_target,
        "rulePlan": rule_plan,
        "contextCandidates": [
            candidate.model_dump()
            for candidate in (context.candidates if context else [])
        ],
        "rules": [
            "Classify intent only.",
            "Return strict JSON.",
            "Do not invent terms outside user text or contextCandidates.",
            "Use semantic_expression for synonym, formal-expression, writing-style wording.",
        ],
    }


def extract_json_object(text: str) -> dict[str, Any] | None:
    stripped = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", stripped, re.DOTALL)
    if fenced:
        stripped = fenced.group(1)
    elif "{" in stripped and "}" in stripped:
        stripped = stripped[stripped.find("{"): stripped.rfind("}") + 1]

    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        return None

    return payload if isinstance(payload, dict) else None


def normalize_terms(values: Any) -> tuple[str, ...]:
    if not isinstance(values, list):
        return ()

    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        if not isinstance(value, str):
            continue
        normalized = value.strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return tuple(result)


def parse_classifier_payload(
    payload: dict[str, Any],
    *,
    provider_request_id: str | None = None,
) -> ClassifiedIntent | None:
    intent = payload.get("intent")
    if not isinstance(intent, str) or intent not in allowed_intents:
        return None

    confidence = payload.get("confidence")
    if not isinstance(confidence, int | float):
        return None

    style = payload.get("style")
    if style is not None:
        if not isinstance(style, str):
            return None
        style = style.strip().lower()
        if style not in allowed_styles:
            return None

    meaning_hint = payload.get("meaningHint")
    if meaning_hint is not None and not isinstance(meaning_hint, str):
        return None

    reason = payload.get("reason")
    if reason is not None and not isinstance(reason, str):
        reason = None

    return ClassifiedIntent(
        intent=intent,  # type: ignore[arg-type]
        confidence=max(0.0, min(float(confidence), 1.0)),
        terms=normalize_terms(payload.get("terms")),
        meaning_hint=meaning_hint.strip() if isinstance(meaning_hint, str) and meaning_hint.strip() else None,
        style=style,
        reason=reason.strip() if isinstance(reason, str) and reason.strip() else None,
        provider_request_id=provider_request_id,
    )


def validate_classified_intent(
    decision: ClassifiedIntent,
    *,
    query: str,
    context: ConversationalLearningContext | None,
) -> ClassifiedIntent | None:
    if decision.confidence < 0.7:
        return None

    query_terms = set(extract_english_terms(normalize_ascii(query)))
    allowed_terms = query_terms | context_candidate_terms(context)
    verified_terms = tuple(term for term in decision.terms if term in allowed_terms)

    if decision.intent == "direct_compare" and len(verified_terms) < 2:
        return None

    if decision.intent == "semantic_style_followup":
        if context is None or not context.candidates:
            return None
        if decision.style is None:
            return None

    if decision.intent == "semantic_expression":
        if not verified_terms and not decision.meaning_hint:
            return None

    return ClassifiedIntent(
        intent=decision.intent,
        confidence=decision.confidence,
        terms=verified_terms,
        meaning_hint=decision.meaning_hint,
        style=decision.style,
        reason=decision.reason,
        provider_request_id=decision.provider_request_id,
    )


def classify_grey_zone_intent(
    *,
    provider,
    query: str,
    history: list[dict[str, str]],
    request_id: str,
    active_exam_target: ExamTarget,
    rule_plan: dict[str, object],
    context: ConversationalLearningContext | None,
) -> ClassifiedIntent | None:
    if provider is None:
        return None

    try:
        result = provider.generate_answer(
            query=query,
            history=history,
            request_id=request_id,
            system_prompt=build_intent_classifier_prompt(),
            grounding=classifier_grounding(
                active_exam_target=active_exam_target,
                rule_plan=rule_plan,
                context=context,
            ),
        )
    except ChatProviderError:
        return None

    payload = extract_json_object(result.answer)
    if payload is None:
        return None

    parsed = parse_classifier_payload(
        payload,
        provider_request_id=result.provider_request_id,
    )
    if parsed is None:
        return None

    return validate_classified_intent(
        parsed,
        query=query,
        context=context,
    )
