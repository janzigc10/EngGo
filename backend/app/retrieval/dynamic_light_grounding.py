import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from backend.app.content.ecdict import EcdictBasicProfile
from backend.app.content.source_lemmas import load_source_lemma_memberships
from backend.app.retrieval.learning_intent import IntentConstraint, LearningIntentPlan
from backend.app.retrieval.types import ConfusionGroup, RetrievalCandidate
from backend.app.retrieval.types import normalize_part_of_speech_label


@dataclass(frozen=True)
class LightGroundingSignal:
    type: str
    weight: int
    detail: str

    def to_json(self) -> dict[str, object]:
        return {
            "type": self.type,
            "weight": self.weight,
            "detail": self.detail,
        }


def is_public_signal(signal: LightGroundingSignal) -> bool:
    return not signal.type.startswith("_")


@dataclass(frozen=True)
class LightGroundingCandidate:
    entry_id: str
    lemma: str
    meanings_zh: list[str]
    scope_codes: list[str]
    in_scope: bool
    reason: str
    score: int
    part_of_speech: str | None
    source_kind: str | None
    signals: list[LightGroundingSignal]
    structured_group_ids: list[str]

    def to_json(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "entryId": self.entry_id,
            "lemma": self.lemma,
            "meaningsZh": self.meanings_zh,
            "scopeCodes": self.scope_codes,
            "inScope": self.in_scope,
            "reason": self.reason,
            "score": self.score,
            "signals": [
                signal.to_json()
                for signal in self.signals
                if is_public_signal(signal)
            ],
            "structuredGroupIds": self.structured_group_ids,
        }

        if self.part_of_speech is not None:
            normalized_part_of_speech = normalize_part_of_speech_label(
                self.part_of_speech,
            )
            if normalized_part_of_speech:
                payload["partOfSpeech"] = normalized_part_of_speech

        if self.source_kind is not None:
            payload["sourceKind"] = self.source_kind

        return payload


english_token_pattern = re.compile(r"[a-z]+(?:-[a-z]+)?", re.IGNORECASE)
ecdict_part_of_speech_pattern = re.compile(
    r"^\s*((?:interj|adj|adv|prep|conj|pron|num|art|phr|vt|vi|ad|int|n|v|a)\.)\s*",
    re.IGNORECASE,
)
prefix_hint_pattern = re.compile(
    r"(?<![a-z])([a-z]{2,8})(?![a-z])\s*(?:开头|词首|前缀)",
    re.IGNORECASE,
)
suffix_hint_pattern = re.compile(
    r"(?<![a-z])([a-z]{2,8})(?![a-z])\s*(?:结尾|词尾|后缀)",
    re.IGNORECASE,
)
contains_hint_pattern = re.compile(
    r"(?:有|含有|包含)\s*([a-z]{2,12})\s*(?:的词|这个片段|这个词形)?",
    re.IGNORECASE,
)
standalone_fragment_hint_pattern = re.compile(
    r"\b([a-z]{3,12})\s*(?:这串|这段|这个片段|相关.*(?:词|整理)|怎么整理)",
    re.IGNORECASE,
)
ordered_fragment_pattern = re.compile(r"\b([a-z]{1,8}(?:\+[a-z]{1,8})+)\b", re.IGNORECASE)
shape_hint_pattern = re.compile(
    r"(很像|比较像|相像|类似|形近|长得像|看错|看成|易混词?|容易.*混|怎么区分|怎么分|分不清)",
)

semantic_hint_groups = [
    {
        "pattern": re.compile(r"(要求|请求|别人做事)"),
        "keywords": ["强烈要求", "要求", "请求", "需要", "规定"],
    },
    {
        "pattern": re.compile(r"(评论|评价|评估|看法)"),
        "keywords": ["评论", "评价", "评估", "看法", "批评"],
    },
    {
        "pattern": re.compile(r"(推荐|称赞|表扬)"),
        "keywords": ["推荐", "称赞", "表扬", "赞扬", "建议"],
    },
    {
        "pattern": re.compile(r"(合作|协作|协同|共同|配合)"),
        "keywords": ["合作", "协作", "配合"],
        "primary_only": True,
    },
]

