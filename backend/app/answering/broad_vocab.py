import re

from backend.app.answering.ordinary_lookup import exam_target_labels
from backend.app.retrieval.dynamic_light_grounding import LightGroundingCandidate
from backend.app.retrieval.types import normalize_part_of_speech_label


focused_answer_styles = {
    "direct_compare",
    "shape_neighbor_search",
}

strong_collection_signals = {
    "prefix",
    "suffix",
    "fragment",
    "meaning_keyword",
}

confusion_core_signals = {
    "exact",
    "edit_distance",
    "ngram_overlap",
    "common_prefix",
    "structured_group",
}

supplemental_form_signals = {
    "prefix",
    "suffix",
    "fragment",
    "meaning_keyword",
}

collection_confusion_cue_pattern = re.compile(
    r"(容易.*混|很像|形近|看错|看成|区分|怎么分|分不清|辨析)",
    re.IGNORECASE,
)


def signal_types(candidate: LightGroundingCandidate) -> set[str]:
    return {signal.type for signal in candidate.signals}


def signal_strength(
    candidate: LightGroundingCandidate,
    signal_names: set[str],
) -> int:
    return len(signal_types(candidate) & signal_names)


def signal_details(candidate: LightGroundingCandidate, signal_type: str) -> set[str]:
    return {
        signal.detail
        for signal in candidate.signals
        if signal.type == signal_type
    }


def candidate_lemmas(candidates: list[LightGroundingCandidate]) -> list[str]:
    return [candidate.lemma for candidate in candidates]


def has_reviewed_meaning(candidate: LightGroundingCandidate) -> bool:
    return bool(candidate.meanings_zh)


def split_meaning_confidence(candidates: list[LightGroundingCandidate]):
    answerable = [
        candidate
        for candidate in candidates
        if has_reviewed_meaning(candidate)
    ]
    candidate_only = [
        candidate
        for candidate in candidates
        if not has_reviewed_meaning(candidate)
    ]

    return answerable, candidate_only


def has_any_signal(
    candidate: LightGroundingCandidate,
    signal_names: set[str],
) -> bool:
    return bool(signal_types(candidate) & signal_names)


def broad_answer_style(normalized_query) -> str:
    intent_plan = getattr(normalized_query, "intent_plan", None)
    if intent_plan is not None:
        if intent_plan.task == "focused_compare":
            return "focused_compare"

        if intent_plan.task == "form_filter":
            return "strict_inventory"

        if intent_plan.task == "semantic_filter":
            return (
                "teacher_table"
                if any(
                    constraint.type == "meaning"
                    for constraint in intent_plan.constraints
                )
                else "strict_inventory"
            )

        if intent_plan.task in {"shape_neighbors", "word_family"}:
            return "teacher_table"

        if intent_plan.task == "meaning_core":
            return "meaning_core"

    if normalized_query.query_mode in focused_answer_styles:
        return "focused_compare"

    if normalized_query.query_mode == "meaning_lookup":
        return "meaning_core"

    if "+" in normalized_query.normalized_text:
        return "semantic_root_boundary"

    return "collection_map"


def answer_presentation(normalized_query) -> str | None:
    style = broad_answer_style(normalized_query)
    intent_plan = getattr(normalized_query, "intent_plan", None)

    if style == "strict_inventory":
        return "inventory_table"

    if style == "teacher_table":
        if intent_plan is not None and intent_plan.task == "word_family":
            return "word_family_table"

        if intent_plan is not None and intent_plan.task == "shape_neighbors":
            return "shape_neighbor_table"

        if intent_plan is not None and intent_plan.task == "semantic_filter":
            return "semantic_filter_table"

        return "teacher_table"

    if style == "collection_map":
        return "inventory_table"

    if (
        style == "meaning_core"
        and collection_confusion_cue_pattern.search(normalized_query.normalized_text)
    ):
        return "meaning_confusion_list"

    return None


def main_answer_limit(style: str, normalized_query=None) -> int:
    if style == "focused_compare":
        if (
            normalized_query is not None
            and normalized_query.query_mode == "shape_neighbor_search"
        ):
            return 6

        return 5

    if style == "meaning_core":
        return 5

    if style == "semantic_root_boundary":
        return 12

    if style == "strict_inventory":
        return 18

    if style == "teacher_table":
        intent_plan = getattr(normalized_query, "intent_plan", None)
        if intent_plan is not None and intent_plan.task == "word_family":
            return 8
        if intent_plan is not None and intent_plan.task == "shape_neighbors":
            return 6
        return 6

    return 18


