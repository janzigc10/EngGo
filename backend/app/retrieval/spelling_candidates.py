from collections.abc import Collection, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from backend.app.content.compact_exam_wordbook import (
    CompactExamWordbookInvalid,
    CompactExamWordbookLoader,
    CompactExamWordbookUnavailable,
)
from backend.app.content.ecdict import scope_codes_for_exam_target


alphabet = "abcdefghijklmnopqrstuvwxyz"
default_max_generated_variants = 2_000_000
MAX_SPELLING_TERM_LENGTH = 32


@dataclass(frozen=True)
class SpellingLexicon:
    global_lemmas: Collection[str] | Mapping[str, object]
    direct_scope_codes_by_lemma: Mapping[str, tuple[str, ...]]
    source_version: str


@dataclass(frozen=True)
class SpellingCandidate:
    lemma: str
    edit_distance: int
    in_active_exam_scope: bool
    scope_codes: tuple[str, ...]
    source_kind: str
    reason_codes: tuple[str, ...]
    rank_key: tuple[Any, ...]


@dataclass(frozen=True)
class SpellingCandidateResult:
    term: str
    status: str
    input_is_known_word: bool
    global_competition_complete: bool
    candidates: tuple[SpellingCandidate, ...]
    lexicon_version: str


class _SpellingSourceUnavailable(RuntimeError):
    pass


class _SpellingSourceInvalid(RuntimeError):
    pass


@dataclass(frozen=True)
class _PreparedLexicon:
    global_membership: Collection[str] | Mapping[str, object]
    direct_scope_codes_by_lemma: Mapping[str, tuple[str, ...]]
    source_version: str

    def contains(self, lemma: str) -> bool:
        return lemma in self.global_membership

    def canonical(self, lemma: str) -> str:
        if isinstance(self.global_membership, Mapping):
            value = self.global_membership.get(lemma)
            canonical = getattr(value, "canonical", None)
            if isinstance(canonical, str) and canonical:
                return canonical
            if isinstance(value, str) and value:
                return value

        return lemma


def normalize_spelling_term(value: str) -> str:
    term = value.strip().lower()
    if not term or not term.isascii() or not term.isalpha():
        return ""
    return term


def bounded_osa_distance(source: str, target: str, max_distance: int = 2) -> int:
    """Return optimal-string-alignment distance, capped at max_distance + 1."""

    if abs(len(source) - len(target)) > max_distance:
        return max_distance + 1

    previous_previous: list[int] | None = None
    previous = list(range(len(target) + 1))

    for source_index in range(1, len(source) + 1):
        current = [source_index]
        for target_index in range(1, len(target) + 1):
            substitution_cost = (
                0
                if source[source_index - 1] == target[target_index - 1]
                else 1
            )
            value = min(
                previous[target_index] + 1,
                current[target_index - 1] + 1,
                previous[target_index - 1] + substitution_cost,
            )
            if (
                previous_previous is not None
                and source_index > 1
                and target_index > 1
                and source[source_index - 1] == target[target_index - 2]
                and source[source_index - 2] == target[target_index - 1]
            ):
                value = min(
                    value,
                    previous_previous[target_index - 2] + 1,
                )
            current.append(value)

        previous_previous, previous = previous, current

    distance = previous[len(target)]
    return distance if distance <= max_distance else max_distance + 1


def _is_adjacent_transposition(source: str, target: str) -> bool:
    if len(source) != len(target) or source == target:
        return False

    differing_indexes = [
        index
        for index, (left, right) in enumerate(zip(source, target))
        if left != right
    ]
    return (
        len(differing_indexes) == 2
        and differing_indexes[1] == differing_indexes[0] + 1
        and source[differing_indexes[0]] == target[differing_indexes[1]]
        and source[differing_indexes[1]] == target[differing_indexes[0]]
    )


def _edit_variants_once(term: str):
    for index in range(len(term)):
        yield term[:index] + term[index + 1 :]

    for index in range(len(term) - 1):
        if term[index] != term[index + 1]:
            yield (
                term[:index]
                + term[index + 1]
                + term[index]
                + term[index + 2 :]
            )

    for index, current_character in enumerate(term):
        prefix = term[:index]
        suffix = term[index + 1 :]
        for character in alphabet:
            if character != current_character:
                yield prefix + character + suffix

    for index in range(len(term) + 1):
        prefix = term[:index]
        suffix = term[index:]
        for character in alphabet:
            yield prefix + character + suffix


