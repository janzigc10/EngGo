import re
from dataclasses import dataclass, field
from typing import Literal


LearningTask = Literal[
    "standard_lookup",
    "focused_compare",
    "shape_neighbors",
    "word_family",
    "form_filter",
    "semantic_filter",
    "meaning_core",
    "unknown",
]

OutputStyle = Literal[
    "compact_lookup",
    "focused_compare",
    "strict_inventory",
    "teacher_table",
    "meaning_boundary",
    "conservative_no_match",
]


@dataclass(frozen=True)
class IntentConstraint:
    type: str
    value: str
    hard: bool = True
    alternatives: tuple[str, ...] = ()

    def to_json(self) -> dict[str, object]:
        result: dict[str, object] = {
            "type": self.type,
            "value": self.value,
            "hard": self.hard,
        }
        if self.alternatives:
            result["alternatives"] = list(self.alternatives)
        return result


@dataclass(frozen=True)
class LearningIntentPlan:
    task: LearningTask
    seed_terms: list[str] = field(default_factory=list)
    constraints: list[IntentConstraint] = field(default_factory=list)
    output_style: OutputStyle = "teacher_table"
    allow_expansion: bool = False
    allowed_expansion_kinds: list[str] = field(default_factory=list)
    require_hard_filter: bool = True
    minimum_answerable_candidates: int = 2

    def to_json(self) -> dict[str, object]:
        return {
            "task": self.task,
            "seedTerms": self.seed_terms,
            "constraints": [constraint.to_json() for constraint in self.constraints],
            "outputStyle": self.output_style,
            "allowExpansion": self.allow_expansion,
            "allowedExpansionKinds": self.allowed_expansion_kinds,
            "requireHardFilter": self.require_hard_filter,
            "minimumAnswerableCandidates": self.minimum_answerable_candidates,
        }


prefix_pattern = re.compile(r"(?<![a-z])([a-z]{1,8})(?![a-z])\s*(?:开头|词首|前缀)", re.IGNORECASE)
suffix_pattern = re.compile(r"(?<![a-z])([a-z]{2,8})(?![a-z])\s*(?:结尾|词尾|后缀)", re.IGNORECASE)
contains_pattern = re.compile(r"(?:有|含有|包含)\s*([a-z]{2,12})\s*(?:的词|这个片段|这个词形)?", re.IGNORECASE)
meaning_constraint_pattern = re.compile(r"(?:意思是|表示|表达|含义是|中文是)([\u3400-\u9fff]{1,24})")
word_family_pattern = re.compile(
    r"(派生词|派生|拓展词|扩展词|相关词|变形|形式|同根|同族|这一族|一族|家族|词族|这一组|这组词|那组词|那几个词)",
    re.IGNORECASE,
)
word_family_exclusion_pattern = re.compile(
    r"(意思相关|短语|作文|表达|翻译|同义|近义|搭配)",
    re.IGNORECASE,
)
meaning_suffix_noise_pattern = re.compile(r"(的)?(单词|词|表达|意思)$")
meaning_collection_noise_pattern = re.compile(
    r"(?:的)?(?:单词|词|表达|意思)$"
)
meaning_request_suffixes = (
    "有哪些哪些考试常见",
    "哪些考试常见",
    "有哪些哪些",
    "有哪些",
    "哪一些",
    "哪些",
    "常见",
    "的",
)


semantic_aliases = {
    "共同": ("共同", "一起", "合作", "协作", "联合", "连接", "合并", "配合"),
    "一起": ("共同", "一起", "合作", "协作", "联合", "连接", "合并", "配合"),
    "合作": ("合作", "协作", "配合"),
    "评估评价": ("评估", "评价", "估计", "估算", "评论"),
    "评估": ("评估", "评价", "估计", "估算"),
    "评价": ("评估", "评价", "评论"),
    "限制": ("限制", "约束", "制约"),
    "约束": ("限制", "约束", "制约"),
    "遵守": ("遵守", "遵循", "遵从", "服从"),
    "遵循": ("遵循", "遵守", "遵从", "服从"),
    "遵从": ("遵从", "遵守", "遵循", "服从"),
    "承担责任": ("承担责任", "负责", "有责任"),
    "负责": ("负责", "有责任", "承担责任"),
    "表达观点": ("表达观点", "表达", "表示", "陈述", "观点"),
    "观点": ("观点", "看法", "意见"),
    "提前": ("提前", "预先", "先于", "之前", "预期", "预防"),
    "预先": ("提前", "预先", "先于", "之前", "预期", "预防"),
}
meaning_separator_pattern = re.compile(r"(?:或者|或|和|与|及|、|，|,|；|;)")


