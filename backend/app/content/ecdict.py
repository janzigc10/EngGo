import csv
import io
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


def create_ecdict_basic_profile_lookup(
    *,
    dictionary_path: Path | str = Path.cwd() / "output" / "external-dictionaries" / "ecdict.csv",
    joined_phrase_aliases: dict[str, str] | None = None,
):
    cached_index: EcdictBasicProfileIndex | None = None
    loaded = False

    def load_index() -> EcdictBasicProfileIndex | None:
        nonlocal cached_index, loaded

        if loaded:
            return cached_index

        loaded = True
        path = Path(dictionary_path)

        if not path.exists():
            return None

        cached_index = build_ecdict_basic_profile_index(
            parse_ecdict_csv(path.read_text(encoding="utf-8")),
            joined_phrase_aliases,
        )

        return cached_index

    def lookup(query: str) -> EcdictBasicProfile | None:
        index = load_index()

        if not index:
            return None

        return lookup_ecdict_basic_profile(index, query)

    return lookup
