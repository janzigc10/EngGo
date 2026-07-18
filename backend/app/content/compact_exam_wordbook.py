import json
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class CompactExamWordbookUnavailable(RuntimeError):
    """Raised when the compact exam wordbook cannot be read."""


class CompactExamWordbookInvalid(RuntimeError):
    """Raised when the compact exam wordbook violates its data contract."""


scope_code_order = ("gaokao", "cet4", "cet6", "postgrad")
known_scope_codes = frozenset(scope_code_order)


@dataclass(frozen=True)
class CompactExamWordbook:
    direct_scope_codes_by_lemma: dict[str, tuple[str, ...]]
    source_version: str


def _normalize_lemma(value: Any) -> str:
    if not isinstance(value, str):
        return ""

    lemma = value.strip().lower()
    if len(lemma) < 3 or not lemma.isascii() or not lemma.isalpha():
        return ""

    return lemma


def _normalize_scope_codes(value: Any) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()

    raw_scope_codes = {
        item.strip().lower()
        for item in value
        if isinstance(item, str) and item.strip()
    }
    unknown_scope_codes = raw_scope_codes - known_scope_codes
    if unknown_scope_codes:
        unknown = ", ".join(sorted(unknown_scope_codes))
        raise CompactExamWordbookInvalid(
            f"compact wordbook contains unknown exam scopes: {unknown}",
        )

    return tuple(
        scope_code
        for scope_code in scope_code_order
        if scope_code in raw_scope_codes
    )


def parse_compact_exam_wordbook(
    raw: str,
    *,
    source_version: str,
) -> CompactExamWordbook:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise CompactExamWordbookInvalid(
            f"compact wordbook is not valid JSON: {error.msg}",
        ) from error

    if not isinstance(payload, list):
        raise CompactExamWordbookInvalid("compact wordbook root must be a JSON array")

    scopes_by_lemma: dict[str, set[str]] = {}
    for index, item in enumerate(payload):
        if not isinstance(item, dict):
            raise CompactExamWordbookInvalid(
                f"compact wordbook entry {index} must be an object",
            )

        lemma = _normalize_lemma(item.get("lemma"))
        if not lemma:
            raise CompactExamWordbookInvalid(
                f"compact wordbook entry {index} has an invalid lemma",
            )

        scope_codes = _normalize_scope_codes(item.get("examScopes"))
        if not scope_codes:
            raise CompactExamWordbookInvalid(
                f"compact wordbook entry {index} has no valid exam scope",
            )

        scopes_by_lemma.setdefault(lemma, set()).update(scope_codes)

    if not scopes_by_lemma:
        raise CompactExamWordbookInvalid("compact wordbook contains no usable entries")

    direct_scope_codes_by_lemma = {
        lemma: tuple(
            scope_code
            for scope_code in scope_code_order
            if scope_code in scope_codes
        )
        for lemma, scope_codes in sorted(scopes_by_lemma.items())
    }
    return CompactExamWordbook(
        direct_scope_codes_by_lemma=direct_scope_codes_by_lemma,
        source_version=source_version,
    )


class CompactExamWordbookLoader:
    def __init__(
        self,
        *,
        path: Path | str,
        read_text: Callable[[Path], str] | None = None,
    ):
        self.path = Path(path)
        self._read_text = read_text or (
            lambda source_path: source_path.read_text(encoding="utf-8")
        )
        self._cached_identity: tuple[str, int, int] | None = None
        self._cached_wordbook: CompactExamWordbook | None = None

    def load(self) -> CompactExamWordbook:
        try:
            stat = self.path.stat()
        except FileNotFoundError as error:
            raise CompactExamWordbookUnavailable(
                f"compact wordbook does not exist: {self.path}",
            ) from error
        except OSError as error:
            raise CompactExamWordbookUnavailable(
                f"compact wordbook is not readable: {self.path}",
            ) from error

        identity = (
            str(self.path.resolve()),
            stat.st_size,
            stat.st_mtime_ns,
        )
        if identity == self._cached_identity and self._cached_wordbook is not None:
            return self._cached_wordbook

        try:
            raw = self._read_text(self.path)
        except UnicodeError as error:
            raise CompactExamWordbookInvalid(
                f"compact wordbook is not valid UTF-8: {self.path}",
            ) from error
        except OSError as error:
            raise CompactExamWordbookUnavailable(
                f"compact wordbook is not readable: {self.path}",
            ) from error

        source_version = (
            f"compact-wordbook:{stat.st_size}:{stat.st_mtime_ns}"
        )
        wordbook = parse_compact_exam_wordbook(
            raw,
            source_version=source_version,
        )
        self._cached_identity = identity
        self._cached_wordbook = wordbook
        return wordbook
