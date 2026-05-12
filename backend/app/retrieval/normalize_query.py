import re
from dataclasses import dataclass


QueryMode = str

english_token_pattern = re.compile(r"[a-z]+(?:[-'][a-z]+)*", re.IGNORECASE)
compare_cue_pattern = re.compile(
    r"(区别|差别|不同|怎么区分|怎么分|搞混|分不清|哪个|哪一个|还是|vs\.?|versus|\bor\b)",
    re.IGNORECASE,
)
root_cue_pattern = re.compile(
    r"(词根|前缀|后缀|同根|这一族|家族|派生|构词|组合|开头|结尾|词首|词尾)",
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
    r"(同根|这一族|一族|家族|派生|构词|一样|那几个词|那组词|怎么记|怎么背)",
    re.IGNORECASE,
)
shape_neighbor_cue_pattern = re.compile(
    r"(很像|形近|长得像|看错|看成|容易.*混|拼写.{0,4}(像|近|相似))",
    re.IGNORECASE,
)
shape_neighbor_list_pattern = re.compile(
    r"(哪些|什么|哪几个|列举|举例|有什么)",
    re.IGNORECASE,
)
meaning_noise_pattern = re.compile(r"(是什么意思|怎么说|什么意思|是什么|啥意思|英文|英语|单词|有个|像|的词)")
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

    def to_json(self) -> dict[str, object]:
        return {
            "raw": self.raw,
            "normalizedText": self.normalized_text,
            "queryMode": self.query_mode,
            "englishTerms": self.english_terms,
            "meaningHint": self.meaning_hint,
            "compareTerms": self.compare_terms,
            "groupSeedTerm": self.group_seed_term,
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


def build_meaning_hint(normalized_text: str) -> str:
    return re.sub(r"\s+", " ", meaning_noise_pattern.sub("", normalized_text)).strip()


def contains_shape_neighbor_cue(normalized_text: str) -> bool:
    if shape_neighbor_cue_pattern.search(normalized_text) is None:
        return False

    return (
        shape_neighbor_list_pattern.search(normalized_text) is not None
        or re.search(r"(看错|看成|形近)", normalized_text, re.IGNORECASE) is not None
    )


def contains_known_root_family_cue(normalized_text: str, english_terms: list[str]) -> bool:
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
            re.compile(r"\b([a-z]{2,8})\s*(?:开头|词首|前缀)", re.IGNORECASE),
            re.compile(r"\b([a-z]{2,8})\s*(?:结尾|词尾|后缀)", re.IGNORECASE),
            re.compile(r"(?:有|含有|包含)\s*([a-z]{2,12})\s*(?:的词|这个片段|这个词形)?", re.IGNORECASE),
        ]
    )


def normalize_query(query: str) -> NormalizedQuery:
    normalized_text = normalize_ascii(query)
    english_terms = extract_english_terms(normalized_text)
    has_chinese = chinese_pattern.search(normalized_text) is not None
    is_root_query = (
        root_cue_pattern.search(normalized_text) is not None
        or root_fragment_pattern.search(normalized_text) is not None
        or contains_known_root_family_cue(normalized_text, english_terms)
        or contains_root_fragment_recall_pattern(normalized_text)
    )
    compare_terms = (
        english_terms[:4]
        if compare_cue_pattern.search(normalized_text) is not None
        else []
    )

    query_mode: QueryMode = "meaning_lookup"

    if english_terms and contains_known_root_family_cue(normalized_text, english_terms):
        query_mode = "root_family_summary"
    elif english_terms and is_root_query:
        query_mode = "root_family_summary"
    elif len(compare_terms) >= 2:
        query_mode = "direct_compare"
    elif len(english_terms) == 1 and contains_shape_neighbor_cue(normalized_text):
        query_mode = "shape_neighbor_search"
    elif english_terms and not has_chinese:
        query_mode = "direct_lookup"
    elif english_terms:
        query_mode = "fuzzy_recall"

    return NormalizedQuery(
        raw=query,
        normalized_text=normalized_text,
        query_mode=query_mode,
        english_terms=english_terms,
        meaning_hint=build_meaning_hint(normalized_text),
        compare_terms=compare_terms,
        group_seed_term=None,
        is_supported_ordinary_lookup=query_mode in {"direct_lookup", "fuzzy_recall"},
    )
