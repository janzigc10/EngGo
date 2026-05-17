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
meaning_constraint_pattern = re.compile(r"(?:意思是|表示|含义是|中文是)([\u3400-\u9fff]{1,12})")
word_family_pattern = re.compile(r"(派生词|派生|同根|这一族|一族|家族|词族|这组词|那组词|那几个词)", re.IGNORECASE)
meaning_suffix_noise_pattern = re.compile(r"(的)?(单词|词|表达|意思)$")


meaning_alternatives_by_value = {
    "共同或一起": ("共同", "一起", "合作", "联合", "连接"),
    "共同": ("共同", "一起", "合作", "联合", "连接"),
    "一起": ("共同", "一起", "合作", "联合", "连接"),
    "评估评价": ("评估", "评价", "估计"),
    "评估": ("评估", "评价", "估计"),
    "评价": ("评估", "评价", "估计"),
    "限制或约束": ("限制", "约束"),
    "限制": ("限制", "约束"),
    "约束": ("限制", "约束"),
}


def build_form_constraints(text: str) -> list[IntentConstraint]:
    constraints: list[IntentConstraint] = []

    for value in prefix_pattern.findall(text):
        constraints.append(IntentConstraint("prefix", value.lower()))

    for value in suffix_pattern.findall(text):
        constraints.append(IntentConstraint("suffix", value.lower()))

    for value in contains_pattern.findall(text):
        constraints.append(IntentConstraint("contains", value.lower()))

    return constraints


def extract_meaning_constraints(text: str) -> list[IntentConstraint]:
    constraints: list[IntentConstraint] = []

    for match in meaning_constraint_pattern.finditer(text):
        value = meaning_suffix_noise_pattern.sub("", match.group(1)).strip()
        value = value.removesuffix("的")
        if value:
            constraints.append(
                IntentConstraint(
                    "meaning",
                    value,
                    alternatives=meaning_alternatives_by_value.get(value, ()),
                )
            )

    return constraints


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

    if english_terms and word_family_pattern.search(text):
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