def _ecdict_source_version(ecdict_lookup, profile_count: int) -> str:
    raw_path = getattr(ecdict_lookup, "dictionary_path", None)
    if raw_path is None:
        return f"ecdict-index:{profile_count}"

    path = Path(raw_path)
    try:
        stat = path.stat()
    except OSError:
        return f"ecdict-index:{profile_count}"

    return f"ecdict:{stat.st_size}:{stat.st_mtime_ns}"


def _prepare_lexicon(lexicon: SpellingLexicon) -> _PreparedLexicon:
    if not lexicon.source_version.strip():
        raise _SpellingSourceInvalid("spelling lexicon has no source version")

    global_membership: Collection[str] | Mapping[str, object]
    if isinstance(lexicon.global_lemmas, Mapping):
        global_membership = lexicon.global_lemmas
    elif isinstance(lexicon.global_lemmas, (set, frozenset)):
        global_membership = lexicon.global_lemmas
    else:
        normalized_lemmas = {
            normalized
            for lemma in lexicon.global_lemmas
            if (normalized := normalize_spelling_term(lemma))
        }
        global_membership = frozenset(normalized_lemmas)

    if not global_membership:
        raise _SpellingSourceUnavailable("ECDICT canonical lemma index is empty")

    for lemma, scope_codes in lexicon.direct_scope_codes_by_lemma.items():
        normalized_lemma = normalize_spelling_term(lemma)
        if normalized_lemma != lemma or not scope_codes:
            raise _SpellingSourceInvalid(
                f"compact wordbook contains an invalid spelling entry: {lemma!r}",
            )
        if lemma not in global_membership:
            raise _SpellingSourceInvalid(
                f"compact wordbook lemma is absent from ECDICT: {lemma}",
            )

    return _PreparedLexicon(
        global_membership=global_membership,
        direct_scope_codes_by_lemma=lexicon.direct_scope_codes_by_lemma,
        source_version=lexicon.source_version,
    )