def is_direct_compare_query(normalized_query) -> bool:
    return (
        normalized_query is not None
        and normalized_query.query_mode == "direct_compare"
    )


def candidate_budget(
    style: str,
    presentation: str | None = None,
    normalized_query=None,
) -> dict[str, str]:
    if style in {"collection_map", "strict_inventory"}:
        if presentation == "inventory_table":
            return {
                "groups": "0",
                "terms": "12-20",
                "rule": "Use a compact inventory table with word, POS, and meaning only.",
            }

        return {
            "groups": "3-5",
            "terms": "12-20",
            "rule": "Prioritize the most confusable core group, then list bounded same-form supplements.",
        }

    if style == "teacher_table":
        if presentation == "word_family_table":
            return {
                "groups": "1",
                "terms": "4-8",
                "rule": "Use a compact teacher table for grounded family candidates without claiming etymology.",
            }

        if presentation == "semantic_filter_table":
            return {
                "groups": "1",
                "terms": "2-6",
                "rule": "Use only candidates that satisfy the hard form and meaning constraints.",
            }

        return {
            "groups": "1",
            "terms": "3-6",
            "rule": "Use a compact teacher table with grounded candidates and one 注意 sentence.",
        }

    if style == "semantic_root_boundary":
        return {
            "groups": "2-4",
            "terms": "8-14",
            "rule": "Separate direct fragment matches from looser related candidates.",
        }

    if style == "meaning_core":
        if presentation == "meaning_confusion_list":
            return {
                "groups": "1",
                "terms": "3-5",
                "rule": "Use a compact word + POS + short meaning list, then one 注意 sentence.",
            }

        return {
            "groups": "1",
            "terms": "3-5",
            "rule": "Explain only the core expressions and their usage boundary.",
        }

    if style == "focused_compare" and is_direct_compare_query(normalized_query):
        return {
            "groups": "1",
            "terms": "explicit terms only",
            "rule": "Answer only the exact user-mentioned terms.",
        }

    return {
        "groups": "1-2",
        "terms": "3-5",
        "rule": "Answer explicit terms first; add at most one or two related terms.",
    }


def candidates_with_signal(
    candidates: list[LightGroundingCandidate],
    signal_type: str,
) -> list[LightGroundingCandidate]:
    return [
        candidate
        for candidate in candidates
        if signal_type in signal_types(candidate)
    ]


def exact_compare_candidates(
    normalized_query,
    candidates: list[LightGroundingCandidate],
) -> list[LightGroundingCandidate]:
    compare_terms = {
        term.lower()
        for term in getattr(normalized_query, "compare_terms", [])
    }
    if not compare_terms:
        return []

    return [
        candidate
        for candidate in candidates
        if any(
            signal.type == "exact" and signal.detail.lower() in compare_terms
            for signal in candidate.signals
        )
    ]


