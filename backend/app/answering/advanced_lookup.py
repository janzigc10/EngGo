import re
from dataclasses import dataclass
from pathlib import Path

from backend.app.answering.broad_vocab import (
    build_broad_vocab_answer,
    build_broad_vocab_grounding,
)
from backend.app.answering.direct_compare import (
    build_boundary_candidates,
    build_comparison_view,
    build_direct_compare_answer,
    pick_shared_group,
)
from backend.app.answering.no_match_policy import build_root_no_match_answer
from backend.app.answering.ordinary_lookup import (
    UnsupportedQueryMode,
    build_grounding,
    build_no_match_answer,
)
from backend.app.content.ecdict import (
    EcdictBasicProfile,
    preferred_ecdict_tags_by_exam_target,
    scope_codes_for_profile,
)
from backend.app.retrieval.normalize_query import NormalizedQuery, normalize_query
from backend.app.retrieval.dynamic_light_grounding import (
    build_light_grounding_candidates,
    clean_ecdict_broad_meanings,
    infer_ecdict_part_of_speech,
    merge_dynamic_vocabulary,
    source_lemma_vocabulary,
)
from backend.app.retrieval.types import ConfusionGroup, RetrievalCandidate
from backend.app.schemas.chat import ChatSuccessResponse


@dataclass(frozen=True)
class AdvancedLookupResult:
    status_code: int
    payload: ChatSuccessResponse


root_families = {
    "root-stitute": {
        "fragment": "stitute",
        "lemmas": ["institute", "institution", "constitute", "substitute"],
        "coreImage": "放置 / 建立",
        "note": "stitute 更适合作为构词部件理解，不要机械套前缀。",
        "caution": "低频分支先不硬背。",
    },
    "root-tempt": {
        "fragment": "tempt",
        "lemmas": ["attempt", "tempt", "temptation", "contempt"],
        "coreImage": "试探 / 诱动",
        "note": "tempt 适合作为一族构词碎片理解。",
        "caution": "不要硬造 re- 等不存在或低价值分支。",
    },
}
def build_simple_answer(candidates: list[RetrievalCandidate]) -> str:
    return "\n".join(
        [
            " / ".join(candidate.lemma for candidate in candidates),
            "",
            *[
                f"- {candidate.lemma}: {'；'.join(candidate.meanings_zh[:2])}"
                for candidate in candidates
            ],
        ],
    )


def external_dictionary_candidate(
    profile: EcdictBasicProfile,
    *,
    active_exam_target: str | None = None,
) -> RetrievalCandidate | None:
    meanings = clean_ecdict_broad_meanings(profile)
    if not meanings:
        return None

    scope_codes = scope_codes_for_profile(
        profile,
        active_exam_target=active_exam_target,
    )

    return RetrievalCandidate(
        entry_id=f"external-dictionary-basic:{profile.canonical}",
        lemma=profile.canonical,
        meanings_zh=meanings,
        matched_alias=None,
        scope_codes=scope_codes,
        in_scope=True,
        reason=(
            "external dictionary tagged fragment candidate"
            if scope_codes
            else "external dictionary basic fragment candidate"
        ),
        score=14,
        part_of_speech=infer_ecdict_part_of_speech(profile),
        source_kind=profile.source_kind,
    )


def provider_or_fallback(
    *,
    provider,
    answer: str,
    answer_kind: str,
    grounding: dict[str, object],
    query: str,
    history: list[dict[str, str]],
    request_id: str,
    system_prompt: str,
    provider_grounding: dict[str, object] | None = None,
) -> ChatSuccessResponse:
    if not provider:
        return ChatSuccessResponse(
            answer=answer,
            answerKind=answer_kind,
            grounding=grounding,
            requestId=request_id,
            providerRequestId=None,
        )

    provider_result = provider.generate_answer(
        query=query,
        history=history,
        request_id=request_id,
        system_prompt=system_prompt,
        grounding=provider_grounding or grounding,
    )

    return ChatSuccessResponse(
        answer=provider_result.answer,
        answerKind=answer_kind,
        grounding=grounding,
        requestId=request_id,
        providerRequestId=provider_result.provider_request_id,
    )