class EcdictSpellingCandidateProvider:
    def __init__(
        self,
        *,
        lexicon: SpellingLexicon | None = None,
        ecdict_lookup=None,
        compact_wordbook_loader: CompactExamWordbookLoader | None = None,
        max_edit_distance: int = 2,
        max_generated_variants: int | None = default_max_generated_variants,
    ):
        if max_edit_distance not in {1, 2}:
            raise ValueError("max_edit_distance must be 1 or 2")
        if max_generated_variants is not None and max_generated_variants <= 0:
            raise ValueError("max_generated_variants must be positive or None")

        self._explicit_lexicon = lexicon
        self._ecdict_lookup = ecdict_lookup
        self._compact_wordbook_loader = compact_wordbook_loader
        self.max_edit_distance = max_edit_distance
        self.max_generated_variants = max_generated_variants
        self._prepared_lexicon: _PreparedLexicon | None = None

    def _load_lexicon(self) -> _PreparedLexicon:
        if self._prepared_lexicon is not None:
            return self._prepared_lexicon

        if self._explicit_lexicon is not None:
            lexicon = self._explicit_lexicon
        else:
            if self._ecdict_lookup is None or self._compact_wordbook_loader is None:
                raise _SpellingSourceUnavailable(
                    "ECDICT lookup and compact wordbook loader are required",
                )

            try:
                wordbook = self._compact_wordbook_loader.load()
            except CompactExamWordbookUnavailable as error:
                raise _SpellingSourceUnavailable(str(error)) from error
            except CompactExamWordbookInvalid as error:
                raise _SpellingSourceInvalid(str(error)) from error
            except Exception as error:
                raise _SpellingSourceInvalid(
                    f"compact wordbook failed to load: {error}",
                ) from error

            try:
                index = self._ecdict_lookup.load_index()
            except Exception as error:
                raise _SpellingSourceInvalid(
                    f"ECDICT canonical lemma index failed to load: {error}",
                ) from error

            if index is None:
                raise _SpellingSourceUnavailable(
                    "ECDICT canonical lemma index is unavailable",
                )

            profiles_by_key = getattr(index, "profiles_by_key", None)
            if not isinstance(profiles_by_key, Mapping):
                raise _SpellingSourceInvalid(
                    "ECDICT canonical lemma index has an invalid shape",
                )

            ecdict_version = _ecdict_source_version(
                self._ecdict_lookup,
                len(profiles_by_key),
            )
            lexicon = SpellingLexicon(
                global_lemmas=profiles_by_key,
                direct_scope_codes_by_lemma=(
                    wordbook.direct_scope_codes_by_lemma
                ),
                source_version=(
                    f"{ecdict_version}|{wordbook.source_version}"
                ),
            )

        self._prepared_lexicon = _prepare_lexicon(lexicon)
        return self._prepared_lexicon

    def _failure_result(
        self,
        *,
        term: str,
        status: str,
    ) -> SpellingCandidateResult:
        return SpellingCandidateResult(
            term=term,
            status=status,
            input_is_known_word=False,
            global_competition_complete=False,
            candidates=(),
            lexicon_version="unavailable",
        )

    def generate(
        self,
        *,
        term: str,
        active_exam_target: str,
        limit: int = 8,
    ) -> SpellingCandidateResult:
        if limit < 2:
            raise ValueError("limit must be at least 2 for ambiguity-safe decisions")

        normalized_term = normalize_spelling_term(term)
        if (
            not normalized_term
            or len(normalized_term) > MAX_SPELLING_TERM_LENGTH
        ):
            return SpellingCandidateResult(
                term=term.strip().lower(),
                status="unsupported_term",
                input_is_known_word=False,
                global_competition_complete=True,
                candidates=(),
                lexicon_version="not_loaded",
            )

        try:
            lexicon = self._load_lexicon()
        except _SpellingSourceUnavailable:
            return self._failure_result(
                term=normalized_term,
                status="candidate_source_unavailable",
            )
        except _SpellingSourceInvalid:
            return self._failure_result(
                term=normalized_term,
                status="candidate_source_error",
            )

        input_is_known_word = lexicon.contains(normalized_term)

        active_scope_codes = frozenset(
            scope_codes_for_exam_target(active_exam_target),
        )
        matched_distances: dict[str, int] = {}
        maximum_variants = self.max_generated_variants
        generated_variant_count = 0
        budget_exhausted = False
        first_edits: list[str] = []
        seen_first_edits: set[str] = set()
        global_membership = lexicon.global_membership

        for variant in _edit_variants_once(normalized_term):
            if variant in seen_first_edits:
                continue
            if (
                maximum_variants is not None
                and generated_variant_count >= maximum_variants
            ):
                budget_exhausted = True
                break

            generated_variant_count += 1
            seen_first_edits.add(variant)
            first_edits.append(variant)
            if variant in global_membership:
                self._record_known_match(
                    term=normalized_term,
                    variant=variant,
                    max_distance=1,
                    lexicon=lexicon,
                    matched_distances=matched_distances,
                )

        if (
            not budget_exhausted
            and self.max_edit_distance == 2
            and len(matched_distances) < limit
        ):
            for first_edit in first_edits:
                if budget_exhausted:
                    break

                first_edit_length = len(first_edit)

                for index in range(first_edit_length):
                    if (
                        maximum_variants is not None
                        and generated_variant_count >= maximum_variants
                    ):
                        budget_exhausted = True
                        break
                    generated_variant_count += 1
                    variant = first_edit[:index] + first_edit[index + 1 :]
                    if variant == normalized_term:
                        continue

                    if variant in global_membership:
                        self._record_known_match(
                            term=normalized_term,
                            variant=variant,
                            max_distance=2,
                            lexicon=lexicon,
                            matched_distances=matched_distances,
                        )

                if budget_exhausted:
                    break

                for index in range(first_edit_length - 1):
                    if first_edit[index] == first_edit[index + 1]:
                        continue
                    if (
                        maximum_variants is not None
                        and generated_variant_count >= maximum_variants
                    ):
                        budget_exhausted = True
                        break
                    generated_variant_count += 1
                    variant = (
                        first_edit[:index]
                        + first_edit[index + 1]
                        + first_edit[index]
                        + first_edit[index + 2 :]
                    )
                    if variant == normalized_term:
                        continue

                    if variant in global_membership:
                        self._record_known_match(
                            term=normalized_term,
                            variant=variant,
                            max_distance=2,
                            lexicon=lexicon,
                            matched_distances=matched_distances,
                        )

                if budget_exhausted:
                    break

                for index, current_character in enumerate(first_edit):
                    prefix = first_edit[:index]
                    suffix = first_edit[index + 1 :]
                    for character in alphabet:
                        if character == current_character:
                            continue
                        if (
                            maximum_variants is not None
                            and generated_variant_count >= maximum_variants
                        ):
                            budget_exhausted = True
                            break
                        generated_variant_count += 1
                        variant = prefix + character + suffix
                        if variant == normalized_term:
                            continue

                        if variant in global_membership:
                            self._record_known_match(
                                term=normalized_term,
                                variant=variant,
                                max_distance=2,
                                lexicon=lexicon,
                                matched_distances=matched_distances,
                            )

                    if budget_exhausted:
                        break

                if budget_exhausted:
                    break

                for index in range(first_edit_length + 1):
                    prefix = first_edit[:index]
                    suffix = first_edit[index:]
                    for character in alphabet:
                        if (
                            maximum_variants is not None
                            and generated_variant_count >= maximum_variants
                        ):
                            budget_exhausted = True
                            break
                        generated_variant_count += 1
                        variant = prefix + character + suffix
                        if variant == normalized_term:
                            continue

                        if variant in global_membership:
                            self._record_known_match(
                                term=normalized_term,
                                variant=variant,
                                max_distance=2,
                                lexicon=lexicon,
                                matched_distances=matched_distances,
                            )

                    if budget_exhausted:
                        break

        candidates = [
            self._candidate_from_match(
                term=normalized_term,
                lemma=lemma,
                distance=distance,
                active_scope_codes=active_scope_codes,
                lexicon=lexicon,
            )
            for lemma, distance in matched_distances.items()
        ]
        candidates.sort(key=lambda candidate: candidate.rank_key)
        competition_complete = not budget_exhausted

        return SpellingCandidateResult(
            term=normalized_term,
            status="ready",
            input_is_known_word=input_is_known_word,
            global_competition_complete=competition_complete,
            candidates=tuple(candidates[:limit]),
            lexicon_version=lexicon.source_version,
        )

    @staticmethod
    def _record_known_match(
        *,
        term: str,
        variant: str,
        max_distance: int,
        lexicon: _PreparedLexicon,
        matched_distances: dict[str, int],
    ) -> None:
        canonical = lexicon.canonical(variant)
        if canonical in matched_distances:
            return

        distance = bounded_osa_distance(term, canonical, max_distance)
        if distance > max_distance or distance == 0:
            return

        matched_distances[canonical] = distance

    @staticmethod
    def _candidate_from_match(
        *,
        term: str,
        lemma: str,
        distance: int,
        active_scope_codes: frozenset[str],
        lexicon: _PreparedLexicon,
    ) -> SpellingCandidate:
        scope_codes = tuple(
            lexicon.direct_scope_codes_by_lemma.get(lemma, ()),
        )
        in_active_scope = bool(active_scope_codes & frozenset(scope_codes))
        reason_codes = [f"edit_distance_{distance}"]
        if distance == 1 and _is_adjacent_transposition(term, lemma):
            reason_codes.append("adjacent_transposition")
        reason_codes.append(
            "active_exam_scope"
            if in_active_scope
            else "global_competitor",
        )
        rank_key = (
            distance,
            0 if in_active_scope else 1,
            lemma,
        )
        return SpellingCandidate(
            lemma=lemma,
            edit_distance=distance,
            in_active_exam_scope=in_active_scope,
            scope_codes=scope_codes,
            source_kind=(
                "compact_wordbook"
                if scope_codes
                else "ecdict"
            ),
            reason_codes=tuple(reason_codes),
            rank_key=rank_key,
        )
