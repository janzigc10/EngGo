from backend.app.answering.ordinary_lookup import exam_target_labels
from backend.app.retrieval.dynamic_light_grounding import LightGroundingCandidate


def build_broad_vocab_answer(candidates: list[LightGroundingCandidate]) -> str:
    lines = [
        " / ".join(candidate.lemma for candidate in candidates[:6]),
        "",
    ]

    for candidate in candidates[:6]:
        meaning = "；".join(candidate.meanings_zh[:2]) or "暂无结构化中文释义"
        part_of_speech = f"{candidate.part_of_speech} " if candidate.part_of_speech else ""
        lines.append(f"- {candidate.lemma}: {part_of_speech}{meaning}".strip())

    return "\n".join(lines)


def build_broad_vocab_system_prompt() -> str:
    return (
        "你是 EngGo 的动态轻 grounding 泛词汇总结助手。"
        "这些候选来自当前考试词表，不代表完整人工易混组。"
        "主答案只能围绕 grounding.lightCandidates；优先讲用户明确提到的词。"
        "不要把候选外词作为主答案，不要声称这些就是全部同根词或全部易混词，"
        "也不要讲过度词源理论。候选质量弱时，要说明这是基于词库候选的初步整理。"
    )


def build_broad_vocab_grounding(
    *,
    active_exam_target: str,
    query: str,
    normalized_query,
    candidates: list[LightGroundingCandidate],
) -> dict[str, object]:
    selected = candidates[:6]
    support_label = f"基于 {exam_target_labels[active_exam_target]} 词库候选总结"

    return {
        "activeExamTarget": active_exam_target,
        "activeExamTargetLabel": exam_target_labels[active_exam_target],
        "query": query,
        "queryMode": normalized_query.query_mode,
        "broadQueryMode": "broad_vocab",
        "answerStyle": "broad_vocab_summary",
        "groundingStrength": "light",
        "resolution": "resolved",
        "noMatchReason": None,
        "matchType": None,
        "mainAnswer": [candidate.to_json() for candidate in selected],
        "confusionBoundary": [],
        "candidates": [candidate.to_json() for candidate in candidates],
        "lightCandidates": [candidate.to_json() for candidate in candidates],
        "selectedMainTerms": [candidate.lemma for candidate in selected],
        "supportLabel": support_label,
        "containsCuratedGroup": any(
            candidate.structured_group_ids
            for candidate in candidates
        ),
        "scopeReminder": support_label,
        "followUpPrompt": "如果你愿意，我可以继续把这组候选拆成更短的记忆卡。",
        "comparisonView": None,
        "rootFamilyView": None,
        "spellingCorrection": None,
    }