def pick_expression_group(
    candidates: list[RetrievalCandidate],
    groups: list[ConfusionGroup],
) -> ConfusionGroup | None:
    candidate_ids = {candidate.entry_id for candidate in candidates}
    expression_groups = [
        group
        for group in groups
        if "expression_recall" in group.purposes
        and any(member.candidate.entry_id in candidate_ids for member in group.members)
    ]

    return sorted(expression_groups, key=lambda group: group.id)[0] if expression_groups else None


def select_meaning_main_candidate(
    candidates: list[RetrievalCandidate],
    group: ConfusionGroup | None,
) -> RetrievalCandidate | None:
    if not candidates:
        return None

    if not group:
        return candidates[0]

    candidate_by_id = {candidate.entry_id: candidate for candidate in candidates}

    return (
        candidate_by_id.get(group.teach_first_entry_id)
        or next(
            (
                candidate_by_id.get(member.candidate.entry_id)
                for member in group.members
                if member.candidate.entry_id in candidate_by_id
            ),
            None,
        )
        or candidates[0]
    )


def character_bigrams(value: str) -> list[str]:
    normalized = value.lower()

    if len(normalized) < 2:
        return [normalized]

    return [
        normalized[index : index + 2]
        for index in range(len(normalized) - 1)
    ]


def dice_coefficient(left: str, right: str) -> float:
    if left == right:
        return 1

    left_bigrams = character_bigrams(left)
    right_bigrams = character_bigrams(right)
    right_counts: dict[str, int] = {}

    for bigram in right_bigrams:
        right_counts[bigram] = right_counts.get(bigram, 0) + 1

    matches = 0
    for bigram in left_bigrams:
        count = right_counts.get(bigram, 0)
        if count == 0:
            continue

        right_counts[bigram] = count - 1
        matches += 1

    return (2 * matches) / (len(left_bigrams) + len(right_bigrams))


def bounded_edit_distance(source: str, target: str, max_distance: int) -> int:
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


def shape_neighbor_edit_distance_limit(seed: str) -> int:
    if len(seed) <= 3:
        return 1
    if len(seed) <= 5:
        return 2
    return 3


def score_lookalike_group(
    *,
    seed_entry_id: str,
    seed_lemma: str,
    group: ConfusionGroup,
) -> tuple[float, int, int, str]:
    other_members = [
        member
        for member in group.members
        if member.candidate.entry_id != seed_entry_id
    ]
    best_lemma_similarity = max(
        [
            dice_coefficient(seed_lemma, member.candidate.lemma)
            for member in other_members
        ]
        or [0],
    )
    in_scope_count = sum(1 for member in group.members if member.candidate.in_scope)

    return (
        -best_lemma_similarity,
        -in_scope_count,
        len(group.members),
        group.id,
    )


def pick_best_lookalike_group(
    *,
    seed_entry_id: str,
    seed_lemma: str,
    groups: list[ConfusionGroup],
) -> ConfusionGroup | None:
    candidate_groups = [
        group
        for group in groups
        if any(member.candidate.entry_id == seed_entry_id for member in group.members)
    ]

    return (
        sorted(
            candidate_groups,
            key=lambda group: score_lookalike_group(
                seed_entry_id=seed_entry_id,
                seed_lemma=seed_lemma,
                group=group,
            ),
        )[0]
        if candidate_groups
        else None
    )


def root_family_for_query(normalized_text: str):
    text = normalized_text.lower()

    if "stitute" in text or any(lemma in text for lemma in root_families["root-stitute"]["lemmas"]):
        return "root-stitute", root_families["root-stitute"]

    if "tempt" in text or any(lemma in text for lemma in root_families["root-tempt"]["lemmas"]):
        return "root-tempt", root_families["root-tempt"]

    return None, None


def normalize_fragment_id(value: str) -> str:
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", value, flags=re.IGNORECASE)).lower()


def describe_constraint_for_id(constraint: dict[str, object]) -> str:
    constraint_type = constraint["type"]

    if constraint_type == "start_end":
        return f"pattern-{constraint['prefix']}-{constraint['suffix']}"

    if constraint_type == "ordered_contains":
        return f"ordered-{'-'.join(constraint['parts'])}"

    return f"{constraint_type}-{constraint['value']}"


