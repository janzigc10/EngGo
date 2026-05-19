import re
from dataclasses import dataclass, replace

from backend.app.retrieval.learning_intent import (
    LearningIntentPlan,
    build_learning_intent_plan,
)


QueryMode = str

english_token_pattern = re.compile(r"[a-z]+(?:[-'][a-z]+)*", re.IGNORECASE)
compare_cue_pattern = re.compile(
    r"(区别|差别|不同|怎么区分|怎么分|搞混|分不清|哪个|哪一个|还是|vs\.?|versus|\bor\b)",
    re.IGNORECASE,
)
compact_chinese_compare_connector_pattern = re.compile(
    r"[a-z]+(?:[-'][a-z]+)*\s*(?:和|与|跟)\s*[a-z]+(?:[-'][a-z]+)*",
    re.IGNORECASE,
)
root_cue_pattern = re.compile(
    r"(词根|前缀|后缀|同根|这一族|一族|家族|词族|这组词|那组词|派生词|派生|构词|组合|开头|结尾|词首|词尾)",
    re.IGNORECASE,
)
root_fragment_pattern = re.compile(
    r"[a-z]+\+[a-z]+|[a-z]+\.\.\.[a-z]+|(?:^|\s)-[a-z]+",
    re.IGNORECASE,
)
standalone_fragment_recall_pattern = re.compile(
    r"\b[a-z]{3,12}\s*(?:这串|这段|这个片段|相关.*(?:词|整理)|怎么整理)",
    re.IGNORECASE,
)
exact_fragment_question_pattern = re.compile(
    r"^([a-z]{4,10})\s*(?:是(什么|啥)|什么意思)$",
    re.IGNORECASE,
)
family_recall_cue_pattern = re.compile(
    r"(派生词|派生|同根|这一族|一族|家族|词族|这组词|那组词|一样|那几个词)",
    re.IGNORECASE,
)
shape_neighbor_cue_pattern = re.compile(
    r"(很像|比较像|相像|相似|类似|形近|长得像|看错|看成|易混词?|容易.*混|拼写.{0,4}(像|近|相似))",
    re.IGNORECASE,
)
shape_neighbor_list_pattern = re.compile(
    r"(哪些|什么|哪几个|列举|举例|有什么|帮我找|找一下|找找|易混词?)",
    re.IGNORECASE,
)
plain_like_word_pattern = re.compile(
    r"(有个|找|找一下|帮我找|哪些|什么|哪几个).{0,8}(像|相似|类似).{0,12}(词|单词)",
    re.IGNORECASE,
)
bare_connector_like_word_pattern = re.compile(
    (
        "(?:\\u548c|\\u8ddf)\\s*"
        r"[a-z]+(?:[-'][a-z]+)*"
        "\\s*(?:\\u5f88\\u50cf|\\u6bd4\\u8f83\\u50cf|"
        "\\u50cf|\\u76f8\\u4f3c|\\u7c7b\\u4f3c)"
        "\\s*\\u7684?\\s*(?:\\u8bcd|\\u5355\\u8bcd)"
    ),
    re.IGNORECASE,
)
semantic_similarity_pattern = re.compile(
    r"(相似|类似|很像|比较像|相像).{0,16}(意思|含义|近义|同义)|(意思|含义|近义|同义).{0,16}(相似|类似|很像|比较像|相像)",
    re.IGNORECASE,
)
meaning_noise_pattern = re.compile(r"(是什么意思|怎么说|什么意思|是什么|啥意思|英文|英语|单词|有个|像|的词)")
meaning_hint_prefixes = (
    "有没有表示",
    "有没有表达",
    "可以表示",
    "可以表达",
    "能够表示",
    "能够表达",
    "能表示",
    "能表达",
    "用来表示",
    "用来表达",
    "表示",
    "表达",
)
meaning_hint_suffixes = (
    "的英文是什么",
    "英文是什么",
    "的英文是啥",
    "英文是啥",
    "的英语是什么",
    "英语是什么",
    "用英语怎么说",
    "用英文怎么说",
    "英语怎么说",
    "英文怎么说",
    "有哪些哪些考试常见",
    "哪些考试常见",
    "有哪些哪些",
    "有哪些",
    "哪一些",
    "哪些",
    "的单词",
    "的词",
    "的表达",
    "怎么说",
    "是什么意思",
    "什么意思",
    "是什么",
    "啥意思",
    "是啥",
    "考试常见",
    "常见",
    "的",
)
chinese_pattern = re.compile(r"[\u3400-\u9fff]")
standalone_root_fragments = {"stitute"}
known_root_family_terms = {
    "institute",
    "institution",
    "constitute",
    "substitute",
    "restitute",
    "prostitute",
    "attempt",
    "tempt",
    "temptation",
    "contempt",
}