def build_candidate_sections(
    *,
    style: str,
    presentation: str | None,
    candidates: list[LightGroundingCandidate],
    answerable: list[LightGroundingCandidate],
    candidate_only: list[LightGroundingCandidate],
) -> list[dict[str, object]]:
    if style == "teacher_table":
        if presentation == "word_family_table":
            sections = [
                {
                    "role": "core_family_terms",
                    "lemmas": candidate_lemmas(answerable[:8]),
                },
            ]
        elif presentation == "shape_neighbor_table":
            exact = candidates_with_signal(answerable, "exact")
            exact_lemmas = {candidate.lemma for candidate in exact}
            shape_neighbors = [
                candidate
                for candidate in answerable
                if candidate.lemma not in exact_lemmas
            ]
            sections = []
            if exact:
                sections.append(
                    {
                        "role": "exact_user_terms",
                        "lemmas": candidate_lemmas(exact[:3]),
                    },
                )
            if shape_neighbors:
                sections.append(
                    {
                        "role": "core_shape_neighbors",
                        "lemmas": candidate_lemmas(shape_neighbors[:6]),
                    },
                )
        elif presentation == "semantic_filter_table":
            sections = [
                {
                    "role": "semantic_matches",
                    "lemmas": candidate_lemmas(answerable[:6]),
                },
            ]
        else:
            sections = [
                {
                    "role": "grounded_learning_associations",
                    "lemmas": candidate_lemmas(answerable[:6]),
                },
            ]

        if candidate_only:
            sections.append(
                {
                    "role": "candidate_only_no_reviewed_meaning",
                    "lemmas": candidate_lemmas(candidate_only[:8]),
                },
            )

        return [section for section in sections if section["lemmas"]]

    if style == "semantic_root_boundary":
        direct_matches = [
            candidate
            for candidate in answerable
            if any("+" in detail for detail in signal_details(candidate, "fragment"))
        ]
        related = [
            candidate
            for candidate in answerable
            if candidate not in direct_matches
        ]

        return [
            {
                "role": "direct_ordered_fragment_matches",
                "lemmas": candidate_lemmas(direct_matches[:6]),
            },
            {
                "role": "related_prefix_or_fragment_candidates",
                "lemmas": candidate_lemmas(related[:10]),
            },
        ]

    if style in {"focused_compare", "meaning_core"}:
        exact = candidates_with_signal(answerable, "exact")
        primary = (exact or answerable)[:5]
        primary_lemmas = {candidate.lemma for candidate in primary}
        related = [
            candidate
            for candidate in answerable
            if candidate.lemma not in primary_lemmas
        ]

        return [
            {
                "role": "primary_terms",
                "lemmas": candidate_lemmas(primary),
            },
            {
                "role": "optional_related_terms",
                "lemmas": candidate_lemmas(related[:2]),
            },
        ]

    sections: list[dict[str, object]] = []
    seen: set[str] = set()

    if presentation == "inventory_table":
        if answerable:
            sections.append(
                {
                    "role": "inventory_terms",
                    "lemmas": candidate_lemmas(answerable[:18]),
                },
            )
        if candidate_only:
            sections.append(
                {
                    "role": "candidate_only_no_reviewed_meaning",
                    "lemmas": candidate_lemmas(candidate_only[:8]),
                },
            )
        return sections

    core_candidates = [
        candidate
        for candidate in answerable
        if signal_strength(candidate, confusion_core_signals) >= 1
    ]
    if core_candidates:
        sections.append(
            {
                "role": "confusable_core_terms",
                "lemmas": candidate_lemmas(core_candidates[:5]),
            },
        )
        seen.update(candidate.lemma for candidate in core_candidates[:5])

    supplemental_candidates = [
        candidate
        for candidate in answerable
        if candidate.lemma not in seen
        and has_any_signal(candidate, supplemental_form_signals)
    ]
    if supplemental_candidates:
        sections.append(
            {
                "role": "supplemental_same_form_candidates",
                "lemmas": candidate_lemmas(supplemental_candidates[:12]),
            },
        )
        seen.update(candidate.lemma for candidate in supplemental_candidates[:12])

    if candidate_only:
        sections.append(
            {
                "role": "candidate_only_no_reviewed_meaning",
                "lemmas": candidate_lemmas(candidate_only[:8]),
            },
        )

    return sections