word_family_evidence_suffixes = (
    "ful",
    "less",
    "ness",
    "able",
    "ible",
    "ive",
    "ively",
    "ion",
    "ation",
    "ity",
    "ment",
)
word_family_evidence_prefixes = ("ir", "in", "im", "un", "self-", "re")
word_family_stem_aliases = {
    "sign": ("sign",),
    "produce": ("produc", "product"),
    "consider": ("consider",),
    "respect": ("respect",),
    "reduce": ("reduc", "reduct"),
    "consequence": ("consequen",),
    "contribute": ("contribut",),
    "respond": ("respond", "respons"),
    "response": ("respond", "respons"),
    "responsible": ("responsib",),
}


def extract_english_tokens(query: str) -> list[str]:
    seen: set[str] = set()
    tokens: list[str] = []

    for match in english_token_pattern.finditer(query.lower()):
        token = match.group(0)
        if len(token) < 2 or token in seen:
            continue

        seen.add(token)
        tokens.append(token)

    return tokens


def infer_ecdict_part_of_speech(profile: EcdictBasicProfile | None) -> str | None:
    if not profile:
        return None

    parts: list[str] = []
    seen: set[str] = set()
    for meaning in profile.meanings:
        match = ecdict_part_of_speech_pattern.match(meaning)
        if not match:
            continue

        part = normalize_part_of_speech_label(match.group(1).lower())
        if not part:
            continue
        if part in seen:
            continue

        seen.add(part)
        parts.append(part)

    return " / ".join(parts) if parts else None


def word_family_evidence(seed: str, lemma: str) -> tuple[int, str | None]:
    normalized_seed = seed.strip().lower()
    normalized_lemma = lemma.strip().lower()

    if not normalized_seed or not normalized_lemma:
        return 0, None

    if normalized_lemma == normalized_seed:
        return 100, "exact_seed"

    if any(
        normalized_lemma == f"{normalized_seed}{suffix}"
        for suffix in word_family_evidence_suffixes
    ):
        return 90, "seed_suffix_derivative"

    if any(
        normalized_lemma == f"{prefix}{normalized_seed}"
        for prefix in word_family_evidence_prefixes
    ):
        return 85, "prefix_seed_derivative"

    aliases = word_family_stem_aliases.get(normalized_seed, ())
    if aliases and any(normalized_lemma.startswith(alias) for alias in aliases):
        return 75, "tested_stem_family"

    return 0, None


def clean_ecdict_broad_meanings(profile: EcdictBasicProfile | None) -> list[str]:
    if not profile:
        return []

    meanings: list[str] = []
    for meaning in profile.meanings:
        cleaned = ecdict_part_of_speech_pattern.sub("", meaning, count=1).strip()
        meanings.append(cleaned or meaning)

    return meanings


def common_prefix_length(left: str, right: str) -> int:
    length = 0
    max_length = min(len(left), len(right))

    while length < max_length and left[length] == right[length]:
        length += 1

    return length


def common_suffix_length(left: str, right: str) -> int:
    length = 0
    max_length = min(len(left), len(right))

    while length < max_length and left[-(length + 1)] == right[-(length + 1)]:
        length += 1

    return length


def bounded_edit_distance(source: str, target: str, max_distance: int = 3) -> int:
    if abs(len(source) - len(target)) > max_distance:
        return max_distance + 1

    previous_row = list(range(len(target) + 1))

    for left_index in range(1, len(source) + 1):
        current_row = [left_index]
        row_minimum = current_row[0]

        for right_index in range(1, len(target) + 1):
            substitution_cost = 0 if source[left_index - 1] == target[right_index - 1] else 1
            value = min(
                previous_row[right_index] + 1,
                current_row[right_index - 1] + 1,
                previous_row[right_index - 1] + substitution_cost,
            )
            current_row.append(value)
            row_minimum = min(row_minimum, value)

        if row_minimum > max_distance:
            return max_distance + 1

        previous_row = current_row

    return previous_row[len(target)]


def character_ngrams(value: str, *, size: int = 2) -> set[str]:
    normalized = value.lower()

    if len(normalized) <= size:
        return {normalized}

    return {
        normalized[index : index + size]
        for index in range(len(normalized) - size + 1)
    }


def ngram_overlap(left: str, right: str) -> float:
    left_ngrams = character_ngrams(left)
    right_ngrams = character_ngrams(right)

    if not left_ngrams or not right_ngrams:
        return 0

    return len(left_ngrams & right_ngrams) / len(left_ngrams | right_ngrams)