@dataclass(frozen=True)
class NormalizedQuery:
    raw: str
    normalized_text: str
    query_mode: QueryMode
    english_terms: list[str]
    meaning_hint: str
    compare_terms: list[str]
    group_seed_term: str | None
    is_supported_ordinary_lookup: bool
    intent_plan: LearningIntentPlan | None = None

    def to_json(self) -> dict[str, object]:
        return {
            "raw": self.raw,
            "normalizedText": self.normalized_text,
            "queryMode": self.query_mode,
            "englishTerms": self.english_terms,
            "meaningHint": self.meaning_hint,
            "compareTerms": self.compare_terms,
            "groupSeedTerm": self.group_seed_term,
            "learningIntentPlan": (
                self.intent_plan.to_json()
                if self.intent_plan is not None
                else None
            ),
        }


def normalize_ascii(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().replace("，", " ").replace("、", " ").replace("/", " ")).lower()


def unique_terms(terms: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []

    for term in terms:
        if term in seen:
            continue

        seen.add(term)
        result.append(term)

    return result


def extract_english_terms(normalized_text: str) -> list[str]:
    return unique_terms([match.group(0).lower() for match in english_token_pattern.finditer(normalized_text)])


def strip_meaning_request_prefix(value: str) -> str:
    for prefix in meaning_hint_prefixes:
        if not value.startswith(prefix) or len(value) <= len(prefix):
            continue

        stripped = value[len(prefix):].strip()
        if prefix == "表达" and stripped.startswith("观点"):
            return value

        return stripped

    return value


def build_meaning_hint(normalized_text: str) -> str:
    hint = " ".join(normalized_text.strip().split())
    if not hint:
        return ""

    changed = True
    while changed:
        changed = False
        for suffix in meaning_hint_suffixes:
            if hint.endswith(suffix):
                hint = hint[: -len(suffix)].strip()
                changed = True
                break

    hint = strip_meaning_request_prefix(hint)

    changed = True
    while changed:
        changed = False
        for suffix in meaning_hint_suffixes:
            if hint.endswith(suffix):
                hint = hint[: -len(suffix)].strip()
                changed = True
                break

    return re.sub(r"\s+", " ", meaning_noise_pattern.sub("", hint)).strip()


def is_phrase_lookup_with_chinese_suffix(
    *,
    normalized_text: str,
    english_terms: list[str],
    meaning_hint: str,
    has_chinese: bool,
) -> bool:
    if not has_chinese or len(english_terms) < 2:
        return False

    if meaning_hint != " ".join(english_terms):
        return False

    return re.search(r"(是什么意思|什么意思|是什么|啥意思)", normalized_text) is not None


def contains_shape_neighbor_cue(normalized_text: str) -> bool:
    if semantic_similarity_pattern.search(normalized_text) is not None:
        return False

    if plain_like_word_pattern.search(normalized_text) is not None:
        return True

    if bare_connector_like_word_pattern.search(normalized_text) is not None:
        return True

    if shape_neighbor_cue_pattern.search(normalized_text) is None:
        return False

    return (
        shape_neighbor_list_pattern.search(normalized_text) is not None
        or re.search(r"(看错|看成|形近|易混|很像|比较像|相像|相似|类似|长得像)", normalized_text, re.IGNORECASE) is not None
    )


def contains_compare_cue(normalized_text: str, english_terms: list[str]) -> bool:
    if compare_cue_pattern.search(normalized_text) is not None:
        return True

    return (
        len(english_terms) >= 2
        and compact_chinese_compare_connector_pattern.search(normalized_text)
        is not None
    )


def contains_known_root_family_cue(normalized_text: str, english_terms: list[str]) -> bool:
    if english_terms and family_recall_cue_pattern.search(normalized_text):
        return True

    if any(term in known_root_family_terms for term in english_terms):
        return family_recall_cue_pattern.search(normalized_text) is not None

    if (
        "stitute" in english_terms
        and re.search(r"(词根|家族|派生|构词)", normalized_text, re.IGNORECASE)
    ):
        return True

    fragment_question = exact_fragment_question_pattern.match(normalized_text)

    return (
        fragment_question is not None
        and fragment_question.group(1).lower() in standalone_root_fragments
    )


def contains_root_fragment_recall_pattern(normalized_text: str) -> bool:
    text = normalized_text.lower()

    if standalone_fragment_recall_pattern.search(text):
        return True

    if re.search(r"\b[a-z]{1,8}\+[a-z]{1,8}\b", text) and "词根" in text:
        return False

    if re.search(r"\b([a-z]{1,8})\.\.\.([a-z]{1,8})\b", text, re.IGNORECASE):
        return True

    if (
        re.search(r"\b([a-z]{1,8}(?:\+[a-z]{1,8})+)\b", text, re.IGNORECASE)
        and re.search(r"(词形|这种词|这类词|包含|都有)", text)
    ):
        return True

    return any(
        pattern.search(text) is not None
        for pattern in [
            re.compile(r"\b([a-z]{1,8})\s*(?:开头|词首|前缀)", re.IGNORECASE),
            re.compile(r"\b([a-z]{2,8})\s*(?:结尾|词尾|后缀)", re.IGNORECASE),
            re.compile(r"(?:有|含有|包含)\s*([a-z]{2,12})\s*(?:的词|这个片段|这个词形)?", re.IGNORECASE),
        ]
    )


def normalize_query(query: str) -> NormalizedQuery:
    normalized_text = normalize_ascii(query)
    english_terms = extract_english_terms(normalized_text)
    has_chinese = chinese_pattern.search(normalized_text) is not None
    meaning_hint = build_meaning_hint(normalized_text)
    is_root_query = (
        root_cue_pattern.search(normalized_text) is not None
        or root_fragment_pattern.search(normalized_text) is not None
        or contains_known_root_family_cue(normalized_text, english_terms)
        or contains_root_fragment_recall_pattern(normalized_text)
    )
    compare_terms = (
        english_terms[:4]
        if contains_compare_cue(normalized_text, english_terms)
        else []
    )

    query_mode: QueryMode = "meaning_lookup"

    if english_terms and contains_known_root_family_cue(normalized_text, english_terms):
        query_mode = "root_family_summary"
    elif english_terms and is_root_query:
        query_mode = "root_family_summary"
    elif len(compare_terms) >= 2:
        query_mode = "direct_compare"
    elif english_terms and contains_shape_neighbor_cue(normalized_text):
        query_mode = "shape_neighbor_search"
    elif is_phrase_lookup_with_chinese_suffix(
        normalized_text=normalized_text,
        english_terms=english_terms,
        meaning_hint=meaning_hint,
        has_chinese=has_chinese,
    ):
        query_mode = "direct_lookup"
    elif english_terms and not has_chinese:
        query_mode = "direct_lookup"
    elif english_terms:
        query_mode = "fuzzy_recall"

    normalized_query = NormalizedQuery(
        raw=query,
        normalized_text=normalized_text,
        query_mode=query_mode,
        english_terms=english_terms,
        meaning_hint=meaning_hint,
        compare_terms=compare_terms,
        group_seed_term=None,
        is_supported_ordinary_lookup=query_mode in {"direct_lookup", "fuzzy_recall"},
    )

    return replace(
        normalized_query,
        intent_plan=build_learning_intent_plan(normalized_query),
    )