def build_answer_material(
    *,
    style: str,
    normalized_query,
    candidates: list[LightGroundingCandidate],
) -> tuple[
    list[LightGroundingCandidate],
    list[LightGroundingCandidate],
    list[LightGroundingCandidate],
]:
    if style in {"collection_map", "strict_inventory"}:
        semantic_candidates = candidates_with_signal(candidates, "meaning_keyword")
        strong_candidates = semantic_candidates or [
            candidate
            for candidate in candidates
            if has_any_signal(candidate, strong_collection_signals)
        ]
        answerable, candidate_only = split_meaning_confidence(strong_candidates)
        material_lemmas = {
            candidate.lemma
            for candidate in [*answerable, *candidate_only]
        }

        return (
            answerable,
            candidate_only,
            [
                candidate
                for candidate in candidates
                if candidate.lemma not in material_lemmas
            ],
        )

    if style == "teacher_table":
        limited = candidates[:main_answer_limit(style, normalized_query)]
        intent_plan = getattr(normalized_query, "intent_plan", None)

        if intent_plan is not None and intent_plan.task == "semantic_filter":
            limited = candidates_with_signal(limited, "meaning_keyword")

        answerable, candidate_only = split_meaning_confidence(limited)
        material_lemmas = {candidate.lemma for candidate in limited}

        return (
            answerable,
            candidate_only,
            [
                candidate
                for candidate in candidates
                if candidate.lemma not in material_lemmas
            ],
        )

    if style == "focused_compare":
        limited = (
            exact_compare_candidates(normalized_query, candidates)
            if is_direct_compare_query(normalized_query)
            else candidates[:main_answer_limit(style, normalized_query)]
        )
        material_lemmas = {candidate.lemma for candidate in limited}

        return (
            limited,
            [],
            [
                candidate
                for candidate in candidates
                if candidate.lemma not in material_lemmas
            ],
        )

    if style == "semantic_root_boundary":
        limited = candidates[:main_answer_limit(style, normalized_query)]
        direct_matches = [
            candidate
            for candidate in limited
            if any("+" in detail for detail in signal_details(candidate, "fragment"))
        ]
        related = [
            candidate
            for candidate in limited
            if candidate not in direct_matches
        ]
        answerable_related, candidate_only_related = split_meaning_confidence(related)
        answerable = [*direct_matches, *answerable_related]
        material_lemmas = {
            candidate.lemma
            for candidate in [*answerable, *candidate_only_related]
        }

        return (
            answerable,
            candidate_only_related,
            [
                candidate
                for candidate in candidates
                if candidate.lemma not in material_lemmas
            ],
        )

    limited = candidates[:main_answer_limit(style, normalized_query)]
    answerable, candidate_only = split_meaning_confidence(limited)
    material_lemmas = {candidate.lemma for candidate in limited}

    return (
        answerable,
        candidate_only,
        [
            candidate
            for candidate in candidates
            if candidate.lemma not in material_lemmas
        ],
    )


def build_broad_answer_plan(
    *,
    normalized_query,
    candidates: list[LightGroundingCandidate],
) -> dict[str, object]:
    style = broad_answer_style(normalized_query)
    presentation = answer_presentation(normalized_query)
    answerable, candidate_only, suppressed = build_answer_material(
        style=style,
        normalized_query=normalized_query,
        candidates=candidates,
    )
    rules = [
        "Use only grounding.lightCandidates as answer material.",
        "Use broadAnswerPlan.answerableLemmas for the main answer.",
        "Mention broadAnswerPlan.candidateOnlyLemmas only as matched candidates; do not supply definitions for them.",
        "Do not mention suppressedCandidateLemmas.",
    ]

    if style in {"collection_map", "strict_inventory"} and presentation == "inventory_table":
        rules.extend(
            [
                "For inventory_table, use a compact markdown table: 单词 | 词性 | 核心义.",
                "Do not split inventory answers into semantic group headings.",
                "Do not add a fourth column, reason column, notes column, or dash placeholders.",
                "Do not add remarks, reasons, notes, explanations, or wrap-up sentences.",
                "Do not claim same-root, derivation, or etymology in inventory answers.",
                "Do not invent broad semantic category titles for weakly related candidates.",
            ],
        )
    elif style == "collection_map":
        rules.extend(
            [
                "For collection_map, return 3-5 learning groups with 12-20 total terms when enough candidates exist.",
                "Start with the most confusable core group.",
                "For the core group, include one short core difference sentence.",
                "Use supplemental candidates only after the core group.",
                "Do not invent broad semantic category titles for weakly related candidates.",
            ],
        )

    if style == "teacher_table":
        rules.extend(
            [
                "For teacher_table, use compact word + POS + short meaning lines.",
                "Add at most one 注意 sentence after the list.",
                "Do not claim same-root, derivation, or etymology unless grounding explicitly says so.",
                "Do not invent terms outside broadAnswerPlan answer material.",
            ],
        )

    if style == "meaning_core" and presentation == "meaning_confusion_list":
        rules.extend(
            [
                "For meaning_confusion_list, list each term as word + POS + short meaning.",
                "Put each term on its own line; do not combine multiple terms in one sentence.",
                "After the list, add exactly one 注意 sentence for the core boundary.",
                "Do not add an opening sentence, examples, collocations, or paragraph-style explanations.",
            ],
        )

    rules.extend(
        [
            "For direct_compare focused_compare, answer only the exact user-mentioned terms.",
            "For shape_neighbor focused_compare, answer a compact lookalike candidate list.",
            "For meaning_core, keep only the core expressions and usage boundary.",
            "For semantic_root_boundary, say when this is not a stable root family and separate direct matches from loose related candidates.",
            "Do not add collocations, usage columns, example phrases, or derived forms.",
            "Do not repeat activeExamTargetLabel or supportLabel in the answer body.",
            "For each answerable term, include partOfSpeech plus one short meaning from meaningsZh.",
            "For each answerable term, include one short meaning from meaningsZh.",
            "Use POS abbreviations like n., v., adj.; do not expand them to noun, verb, adjective.",
            "Do not invent mnemonics, rhymes, practice questions, or memory-card endings.",
            "Do not end with a follow-up invitation.",
        ],
    )

    return {
        "style": style,
        "presentation": presentation,
        "candidateBudget": candidate_budget(style, presentation, normalized_query),
        "answerableLemmas": candidate_lemmas(answerable),
        "candidateOnlyLemmas": candidate_lemmas(candidate_only),
        "suppressedCandidateLemmas": candidate_lemmas(suppressed),
        "candidateSections": build_candidate_sections(
            style=style,
            presentation=presentation,
            candidates=candidates,
            answerable=answerable,
            candidate_only=candidate_only,
        ),
        "rules": rules,
    }