def active_scope_match(candidate: RetrievalCandidate, active_exam_target: str) -> bool:
    return candidate.in_scope or active_exam_target in candidate.scope_codes


def add_signal(
    signals: list[LightGroundingSignal],
    *,
    signal_type: str,
    weight: int,
    detail: str,
) -> None:
    signals.append(
        LightGroundingSignal(
            type=signal_type,
            weight=weight,
            detail=detail,
        ),
    )


def add_signal_once(
    signals: list[LightGroundingSignal],
    *,
    signal_type: str,
    weight: int,
    detail: str,
) -> None:
    if any(
        signal.type == signal_type and signal.detail == detail
        for signal in signals
    ):
        return

    add_signal(
        signals,
        signal_type=signal_type,
        weight=weight,
        detail=detail,
    )


def first_meaning_segment(meaning: str) -> str:
    return re.split(r"[；;，,、]", meaning, maxsplit=1)[0]


def meaning_matches_keyword(meaning: str, keyword: str, *, primary_only: bool) -> bool:
    if not primary_only:
        return keyword in meaning

    return keyword in first_meaning_segment(meaning)


def matches_intent_constraints(
    candidate: RetrievalCandidate,
    plan: LearningIntentPlan | None,
) -> bool:
    if plan is None or not plan.require_hard_filter:
        return True

    lemma = candidate.lemma.lower()
    for constraint in plan.constraints:
        if not constraint.hard:
            continue

        if constraint.type == "prefix" and not lemma.startswith(constraint.value):
            return False
        if constraint.type == "suffix" and not lemma.endswith(constraint.value):
            return False
        if constraint.type == "contains" and constraint.value not in lemma:
            return False
        if (
            constraint.type == "meaning"
            and matched_constraint_keyword(candidate, constraint) is None
        ):
            return False

    return True


def matched_meaning_constraint_keyword(
    candidate: RetrievalCandidate,
    constraint: IntentConstraint,
) -> str | None:
    keywords = constraint.alternatives or (constraint.value,)

    for keyword in keywords:
        if any(
            meaning_matches_keyword(
                meaning,
                keyword,
                primary_only=True,
            )
            for meaning in candidate.meanings_zh
        ):
            return keyword

    return None


def matched_constraint_keyword(
    candidate: RetrievalCandidate,
    constraint: IntentConstraint,
) -> str | None:
    matched_keyword = matched_meaning_constraint_keyword(candidate, constraint)
    if matched_keyword is not None:
        return matched_keyword

    return matched_semantic_hint_constraint_keyword(candidate, constraint)


def matched_semantic_hint_constraint_keyword(
    candidate: RetrievalCandidate,
    constraint: IntentConstraint,
) -> str | None:
    keywords = constraint.alternatives or (constraint.value,)
    for keyword in keywords:
        if keyword in candidate.semantic_match_hints:
            return keyword

    return None


def add_intent_constraint_signals(
    *,
    signals: list[LightGroundingSignal],
    candidate: RetrievalCandidate,
    plan: LearningIntentPlan | None,
) -> int:
    if plan is None:
        return 0

    lemma = candidate.lemma.lower()
    score_delta = 0

    for constraint in plan.constraints:
        if not constraint.hard:
            continue

        if constraint.type == "prefix" and lemma.startswith(constraint.value):
            add_signal_once(
                signals,
                signal_type="prefix",
                weight=110,
                detail=constraint.value,
            )
            score_delta += 110
        elif constraint.type == "suffix" and lemma.endswith(constraint.value):
            add_signal_once(
                signals,
                signal_type="suffix",
                weight=110,
                detail=constraint.value,
            )
            score_delta += 110
        elif constraint.type == "contains" and constraint.value in lemma:
            add_signal_once(
                signals,
                signal_type="fragment",
                weight=90,
                detail=constraint.value,
            )
            score_delta += 90
        elif constraint.type == "meaning":
            if matched_keyword := matched_meaning_constraint_keyword(
                candidate,
                constraint,
            ):
                add_signal_once(
                    signals,
                    signal_type="meaning_keyword",
                    weight=105,
                    detail=matched_keyword,
                )
                score_delta += 105
            elif matched_keyword := matched_semantic_hint_constraint_keyword(
                candidate,
                constraint,
            ):
                add_signal_once(
                    signals,
                    signal_type="_semantic_match_hint",
                    weight=105,
                    detail=matched_keyword,
                )
                score_delta += 105

    if plan.task == "word_family" and len(plan.seed_terms) == 1:
        seed = plan.seed_terms[0].lower()
        evidence_score, evidence_reason = word_family_evidence(seed, candidate.lemma)

        if evidence_reason is not None:
            add_signal_once(
                signals,
                signal_type="word_family_candidate",
                weight=evidence_score,
                detail=f"{seed}:{evidence_reason}",
            )
            score_delta += evidence_score

    return score_delta


