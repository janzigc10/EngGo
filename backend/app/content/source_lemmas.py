from dataclasses import dataclass
from pathlib import Path


SourceScopeCode = str


@dataclass(frozen=True)
class SourceLemmaMembership:
    lemma: str
    scope_code: SourceScopeCode
    source_name: str
    source_scope: str


explicit_lookup_aliases = {
    "according to": "accordingto",
    "ought to": "oughtto",
    "owing to": "owingto",
}


def normalize_lemma(lemma: str) -> str:
    return lemma.strip().lower()


def source_lookup_keys(lemma: str) -> set[str]:
    normalized = " ".join(normalize_lemma(lemma).split())
    alias = explicit_lookup_aliases.get(normalized)

    return {value for value in [normalized, alias] if value}


def add_membership(
    memberships: list[SourceLemmaMembership],
    *,
    lemma: str,
    scope_code: SourceScopeCode,
    source_name: str,
    source_scope: str,
):
    if not lemma:
        return

    memberships.append(
        SourceLemmaMembership(
            lemma=lemma,
            scope_code=scope_code,
            source_name=source_name,
            source_scope=source_scope,
        ),
    )


def read_gaokao_memberships(raw: str) -> list[SourceLemmaMembership]:
    source_name = "gaokao-2020-lemmas.txt"
    memberships: list[SourceLemmaMembership] = []

    for line in raw.splitlines():
        lemma = normalize_lemma(line)
        add_membership(
            memberships,
            lemma=lemma,
            scope_code="gaokao",
            source_name=source_name,
            source_scope="gaokao",
        )

    return memberships


def read_cet_memberships(raw: str) -> list[SourceLemmaMembership]:
    source_name = "cet-2016-lemmas.tsv"
    memberships: list[SourceLemmaMembership] = []

    for line in raw.splitlines():
        raw_lemma, _, raw_source_scope = line.partition("\t")
        lemma = normalize_lemma(raw_lemma)
        source_scope = raw_source_scope.strip()

        if not lemma or lemma == "lemma" or not source_scope:
            continue

        if source_scope == "cet4":
            add_membership(
                memberships,
                lemma=lemma,
                scope_code="cet4",
                source_name=source_name,
                source_scope=source_scope,
            )
            add_membership(
                memberships,
                lemma=lemma,
                scope_code="cet6",
                source_name=source_name,
                source_scope=source_scope,
            )
            continue

        if source_scope == "cet6-extra":
            add_membership(
                memberships,
                lemma=lemma,
                scope_code="cet6",
                source_name=source_name,
                source_scope=source_scope,
            )

    return memberships


def unique_memberships(
    memberships: list[SourceLemmaMembership],
) -> list[SourceLemmaMembership]:
    seen: set[tuple[str, str, str, str]] = set()
    result: list[SourceLemmaMembership] = []

    for membership in memberships:
        key = (
            membership.lemma,
            membership.scope_code,
            membership.source_name,
            membership.source_scope,
        )
        if key in seen:
            continue

        seen.add(key)
        result.append(membership)

    return result


def load_source_lemma_memberships(
    *,
    base_dir: Path | str = Path.cwd() / "data" / "exam-vocab",
) -> list[SourceLemmaMembership]:
    base_path = Path(base_dir)
    source_dir = base_path / "source-lemmas"
    try:
        gaokao_raw = (source_dir / "gaokao-2020-lemmas.txt").read_text(encoding="utf-8")
        cet_raw = (source_dir / "cet-2016-lemmas.tsv").read_text(encoding="utf-8")
    except FileNotFoundError:
        return []

    return unique_memberships(
        [
            *read_gaokao_memberships(gaokao_raw),
            *read_cet_memberships(cet_raw),
        ],
    )


def find_source_lemma_memberships_for_lookup(
    lemma: str,
    *,
    base_dir: Path | str = Path.cwd() / "data" / "exam-vocab",
) -> list[SourceLemmaMembership]:
    lookup_keys = source_lookup_keys(lemma)
    memberships = load_source_lemma_memberships(base_dir=base_dir)

    return [membership for membership in memberships if membership.lemma in lookup_keys]