def format_broad_candidate_line(candidate: LightGroundingCandidate) -> str:
    meaning = "；".join(candidate.meanings_zh[:2]) or "释义待补"
    part_of_speech = normalize_part_of_speech_label(candidate.part_of_speech)

    if part_of_speech:
        return f"{candidate.lemma} {part_of_speech} {meaning}".strip()

    return f"{candidate.lemma} {meaning}".strip()


def build_broad_vocab_answer(
    candidates: list[LightGroundingCandidate],
    normalized_query=None,
) -> str:
    if not normalized_query:
        selected = candidates[:18]
        return "\n".join(format_broad_candidate_line(candidate) for candidate in selected)

    answer_plan = build_broad_answer_plan(
        normalized_query=normalized_query,
        candidates=candidates,
    )
    material_lemmas = [
        *answer_plan["answerableLemmas"],
        *answer_plan["candidateOnlyLemmas"],
    ]
    material_lemma_set = set(material_lemmas)
    selected = [
        candidate
        for candidate in candidates
        if candidate.lemma in material_lemma_set
    ][:len(material_lemmas)]
    lines = [format_broad_candidate_line(candidate) for candidate in selected]

    if answer_plan["style"] == "focused_compare":
        note = (
            "注意：先按这几个词的核心义区分。"
            if is_direct_compare_query(normalized_query)
            else "注意：这些是按当前词书候选和词形相近度整理的初步候选，先看核心义差别。"
        )
        lines.extend(
            [
                "",
                note,
            ],
        )
    elif answer_plan["presentation"] == "meaning_confusion_list":
        lines.extend(["", "注意：先按中文核心义区分这些词。"])
    elif answer_plan["style"] == "semantic_root_boundary":
        lines.extend(["", "注意：这里先按词形命中整理，不硬说成固定词根。"])
    elif answer_plan["style"] == "teacher_table":
        if answer_plan["presentation"] == "word_family_table":
            note_terms = [
                lemma
                for lemma in answer_plan["answerableLemmas"]
                if lemma not in set(getattr(normalized_query, "english_terms", []))
            ][:3]
            if note_terms:
                lines.extend(["", f"注意：先区分 {' / '.join(note_terms)}。"])
        else:
            lines.extend(["", "注意：先按词形线索和中文核心义一起看。"])

    return "\n".join(lines)