def group_ids_by_entry_id(groups: list[ConfusionGroup]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}

    for group in groups:
        for member in group.members:
            result.setdefault(member.candidate.entry_id, []).append(group.id)

    return {
        entry_id: sorted(set(group_ids))
        for entry_id, group_ids in result.items()
    }


def score_candidate(
    *,
    candidate: RetrievalCandidate,
    query: str,
    tokens: list[str],
    token_order: dict[str, int],
    active_exam_target: str,
    structured_group_ids: list[str],
    intent_plan: LearningIntentPlan | None = None,
) -> LightGroundingCandidate | None:
    if not active_scope_match(candidate, active_exam_target):
        return None

    lemma = candidate.lemma.lower()
    score = 24
    signals: list[LightGroundingSignal] = []
    shape_query = shape_hint_pattern.search(query) is not None

    for token in tokens:
        if lemma == token:
            add_signal(signals, signal_type="exact", weight=500, detail=token)
            score += 500 - token_order[token]

        prefix_length = common_prefix_length(lemma, token)
        minimum_form_overlap = 2 if shape_query and min(len(token), len(lemma)) <= 3 else 3
        if prefix_length >= minimum_form_overlap and token != lemma:
            weight = 28 + prefix_length * 2
            add_signal(signals, signal_type="common_prefix", weight=weight, detail=token)
            score += weight

        suffix_length = common_suffix_length(lemma, token)
        if suffix_length >= minimum_form_overlap and token != lemma:
            weight = 22 + suffix_length * 2
            add_signal(signals, signal_type="common_suffix", weight=weight, detail=token)
            score += weight

        if len(token) >= 4 and len(lemma) >= 4:
            distance_limit = 3
        elif shape_query and min(len(token), len(lemma)) >= 2:
            distance_limit = 1
        else:
            distance_limit = 0

        if distance_limit:
            distance = bounded_edit_distance(token, lemma, distance_limit)
            if 0 < distance <= distance_limit:
                weight = max(1, 62 - distance * 14)
                if token[0] == lemma[0]:
                    weight += 40
                add_signal(signals, signal_type="edit_distance", weight=weight, detail=f"{token}:{distance}")
                score += weight

            overlap = ngram_overlap(token, lemma)
            if overlap >= 0.45 and token != lemma:
                weight = round(overlap * 45)
                add_signal(signals, signal_type="ngram_overlap", weight=weight, detail=token)
                score += weight

    for prefix in prefix_hint_pattern.findall(query):
        if lemma.startswith(prefix.lower()):
            add_signal(signals, signal_type="prefix", weight=110, detail=prefix.lower())
            score += 110

    for suffix in suffix_hint_pattern.findall(query):
        if lemma.endswith(suffix.lower()):
            add_signal(signals, signal_type="suffix", weight=110, detail=suffix.lower())
            score += 110

    fragment_hints = [
        *contains_hint_pattern.findall(query),
        *standalone_fragment_hint_pattern.findall(query),
    ]
    seen_fragments: set[str] = set()
    for fragment in fragment_hints:
        fragment = fragment.lower()
        if fragment in seen_fragments:
            continue

        seen_fragments.add(fragment)
        if fragment.lower() in lemma:
            add_signal(signals, signal_type="fragment", weight=90, detail=fragment)
            score += 90

    for combo in ordered_fragment_pattern.findall(query):
        parts = combo.lower().split("+")
        search_from = 0
        matched = True
        for part in parts:
            part_index = lemma.find(part, search_from)
            if part_index == -1:
                matched = False
                break
            search_from = part_index + len(part)

        if matched:
            add_signal(signals, signal_type="fragment", weight=125, detail=combo.lower())
            score += 125

    for group in semantic_hint_groups:
        if not group["pattern"].search(query):
            continue

        primary_only = bool(group.get("primary_only"))
        for keyword in group["keywords"]:
            if keyword == "看法" and keyword not in query:
                continue

            if any(
                meaning_matches_keyword(
                    meaning,
                    keyword,
                    primary_only=primary_only,
                )
                for meaning in candidate.meanings_zh
            ):
                weight = 140 if keyword in {"强烈要求", "要求", "请求"} else 105
                add_signal(signals, signal_type="meaning_keyword", weight=weight, detail=keyword)
                score += weight
                break

    if (
        intent_plan is not None
        and intent_plan.task == "meaning_core"
        and candidate.semantic_match_hints
    ):
        meaning_hint = candidate.semantic_match_hints[0]
        weight = 125 + min(max(candidate.score, 0), 50)
        add_signal_once(
            signals,
            signal_type="meaning_keyword",
            weight=weight,
            detail=meaning_hint,
        )
        score += weight

    score += add_intent_constraint_signals(
        signals=signals,
        candidate=candidate,
        plan=intent_plan,
    )

    if not signals:
        return None

    if (
        intent_plan is not None
        and intent_plan.task == "word_family"
        and not is_word_family_main_candidate(signals, intent_plan.seed_terms)
    ):
        return None

    if structured_group_ids:
        add_signal(
            signals,
            signal_type="structured_group",
            weight=80,
            detail=",".join(structured_group_ids),
        )
        score += 80

    if candidate.source_kind == "structured":
        score += 10

    public_signals = [
        signal
        for signal in signals
        if is_public_signal(signal)
    ]
    reason = "；".join(
        f"{signal.type}:{signal.detail}"
        for signal in public_signals[:5]
    )

    return LightGroundingCandidate(
        entry_id=candidate.entry_id,
        lemma=candidate.lemma,
        meanings_zh=candidate.meanings_zh,
        scope_codes=candidate.scope_codes,
        in_scope=True,
        reason=reason,
        score=score,
        part_of_speech=candidate.part_of_speech,
        source_kind=candidate.source_kind,
        signals=signals,
        structured_group_ids=structured_group_ids,
    )


