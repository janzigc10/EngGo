import csv
import io
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class EcdictRow:
    word: str
    phonetic: str
    definition: str
    translation: str
    pos: str
    collins: str
    oxford: str
    tag: str
    bnc: str
    frq: str
    exchange: str
    detail: str
    audio: str


@dataclass(frozen=True)
class EcdictBasicProfile:
    canonical: str
    lookup_key: str
    entry_kind: str
    match_kind: str
    meanings: list[str]
    raw_translation: str
    tag: str
    definition: str = ""
    source_kind: str = "external_dictionary_basic"
    review_status: str = "unreviewed"


@dataclass(frozen=True)
class EcdictBasicProfileIndex:
    profiles_by_key: dict[str, EcdictBasicProfile]
    joined_phrase_aliases: dict[str, str]


ecdict_headers = [
    "word",
    "phonetic",
    "definition",
    "translation",
    "pos",
    "collins",
    "oxford",
    "tag",
    "bnc",
    "frq",
    "exchange",
    "detail",
    "audio",
]
default_joined_phrase_aliases = {
    "accordingto": "according to",
    "oughtto": "ought to",
    "owingto": "owing to",
}
exam_profile_tags = {"zk", "gk", "cet4", "cet6", "ky"}
direct_ecdict_tags_by_scope_code = {
    "gaokao": ("gk", "zk"),
    "cet4": ("cet4",),
    "cet6": ("cet6",),
    "postgrad": ("ky",),
}
scope_closure_by_exam_target = {
    "gaokao": ("gaokao",),
    "cet4": ("gaokao", "cet4"),
    "cet6": ("gaokao", "cet4", "cet6"),
    "postgrad": ("gaokao", "cet4", "cet6", "postgrad"),
}
preferred_ecdict_tags_by_exam_target = {
    exam_target: tuple(
        tag
        for scope_code in scope_codes
        for tag in direct_ecdict_tags_by_scope_code[scope_code]
    )
    for exam_target, scope_codes in scope_closure_by_exam_target.items()
}
ecdict_tags_by_scope_code = {
    scope_code: set(tags)
    for scope_code, tags in direct_ecdict_tags_by_scope_code.items()
}
scope_code_order = ["gaokao", "cet4", "cet6", "postgrad"]


def normalize_lookup_key(value: str) -> str:
    return " ".join(value.strip().lower().split())


def infer_entry_kind(canonical: str) -> str:
    if " " in canonical:
        return "phrase"

    if "-" in canonical:
        return "hyphenated_word"

    return "word"


def normalize_dictionary_text(value: str) -> str:
    return value.replace("\\n", "\n").replace("\r\n", "\n").replace("\r", "\n")


def clean_ecdict_translation(raw_translation: str) -> list[str]:
    meanings: list[str] = []

    for raw_line in normalize_dictionary_text(raw_translation).split("\n"):
        line = " ".join(raw_line.strip().split())

        if not line:
            continue

        if line.startswith("[") and "]" in line[:10]:
            continue

        meanings.append(line)

    return meanings


def parse_ecdict_csv(raw: str) -> list[EcdictRow]:
    reader = csv.DictReader(io.StringIO(raw), fieldnames=ecdict_headers)
    next(reader, None)

    rows: list[EcdictRow] = []
    for record in reader:
        word = normalize_dictionary_text(record.get("word") or "").strip()
        if not word:
            continue

        rows.append(
            EcdictRow(
                **{
                    header: normalize_dictionary_text(record.get(header) or "").strip()
                    for header in ecdict_headers
                },
            ),
        )

    return rows


def create_profile(row: EcdictRow) -> EcdictBasicProfile | None:
    canonical = normalize_lookup_key(row.word)
    meanings = clean_ecdict_translation(row.translation)

    if not canonical or not meanings:
        return None

    return EcdictBasicProfile(
        canonical=canonical,
        lookup_key=canonical,
        entry_kind=infer_entry_kind(canonical),
        match_kind="exact",
        meanings=meanings,
        raw_translation=row.translation,
        tag=row.tag,
        definition=row.definition,
    )


def build_ecdict_basic_profile_index(
    rows: list[EcdictRow],
    joined_phrase_aliases: dict[str, str] | None = None,
) -> EcdictBasicProfileIndex:
    profiles_by_key: dict[str, EcdictBasicProfile] = {}
    normalized_aliases: dict[str, str] = {}

    for row in rows:
        profile = create_profile(row)
        if profile:
            profiles_by_key[profile.canonical] = profile

    for raw_alias, raw_canonical in (joined_phrase_aliases or default_joined_phrase_aliases).items():
        alias = normalize_lookup_key(raw_alias)
        canonical = normalize_lookup_key(raw_canonical)

        if alias and canonical and alias != canonical:
            normalized_aliases[alias] = canonical

    return EcdictBasicProfileIndex(
        profiles_by_key=profiles_by_key,
        joined_phrase_aliases=normalized_aliases,
    )