def format_constraint_fragment(constraint: dict[str, object]) -> str:
    constraint_type = constraint["type"]

    if constraint_type == "prefix":
        return f"{constraint['value']}-"

    if constraint_type == "suffix":
        return f"-{constraint['value']}"

    if constraint_type == "start_end":
        return f"{constraint['prefix']}...{constraint['suffix']}"

    if constraint_type == "ordered_contains":
        return "+".join(constraint["parts"])

    return str(constraint["value"])


def build_fragment_query(constraints: list[dict[str, object]]):
    return {
        "id": normalize_fragment_id(
            f"fragment-{'-'.join(describe_constraint_for_id(item) for item in constraints)}",
        ),
        "fragment": " + ".join(format_constraint_fragment(item) for item in constraints),
        "constraints": constraints,
    }


def root_fragment_query(normalized_text: str):
    text = normalized_text.lower()

    if re.search(r"\b[a-z]{1,8}\+[a-z]{1,8}\b", text) and "词根" in text:
        return None

    start_end = re.search(r"\b([a-z]{1,8})\.\.\.([a-z]{1,8})\b", text)
    if start_end:
        prefix = start_end.group(1)
        suffix = start_end.group(2)
        return build_fragment_query([
            {
                "type": "start_end",
                "prefix": prefix,
                "suffix": suffix,
            },
        ])

    combo = re.search(r"\b([a-z]{1,8}(?:\+[a-z]{1,8})+)\b", text)
    if combo and re.search(r"(词形|这种词|这类词|包含|都有)", text):
        return build_fragment_query([
            {
                "type": "ordered_contains",
                "parts": combo.group(1).split("+"),
            },
        ])

    constraints: list[dict[str, object]] = []

    prefix = re.search(r"\b([a-z]{2,8})\s*(?:开头|词首|前缀)", text)
    if prefix:
        value = prefix.group(1)
        constraints.append({"type": "prefix", "value": value})

    suffix = re.search(r"\b([a-z]{2,8})\s*(?:结尾|词尾|后缀)", text)
    if suffix:
        value = suffix.group(1)
        constraints.append({"type": "suffix", "value": value})

    explicit_contains = re.search(
        r"(?:有|含有|包含)\s*([a-z]{2,12})\s*(?:的词|这个片段|这个词形)?",
        text,
    )
    if explicit_contains:
        constraints.append({"type": "contains", "value": explicit_contains.group(1)})

    if constraints:
        existing_values = {
            constraint["value"]
            for constraint in constraints
            if "value" in constraint
        }
        related_values = [
            match.group(1)
            for match in re.finditer(r"\b([a-z]{2,12})\s*相关(?:的词)?", text)
            if match.group(1) not in existing_values
        ]

        for value in related_values:
            constraints.append({"type": "contains", "value": value})

        return build_fragment_query(constraints)

    return None


def matches_constraint(lemma: str, constraint: dict[str, object]) -> bool:
    constraint_type = constraint["type"]

    if constraint_type == "prefix":
        return lemma.startswith(str(constraint["value"]))

    if constraint_type == "suffix":
        return lemma.endswith(str(constraint["value"]))

    if constraint_type == "contains":
        return str(constraint["value"]) in lemma

    if constraint_type == "start_end":
        prefix = str(constraint["prefix"])
        suffix = str(constraint["suffix"])
        return (
            lemma.startswith(prefix)
            and lemma.endswith(suffix)
            and len(lemma) > len(prefix) + len(suffix)
        )

    if constraint_type == "ordered_contains":
        search_from = 0

        for part in constraint["parts"]:
            part_index = lemma.find(part, search_from)
            if part_index == -1:
                return False
            search_from = part_index + len(part)

        return True

    return False


def matches_fragment(candidate: RetrievalCandidate, fragment) -> bool:
    lemma = candidate.lemma.lower()

    return all(
        matches_constraint(lemma, constraint)
        for constraint in fragment["constraints"]
    )


def build_root_family_view(
    *,
    root_id: str,
    fragment: str,
    candidates: list[RetrievalCandidate],
    core_image: str = "按词形碎片召回",
    note: str = "这是从当前考试范围内做的保守召回。",
    caution: str = "候选过少时不要硬凑规律。",
    prefix: str | None = None,
) -> dict[str, object]:
    return {
        "id": root_id,
        "fragment": fragment,
        "coreImage": core_image,
        "note": note,
        "caution": caution,
        "members": [
            {
                "lemma": candidate.lemma,
                "partOfSpeech": candidate.part_of_speech or "-",
                "prefix": f"{prefix}-" if prefix else None,
                "prefixDirection": (
                    f"词首片段 {prefix}-"
                    if prefix
                    else f"词形片段 {fragment}"
                ),
                "actionStory": f"命中 {fragment} 这个词形线索",
                "modernMeaningZh": "；".join(candidate.meanings_zh[:2]),
                "priority": "recognize",
                "entryId": candidate.entry_id,
                "inScope": candidate.in_scope,
            }
            for candidate in candidates
        ],
    }