def best_edit_distance(candidate: LightGroundingCandidate) -> int:
    distances: list[int] = []

    for signal in candidate.signals:
        if signal.type != "edit_distance":
            continue

        parts = signal.detail.rsplit(":", 1)
        if len(parts) != 2 or not parts[1].isdigit():
            continue

        distances.append(int(parts[1]))

    return min(distances or [99])


def has_signal(candidate: LightGroundingCandidate, signal_type: str) -> bool:
    return any(signal.type == signal_type for signal in candidate.signals)


def is_word_family_main_candidate(
    signals: list[LightGroundingSignal],
    seed_terms: list[str],
) -> bool:
    if len(seed_terms) != 1:
        return True

    seed = seed_terms[0].lower()
    return any(
        (
            signal.type == "exact"
            and signal.detail.lower() == seed
        )
        or signal.type == "word_family_candidate"
        for signal in signals
    )


def min_token_length_gap(candidate: LightGroundingCandidate, tokens: list[str]) -> int:
    return min(
        [abs(len(candidate.lemma) - len(token)) for token in tokens]
        or [0],
    )


def word_family_sort_group(seed: str, lemma: str) -> int:
    normalized_seed = seed.lower()
    normalized_lemma = lemma.lower()

    if normalized_lemma == normalized_seed:
        return 0

    suffix_order = (
        "ful",
        "able",
        "ible",
        "ive",
        "ively",
        "less",
        "ion",
        "ation",
        "ity",
        "ment",
        "ness",
    )
    for index, suffix in enumerate(suffix_order):
        if normalized_lemma == f"{normalized_seed}{suffix}":
            return index + 1

    _score, reason = word_family_evidence(normalized_seed, normalized_lemma)
    if reason == "tested_stem_family":
        return 20
    if reason == "prefix_seed_derivative":
        return 30

    return 99