def normalize_meaning_alternatives(value: str) -> tuple[str, ...]:
    alternatives: list[str] = []
    seen: set[str] = set()
    chunks = [
        chunk.strip()
        for chunk in meaning_separator_pattern.split(value)
        if chunk.strip()
    ]

    if len(chunks) == 1 and chunks[0] not in semantic_aliases:
        return ()

    for chunk in chunks:
        for alias in semantic_aliases.get(chunk, (chunk,)):
            if alias in seen:
                continue
            seen.add(alias)
            alternatives.append(alias)

    return tuple(alternatives)


def build_form_constraints(text: str) -> list[IntentConstraint]:
    constraints: list[IntentConstraint] = []

    for value in prefix_pattern.findall(text):
        constraints.append(IntentConstraint("prefix", value.lower()))

    for value in suffix_pattern.findall(text):
        constraints.append(IntentConstraint("suffix", value.lower()))

    for value in contains_pattern.findall(text):
        constraints.append(IntentConstraint("contains", value.lower()))

    return constraints


def clean_meaning_constraint_value(value: str) -> str:
    result = value.strip()

    changed = True
    while changed:
        changed = False
        for suffix in meaning_request_suffixes:
            if result.endswith(suffix):
                result = result[: -len(suffix)].strip()
                changed = True
                break
        cleaned = meaning_collection_noise_pattern.sub("", result).strip()
        cleaned = meaning_suffix_noise_pattern.sub("", cleaned).strip()
        if cleaned != result:
            result = cleaned
            changed = True

    return result.removesuffix("的").strip()


def extract_meaning_constraints(text: str) -> list[IntentConstraint]:
    constraints: list[IntentConstraint] = []

    for match in meaning_constraint_pattern.finditer(text):
        value = clean_meaning_constraint_value(match.group(1))
        if value:
            constraints.append(
                IntentConstraint(
                    "meaning",
                    value,
                    alternatives=normalize_meaning_alternatives(value),
                )
            )

    return constraints


def has_word_family_expansion_cue(text: str, english_terms: list[str]) -> bool:
    if not english_terms:
        return False

    if word_family_exclusion_pattern.search(text) is not None:
        return False

    return word_family_pattern.search(text) is not None


def build_learning_intent_plan(normalized_query) -> LearningIntentPlan:
    text = normalized_query.normalized_text
    english_terms = list(normalized_query.english_terms)
    constraints = [
        *build_form_constraints(text),
        *extract_meaning_constraints(text),
    ]

    if normalized_query.query_mode == "direct_compare":
        return LearningIntentPlan(
            task="focused_compare",
            seed_terms=list(normalized_query.compare_terms),
            output_style="focused_compare",
            allow_expansion=False,
            require_hard_filter=False,
            minimum_answerable_candidates=2,
        )

    if normalized_query.query_mode == "shape_neighbor_search":
        return LearningIntentPlan(
            task="shape_neighbors",
            seed_terms=english_terms[:1],
            output_style="teacher_table",
            allow_expansion=True,
            allowed_expansion_kinds=["shape_neighbor", "grounded_learning_association"],
            require_hard_filter=False,
            minimum_answerable_candidates=2,
        )

    if has_word_family_expansion_cue(text, english_terms):
        return LearningIntentPlan(
            task="word_family",
            seed_terms=english_terms[:1],
            output_style="teacher_table",
            allow_expansion=True,
            allowed_expansion_kinds=["derivative_family"],
            require_hard_filter=False,
            minimum_answerable_candidates=2,
        )

    if normalized_query.is_supported_ordinary_lookup:
        return LearningIntentPlan(
            task="standard_lookup",
            seed_terms=english_terms,
            output_style="compact_lookup",
            require_hard_filter=False,
            minimum_answerable_candidates=1,
        )

    has_meaning_constraint = any(
        constraint.type == "meaning"
        for constraint in constraints
    )
    has_form_constraint = any(
        constraint.type in {"prefix", "suffix", "contains"}
        for constraint in constraints
    )

    if has_meaning_constraint and has_form_constraint:
        return LearningIntentPlan(
            task="semantic_filter",
            seed_terms=english_terms,
            constraints=constraints,
            output_style="teacher_table",
            allow_expansion=False,
            require_hard_filter=True,
            minimum_answerable_candidates=1,
        )

    if has_form_constraint:
        return LearningIntentPlan(
            task="form_filter",
            seed_terms=english_terms,
            constraints=[
                constraint
                for constraint in constraints
                if constraint.type in {"prefix", "suffix", "contains"}
            ],
            output_style="strict_inventory",
            allow_expansion=False,
            require_hard_filter=True,
            minimum_answerable_candidates=1,
        )

    if normalized_query.query_mode == "meaning_lookup":
        return LearningIntentPlan(
            task="meaning_core",
            seed_terms=english_terms,
            constraints=[
                constraint
                for constraint in constraints
                if constraint.type == "meaning"
            ],
            output_style="meaning_boundary",
            require_hard_filter=False,
        )

    return LearningIntentPlan(
        task="unknown",
        seed_terms=english_terms,
        output_style="conservative_no_match",
        require_hard_filter=False,
    )