def build_broad_vocab_system_prompt() -> str:
    return (
        "你是 EngGo 的动态轻 grounding 泛词汇总结助手。"
        "这些候选来自当前考试词表，不代表完整人工易混组。"
        "主答案只能围绕 grounding.lightCandidates；优先讲用户明确提到的词。"
        "必须读取 grounding.broadAnswerPlan，并按其中 style 控制信息密度："
        "collection_map + inventory_table = use only a compact table with columns 单词 | 词性 | 核心义; Do not split inventory answers into semantic group headings；"
        "For collection_map, do not add a fourth column, reason column, notes column, dash placeholders, explanations, comparison sentences, or wrap-up sentences；"
        "Do not claim same-root, derivation, or etymology in inventory_table answers；"
        "direct_compare + focused_compare = only exact user-mentioned terms；"
        "shape_neighbor + focused_compare = compact lookalike candidate list；"
        "meaning_core = 3-5 core expressions with usage boundaries；"
        "meaning_core + meaning_confusion_list = list each term as word + POS + short meaning, put each term on its own line, then exactly one 注意 sentence for the core boundary；"
        "semantic_root_boundary = separate direct fragment matches from loose related candidates, and say it is not a stable root family when needed。"
        "不要把候选外词作为主答案，不要声称这些就是全部同根词或全部易混词，"
        "也不要讲过度词源理论。候选质量弱时，要说明这是基于词库候选的初步整理。"
        "Use broadAnswerPlan.answerableLemmas for the main answer. "
        "Mention broadAnswerPlan.candidateOnlyLemmas only as matched candidates, without definitions. "
        "Do not mention suppressedCandidateLemmas. "
        "Do not mention vocabulary outside answerableLemmas or candidateOnlyLemmas, even as examples. "
        "Use markdown tables only when broadAnswerPlan.presentation is inventory_table. "
        "Do not add remarks, reasons, notes, explanations, or wrap-up sentences for inventory_table. "
        "Do not add collocations, usage columns, example phrases, or derived forms. "
        "For meaning_confusion_list: Do not add an opening sentence, examples, collocations, or paragraph-style explanations. "
        "Put each term on its own line; do not combine multiple terms in one sentence. "
        "Do not invent broad semantic category titles for weakly related candidates. "
        "Do not repeat activeExamTargetLabel or supportLabel in the answer body. "
        "For each answerable term, include partOfSpeech plus one short meaning from meaningsZh. "
        "For each answerable term, include one short meaning from meaningsZh. "
        "Use POS abbreviations like n., v., adj.; do not expand them to noun, verb, adjective. "
        "Do not invent mnemonics, rhymes, practice questions, or memory-card endings. "
        "Do not end with a follow-up invitation. "
        "Do not use emoji, decorative icons, or horizontal rules. "
        "Do not confidently explain source-only candidates that have no meanings; mark them as candidate terms with meanings to be reviewed."
    )


def strip_provider_scope_metadata(value):
    if isinstance(value, list):
        return [strip_provider_scope_metadata(item) for item in value]

    if isinstance(value, dict):
        return {
            key: strip_provider_scope_metadata(item)
            for key, item in value.items()
            if key != "scopeCodes"
        }

    return value


def build_broad_vocab_provider_grounding(
    grounding: dict[str, object],
) -> dict[str, object]:
    hidden_keys = {
        "activeExamTarget",
        "activeExamTargetLabel",
        "supportLabel",
        "scopeReminder",
    }

    return {
        key: strip_provider_scope_metadata(value)
        for key, value in grounding.items()
        if key not in hidden_keys
    }


def build_broad_vocab_grounding(
    *,
    active_exam_target: str,
    query: str,
    normalized_query,
    candidates: list[LightGroundingCandidate],
) -> dict[str, object]:
    answer_plan = build_broad_answer_plan(
        normalized_query=normalized_query,
        candidates=candidates,
    )
    material_lemmas = [
        *answer_plan["answerableLemmas"],
        *answer_plan["candidateOnlyLemmas"],
    ]
    material_lemma_set = set(material_lemmas)
    selected = [
        candidate
        for candidate in candidates
        if candidate.lemma in material_lemma_set
    ][:len(material_lemmas)]
    support_candidates = selected or candidates
    external_only = bool(support_candidates) and all(
        candidate.source_kind == "external_dictionary_basic"
        for candidate in support_candidates
    )
    external_exam_tagged = external_only and all(
        active_exam_target in candidate.scope_codes
        for candidate in support_candidates
    )
    support_label = (
        f"基于 ECDICT {exam_target_labels[active_exam_target]}标签候选总结"
        if external_exam_tagged
        else "基于外部基础词典候选总结"
        if external_only
        else f"基于 {exam_target_labels[active_exam_target]} 词库候选总结"
    )

    return {
        "activeExamTarget": active_exam_target,
        "activeExamTargetLabel": exam_target_labels[active_exam_target],
        "query": query,
        "queryMode": normalized_query.query_mode,
        "learningIntentPlan": (
            normalized_query.intent_plan.to_json()
            if getattr(normalized_query, "intent_plan", None) is not None
            else None
        ),
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
        "broadAnswerPlan": answer_plan,
        "supportLabel": support_label,
        "containsCuratedGroup": any(
            candidate.structured_group_ids
            for candidate in candidates
        ),
        "scopeReminder": support_label,
        "followUpPrompt": "继续指定其中一组深入区分",
        "comparisonView": None,
        "rootFamilyView": None,
        "spellingCorrection": None,
    }