def lookup_ecdict_basic_profile(
    index: EcdictBasicProfileIndex,
    raw_query: str,
) -> EcdictBasicProfile | None:
    lookup_key = normalize_lookup_key(raw_query)
    exact_profile = index.profiles_by_key.get(lookup_key)

    if exact_profile:
        return EcdictBasicProfile(
            **{
                **exact_profile.__dict__,
                "lookup_key": lookup_key,
                "match_kind": "exact",
            },
        )

    phrase_canonical = index.joined_phrase_aliases.get(lookup_key)
    if not phrase_canonical:
        return None

    phrase_profile = index.profiles_by_key.get(phrase_canonical)
    if not phrase_profile:
        return None

    return EcdictBasicProfile(
        **{
            **phrase_profile.__dict__,
            "lookup_key": lookup_key,
            "match_kind": "joined_phrase_alias",
        },
    )


def profile_tag_set(profile: EcdictBasicProfile) -> set[str]:
    return {
        tag.strip().lower()
        for tag in profile.tag.split()
        if tag.strip()
    }


def scope_codes_for_exam_target(active_exam_target: str) -> list[str]:
    return [
        scope_code
        for scope_code in scope_code_order
        if scope_code in scope_closure_by_exam_target.get(active_exam_target, ())
    ]


def scope_code_in_exam_target(scope_code: str, active_exam_target: str) -> bool:
    return scope_code in scope_closure_by_exam_target.get(active_exam_target, ())


def scope_codes_in_exam_target(scope_codes: list[str] | tuple[str, ...], active_exam_target: str) -> bool:
    return any(
        scope_code_in_exam_target(scope_code, active_exam_target)
        for scope_code in scope_codes
    )


def scope_codes_for_profile(
    profile: EcdictBasicProfile,
    *,
    active_exam_target: str | None = None,
) -> list[str]:
    tags = profile_tag_set(profile)
    scope_codes = [
        scope_code
        for scope_code in scope_code_order
        if tags & ecdict_tags_by_scope_code[scope_code]
    ]

    if active_exam_target:
        return [
            scope_code
            for scope_code in scope_codes
            if scope_code_in_exam_target(scope_code, active_exam_target)
        ]

    return scope_codes


def search_ecdict_basic_profiles(
    index: EcdictBasicProfileIndex,
    predicate: Callable[[EcdictBasicProfile], bool],
    *,
    limit: int = 18,
    preferred_tags: tuple[str, ...] | None = None,
) -> list[EcdictBasicProfile]:
    preferred_tag_set = {
        tag.strip().lower()
        for tag in (preferred_tags or ())
        if tag.strip()
    }
    matches = [
        profile
        for profile in index.profiles_by_key.values()
        if predicate(profile)
    ]

    def sort_key(profile: EcdictBasicProfile):
        tags = profile_tag_set(profile)
        preferred_rank = 0 if tags & preferred_tag_set else 1
        exam_rank = 0 if tags & exam_profile_tags else 1

        return (
            preferred_rank,
            exam_rank,
            0 if profile.entry_kind == "word" else 1,
            len(profile.canonical),
            profile.canonical,
        )

    return sorted(matches, key=sort_key)[:limit]


class EcdictBasicProfileLookup:
    def __init__(
        self,
        *,
        dictionary_path: Path | str,
        joined_phrase_aliases: dict[str, str] | None = None,
    ):
        self.dictionary_path = Path(dictionary_path)
        self.joined_phrase_aliases = joined_phrase_aliases
        self.cached_index: EcdictBasicProfileIndex | None = None
        self.loaded = False

    def load_index(self) -> EcdictBasicProfileIndex | None:
        if self.loaded:
            return self.cached_index

        self.loaded = True
        if not self.dictionary_path.exists():
            return None

        self.cached_index = build_ecdict_basic_profile_index(
            parse_ecdict_csv(self.dictionary_path.read_text(encoding="utf-8")),
            self.joined_phrase_aliases,
        )

        return self.cached_index

    def __call__(self, query: str) -> EcdictBasicProfile | None:
        index = self.load_index()

        if not index:
            return None

        return lookup_ecdict_basic_profile(index, query)

    def search(
        self,
        predicate: Callable[[EcdictBasicProfile], bool],
        *,
        limit: int = 18,
        preferred_tags: tuple[str, ...] | None = None,
    ) -> list[EcdictBasicProfile]:
        index = self.load_index()

        if not index:
            return []

        return search_ecdict_basic_profiles(
            index,
            predicate,
            limit=limit,
            preferred_tags=preferred_tags,
        )


def create_ecdict_basic_profile_lookup(
    *,
    dictionary_path: Path | str = Path.cwd() / "output" / "external-dictionaries" / "ecdict.csv",
    joined_phrase_aliases: dict[str, str] | None = None,
):
    return EcdictBasicProfileLookup(
        dictionary_path=dictionary_path,
        joined_phrase_aliases=joined_phrase_aliases,
    )