class AdvancedLookupService:
    def __init__(
        self,
        *,
        repository,
        provider=None,
        source_lemma_base_dir: Path | str | None = None,
        ecdict_lookup=None,
    ):
        self.repository = repository
        self.provider = provider
        self.source_lemma_base_dir = Path(source_lemma_base_dir) if source_lemma_base_dir else None
        self.ecdict_lookup = ecdict_lookup

    def answer(
        self,
        *,
        active_exam_target: str,
        query: str,
        request_id: str,
        history: list[dict[str, str]] | None = None,
    ) -> AdvancedLookupResult:
        normalized_query = normalize_query(query)

        broad_result = self.answer_broad_vocab_if_possible(
            active_exam_target=active_exam_target,
            query=query,
            request_id=request_id,
            history=history or [],
            normalized_query=normalized_query,
        )
        if broad_result:
            return broad_result

        if normalized_query.query_mode == "meaning_lookup":
            return self.answer_meaning(
                active_exam_target=active_exam_target,
                query=query,
                request_id=request_id,
                history=history or [],
                normalized_query=normalized_query,
            )

        if normalized_query.query_mode == "shape_neighbor_search":
            return self.answer_shape_neighbor(
                active_exam_target=active_exam_target,
                query=query,
                request_id=request_id,
                history=history or [],
                normalized_query=normalized_query,
            )

        if normalized_query.query_mode == "root_family_summary":
            return self.answer_root_family(
                active_exam_target=active_exam_target,
                query=query,
                request_id=request_id,
                history=history or [],
                normalized_query=normalized_query,
            )

        raise UnsupportedQueryMode(normalized_query.query_mode)

    def dynamic_vocabulary(self, active_exam_target: str) -> list[RetrievalCandidate]:
        structured = (
            self.repository.find_in_scope_entries(active_exam_target)
            if hasattr(self.repository, "find_in_scope_entries")
            else []
        )
        source = source_lemma_vocabulary(
            active_exam_target=active_exam_target,
            source_lemma_base_dir=self.source_lemma_base_dir,
            ecdict_lookup=self.ecdict_lookup,
        )

        return merge_dynamic_vocabulary(structured, source)

    def ecdict_fragment_vocabulary(
        self,
        *,
        active_exam_target: str,
        fragment,
        limit: int = 36,
    ) -> list[RetrievalCandidate]:
        if not self.ecdict_lookup or not hasattr(self.ecdict_lookup, "search"):
            return []

        def matches_profile(profile: EcdictBasicProfile) -> bool:
            lemma = profile.canonical.lower()
            return (
                profile.entry_kind == "word"
                and re.fullmatch(r"[a-z][a-z-]*", lemma) is not None
                and all(
                    matches_constraint(lemma, constraint)
                    for constraint in fragment["constraints"]
                )
            )

        search = self.ecdict_lookup.search
        preferred_tags = preferred_ecdict_tags_by_exam_target.get(active_exam_target, ())
        active_tagged_profiles = search(
            lambda profile: bool(
                scope_codes_for_profile(
                    profile,
                    active_exam_target=active_exam_target,
                ),
            )
            and matches_profile(profile),
            limit=limit,
            preferred_tags=preferred_tags,
        )
        profiles = active_tagged_profiles
        if len(profiles) < 2:
            profiles = search(
                lambda profile: bool(profile.tag.strip()) and matches_profile(profile),
                limit=limit,
                preferred_tags=preferred_tags,
            )
        if len(profiles) < 2:
            profiles = search(
                matches_profile,
                limit=limit,
                preferred_tags=preferred_tags,
            )

        candidates: list[RetrievalCandidate] = []
        for profile in profiles:
            candidate = external_dictionary_candidate(
                profile,
                active_exam_target=active_exam_target,
            )
            if candidate:
                candidates.append(candidate)

        return candidates

    def ecdict_shape_neighbor_vocabulary(
        self,
        *,
        active_exam_target: str,
        seed: str,
        limit: int = 36,
    ) -> list[RetrievalCandidate]:
        if not self.ecdict_lookup or not hasattr(self.ecdict_lookup, "search"):
            return []

        normalized_seed = seed.strip().lower()
        if not normalized_seed:
            return []

        edit_distance_limit = shape_neighbor_edit_distance_limit(normalized_seed)

        def has_shape_signal(profile: EcdictBasicProfile) -> bool:
            lemma = profile.canonical.lower()
            distance = bounded_edit_distance(normalized_seed, lemma, edit_distance_limit)
            return (
                lemma == normalized_seed
                or dice_coefficient(normalized_seed, lemma) >= 0.45
                or distance <= edit_distance_limit
            )

        def matches_profile(profile: EcdictBasicProfile) -> bool:
            lemma = profile.canonical.lower()
            return (
                profile.entry_kind == "word"
                and re.fullmatch(r"[a-z][a-z-]*", lemma) is not None
                and bool(
                    scope_codes_for_profile(
                        profile,
                        active_exam_target=active_exam_target,
                    ),
                )
                and has_shape_signal(profile)
            )

        def shape_profile_sort_key(profile: EcdictBasicProfile):
            lemma = profile.canonical.lower()
            distance = bounded_edit_distance(normalized_seed, lemma, edit_distance_limit)
            return (
                0 if lemma == normalized_seed else 1,
                distance,
                abs(len(normalized_seed) - len(lemma)),
                0 if lemma[:1] == normalized_seed[:1] else 1,
                0 if lemma[-1:] == normalized_seed[-1:] else 1,
                -dice_coefficient(normalized_seed, lemma),
                lemma,
            )

        profiles = self.ecdict_lookup.search(
            matches_profile,
            limit=max(limit * 4, 144),
            preferred_tags=preferred_ecdict_tags_by_exam_target.get(active_exam_target, ()),
        )
        profiles = sorted(profiles, key=shape_profile_sort_key)[:limit]
        candidates: list[RetrievalCandidate] = []
        for profile in profiles:
            candidate = external_dictionary_candidate(
                profile,
                active_exam_target=active_exam_target,
            )
            if candidate:
                candidates.append(candidate)

        return candidates

    def answer_broad_vocab_if_possible(
        self,
        *,
        active_exam_target: str,
        query: str,
        request_id: str,
        history: list[dict[str, str]],
        normalized_query: NormalizedQuery,
    ) -> AdvancedLookupResult | None:
        if normalized_query.query_mode not in {
            "meaning_lookup",
            "shape_neighbor_search",
            "root_family_summary",
        }:
            return None

        if (
            normalized_query.query_mode == "root_family_summary"
            and not self.provider
            and not self.source_lemma_base_dir
        ):
            return None

        if normalized_query.query_mode == "root_family_summary":
            _root_id, known_root_family = root_family_for_query(normalized_query.normalized_text)
            if known_root_family:
                return None

        vocabulary = self.dynamic_vocabulary(active_exam_target)
        if (
            normalized_query.query_mode == "shape_neighbor_search"
            and len(normalized_query.english_terms) == 1
        ):
            vocabulary = merge_dynamic_vocabulary(
                vocabulary,
                self.ecdict_shape_neighbor_vocabulary(
                    active_exam_target=active_exam_target,
                    seed=normalized_query.english_terms[0],
                ),
            )
        if normalized_query.query_mode == "root_family_summary":
            fragment = root_fragment_query(normalized_query.normalized_text)
            if fragment:
                vocabulary = merge_dynamic_vocabulary(
                    vocabulary,
                    self.ecdict_fragment_vocabulary(
                        active_exam_target=active_exam_target,
                        fragment=fragment,
                    ),
                )
        if not vocabulary:
            return None

        candidates = build_light_grounding_candidates(
            query=query,
            active_exam_target=active_exam_target,
            vocabulary=vocabulary,
            groups=[],
        )

        if len(candidates) < 2:
            return None

        grounding = build_broad_vocab_grounding(
            active_exam_target=active_exam_target,
            query=query,
            normalized_query=normalized_query,
            candidates=candidates,
        )

        return AdvancedLookupResult(
            status_code=200,
            payload=ChatSuccessResponse(
                answer=build_broad_vocab_answer(candidates, normalized_query),
                answerKind="grounded",
                grounding=grounding,
                requestId=request_id,
                providerRequestId=None,
            ),
        )

    def answer_meaning(
        self,
        *,
        active_exam_target: str,
        query: str,
        request_id: str,
        history: list[dict[str, str]],
        normalized_query: NormalizedQuery,
    ) -> AdvancedLookupResult:
        candidates = self.repository.find_meaning_candidates(
            active_exam_target,
            normalized_query.meaning_hint or normalized_query.normalized_text,
        )

        if not candidates:
            return self.grounded_no_match(
                active_exam_target=active_exam_target,
                query=query,
                request_id=request_id,
                normalized_query=normalized_query,
                no_match_reason="out_of_kb",
            )

        groups = self.repository.find_confusion_groups_for_entry_ids(
            active_exam_target,
            [candidate.entry_id for candidate in candidates],
        )
        group = pick_expression_group(candidates, groups)
        selected = select_meaning_main_candidate(candidates, group)

        if not selected:
            return self.grounded_no_match(
                active_exam_target=active_exam_target,
                query=query,
                request_id=request_id,
                normalized_query=normalized_query,
                no_match_reason="out_of_kb",
            )

        main_answer = [selected]
        confusion_boundary = (
            build_boundary_candidates(group, {selected.entry_id})
            if group
            else []
        )
        comparison_view = build_comparison_view(group) if group else None
        grounding = build_grounding(
            active_exam_target=active_exam_target,
            query=query,
            normalized_query=normalized_query,
            resolution="resolved",
            no_match_reason=None,
            match_type=None,
            main_answer=main_answer,
            confusion_boundary=confusion_boundary,
            comparison_view=comparison_view,
            candidates=candidates,
        )
        answer = build_direct_compare_answer(main_answer, confusion_boundary, comparison_view)

        return AdvancedLookupResult(
            status_code=200,
            payload=provider_or_fallback(
                provider=self.provider,
                answer=answer,
                answer_kind="grounded",
                grounding=grounding,
                query=query,
                history=history,
                request_id=request_id,
                system_prompt="你是 EngGo 的中文释义和表达召回助手。请严格根据 grounding 回答。",
            ),
        )

    def answer_shape_neighbor(
        self,
        *,
        active_exam_target: str,
        query: str,
        request_id: str,
        history: list[dict[str, str]],
        normalized_query: NormalizedQuery,
    ) -> AdvancedLookupResult:
        if len(normalized_query.english_terms) != 1:
            return self.grounded_no_match(
                active_exam_target=active_exam_target,
                query=query,
                request_id=request_id,
                normalized_query=normalized_query,
                no_match_reason="low_confidence",
            )

        seed = self.repository.find_exact_entry(
            active_exam_target,
            normalized_query.english_terms[0],
        )

        if not seed:
            return self.grounded_no_match(
                active_exam_target=active_exam_target,
                query=query,
                request_id=request_id,
                normalized_query=normalized_query,
                no_match_reason="out_of_kb",
            )

        groups = self.repository.find_confusion_groups_for_entry_ids(
            active_exam_target,
            [seed.entry_id],
        )
        group = pick_best_lookalike_group(
            seed_entry_id=seed.entry_id,
            seed_lemma=seed.lemma,
            groups=groups,
        )

        if group:
            main_answer = [member.candidate for member in group.members]
            comparison_view = build_comparison_view(group)
        else:
            main_answer = self.repository.find_in_scope_lookalike_candidates(
                active_exam_target,
                normalized_query.english_terms[0],
            )[:6]
            comparison_view = None

        if len(main_answer) < 2:
            return self.grounded_no_match(
                active_exam_target=active_exam_target,
                query=query,
                request_id=request_id,
                normalized_query=normalized_query,
                no_match_reason="low_confidence",
            )

        grounding = build_grounding(
            active_exam_target=active_exam_target,
            query=query,
            normalized_query=normalized_query,
            resolution="resolved",
            no_match_reason=None,
            match_type=None,
            main_answer=main_answer,
            confusion_boundary=[],
            comparison_view=comparison_view,
            candidates=main_answer,
        )

        return AdvancedLookupResult(
            status_code=200,
            payload=provider_or_fallback(
                provider=self.provider,
                answer=build_simple_answer(main_answer),
                answer_kind="grounded",
                grounding=grounding,
                query=query,
                history=history,
                request_id=request_id,
                system_prompt="你是 EngGo 的形近词辨析助手。请严格根据 grounding 回答。",
            ),
        )

    def answer_root_family(
        self,
        *,
        active_exam_target: str,
        query: str,
        request_id: str,
        history: list[dict[str, str]],
        normalized_query: NormalizedQuery,
    ) -> AdvancedLookupResult:
        root_id, root_family = root_family_for_query(normalized_query.normalized_text)
        comparison_view = None

        if root_family:
            candidates = [
                candidate
                for candidate in self.repository.find_entries_by_lemmas(
                    active_exam_target,
                    root_family["lemmas"],
                )
                if candidate.in_scope
            ]
            if not candidates:
                return self.grounded_no_match(
                    active_exam_target=active_exam_target,
                    query=query,
                    request_id=request_id,
                    normalized_query=normalized_query,
                    no_match_reason="low_confidence",
                    root_no_match=True,
                )

            groups = self.repository.find_confusion_groups_for_entry_ids(
                active_exam_target,
                [candidate.entry_id for candidate in candidates],
            )
            comparison_group = next((group for group in groups if group.id == root_id), None)
            comparison_view = build_comparison_view(comparison_group) if comparison_group else None
            root_family_view = build_root_family_view(
                root_id=root_id,
                fragment=root_family["fragment"],
                candidates=candidates,
                core_image=root_family["coreImage"],
                note=root_family["note"],
                caution=root_family["caution"],
            )
        else:
            fragment = root_fragment_query(normalized_query.normalized_text)
            if not fragment:
                return self.grounded_no_match(
                    active_exam_target=active_exam_target,
                    query=query,
                    request_id=request_id,
                    normalized_query=normalized_query,
                    no_match_reason="low_confidence",
                    root_no_match=True,
                )

            candidates = [
                candidate
                for candidate in self.repository.find_in_scope_entries(active_exam_target)
                if candidate.meanings_zh and matches_fragment(candidate, fragment)
            ]

            if not candidates:
                return self.grounded_no_match(
                    active_exam_target=active_exam_target,
                    query=query,
                    request_id=request_id,
                    normalized_query=normalized_query,
                    no_match_reason="low_confidence",
                    root_no_match=True,
                )

            root_family_view = build_root_family_view(
                root_id=fragment["id"],
                fragment=fragment["fragment"],
                candidates=candidates,
                prefix=next(
                    (
                        str(constraint["value"])
                        for constraint in fragment["constraints"]
                        if constraint["type"] == "prefix"
                    ),
                    None,
                ),
            )

        grounding = build_grounding(
            active_exam_target=active_exam_target,
            query=query,
            normalized_query=normalized_query,
            resolution="resolved",
            no_match_reason=None,
            match_type=None,
            main_answer=candidates,
            confusion_boundary=[],
            comparison_view=comparison_view,
            root_family_view=root_family_view,
            candidates=candidates,
        )

        return AdvancedLookupResult(
            status_code=200,
            payload=provider_or_fallback(
                provider=self.provider,
                answer=build_simple_answer(candidates),
                answer_kind="grounded",
                grounding=grounding,
                query=query,
                history=history,
                request_id=request_id,
                system_prompt="你是 EngGo 的词根和词形召回助手。请严格根据 grounding 回答。",
            ),
        )

    def grounded_no_match(
        self,
        *,
        active_exam_target: str,
        query: str,
        request_id: str,
        normalized_query: NormalizedQuery,
        no_match_reason: str,
        root_no_match: bool = False,
    ) -> AdvancedLookupResult:
        grounding = build_grounding(
            active_exam_target=active_exam_target,
            query=query,
            normalized_query=normalized_query,
            resolution="no_match",
            no_match_reason=no_match_reason,
            match_type=None,
            main_answer=[],
            candidates=[],
        )

        return AdvancedLookupResult(
            status_code=200,
            payload=ChatSuccessResponse(
                answer=build_root_no_match_answer() if root_no_match else build_no_match_answer(),
                answerKind="grounded",
                grounding=grounding,
                requestId=request_id,
                providerRequestId=None,
            ),
        )