def sort_key(
    candidate: LightGroundingCandidate,
    token_order: dict[str, int],
    *,
    tokens: list[str],
    shape_query: bool,
    intent_plan: LearningIntentPlan | None = None,
):
    exact_details = [
        signal.detail
        for signal in candidate.signals
        if signal.type == "exact"
    ]
    exact_index = min(
        [token_order[detail] for detail in exact_details if detail in token_order]
        or [999],
    )

    if (
        intent_plan is not None
        and intent_plan.task == "word_family"
        and len(intent_plan.seed_terms) == 1
    ):
        return (
            exact_index,
            word_family_sort_group(intent_plan.seed_terms[0], candidate.lemma),
            -candidate.score,
            len(candidate.lemma),
            candidate.lemma,
        )

    if shape_query and tokens:
        return (
            exact_index,
            best_edit_distance(candidate),
            min_token_length_gap(candidate, tokens),
            0 if has_signal(candidate, "common_suffix") else 1,
            0 if has_signal(candidate, "common_prefix") else 1,
            0 if has_signal(candidate, "ngram_overlap") else 1,
            -candidate.score,
            candidate.lemma,
        )

    return (
        exact_index,
        -candidate.score,
        candidate.lemma,
    )


def build_light_grounding_candidates(
    *,
    query: str,
    active_exam_target: str,
    vocabulary: list[RetrievalCandidate],
    groups: list[ConfusionGroup] | None = None,
    limit: int = 18,
    intent_plan: LearningIntentPlan | None = None,
) -> list[LightGroundingCandidate]:
    tokens = extract_english_tokens(query)
    token_order = {token: index for index, token in enumerate(tokens)}
    shape_query = shape_hint_pattern.search(query) is not None
    group_ids = group_ids_by_entry_id(groups or [])
    scored: list[LightGroundingCandidate] = []

    for vocabulary_candidate in vocabulary:
        if not matches_intent_constraints(vocabulary_candidate, intent_plan):
            continue

        candidate = score_candidate(
            candidate=vocabulary_candidate,
            query=query,
            tokens=tokens,
            token_order=token_order,
            active_exam_target=active_exam_target,
            structured_group_ids=group_ids.get(vocabulary_candidate.entry_id, []),
            intent_plan=intent_plan,
        )

        if candidate is not None:
            scored.append(candidate)

    return sorted(
        scored,
        key=lambda candidate: sort_key(
            candidate,
            token_order,
            tokens=tokens,
            shape_query=shape_query,
            intent_plan=intent_plan,
        ),
    )[:limit]


def source_lemma_vocabulary(
    *,
    active_exam_target: str,
    source_lemma_base_dir: Path | str | None,
    ecdict_lookup: Callable[[str], EcdictBasicProfile | None] | None = None,
) -> list[RetrievalCandidate]:
    if not source_lemma_base_dir or active_exam_target == "postgrad":
        return []

    memberships_by_lemma: dict[str, set[str]] = {}
    for membership in load_source_lemma_memberships(base_dir=source_lemma_base_dir):
        memberships_by_lemma.setdefault(membership.lemma, set()).add(membership.scope_code)

    result: list[RetrievalCandidate] = []

    for lemma, scope_codes in memberships_by_lemma.items():
        if active_exam_target not in scope_codes:
            continue

        profile = ecdict_lookup(lemma) if ecdict_lookup else None
        meanings = clean_ecdict_broad_meanings(profile)
        reason = "source lemma broad candidate"
        if profile:
            reason = f"{reason}; external dictionary basic meanings"

        result.append(
            RetrievalCandidate(
                entry_id=f"source-lemma:{lemma}",
                lemma=lemma,
                meanings_zh=meanings,
                matched_alias=None,
                scope_codes=sorted(scope_codes),
                in_scope=active_exam_target in scope_codes,
                reason=reason,
                score=18,
                part_of_speech=infer_ecdict_part_of_speech(profile),
                source_kind="source_lemma",
            ),
        )

    return result


def merge_dynamic_vocabulary(
    structured_candidates: list[RetrievalCandidate],
    source_candidates: list[RetrievalCandidate],
) -> list[RetrievalCandidate]:
    result_by_lemma: dict[str, RetrievalCandidate] = {}

    for candidate in structured_candidates:
        result_by_lemma[candidate.lemma.lower()] = candidate

    for candidate in source_candidates:
        result_by_lemma.setdefault(candidate.lemma.lower(), candidate)

    return list(result_by_lemma.values())
