from collections.abc import Callable
import time
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

import psycopg
from psycopg.rows import dict_row

from backend.app.retrieval.types import (
    ConfusionGroup,
    ConfusionGroupMember,
    RetrievalCandidate,
    normalize_part_of_speech_label,
)


def format_part_of_speech(parts: list[str] | tuple[str, ...] | None) -> str | None:
    if not parts:
        return None

    return normalize_part_of_speech_label(
        " / ".join(part.strip() for part in parts if part and part.strip()),
    )


def candidate_from_row(row, *, reason: str, score: int) -> RetrievalCandidate:
    return RetrievalCandidate(
        entry_id=row["entry_id"],
        lemma=row["lemma"],
        part_of_speech=format_part_of_speech(row.get("part_of_speech")),
        meanings_zh=list(row.get("meanings_zh") or []),
        matched_alias=row.get("matched_alias"),
        scope_codes=list(row.get("scope_codes") or []),
        in_scope=bool(row.get("in_scope")),
        reason=reason,
        score=score,
        source_kind="structured",
        exact_lemma=bool(row.get("exact_lemma")),
        exact_alias=bool(row.get("exact_alias")),
        text_score=float(row.get("text_score") or 0),
    )


def rank_candidate(active_exam_target: str, row) -> RetrievalCandidate:
    in_scope = bool(row.get("in_scope"))
    meaning_match = bool(row.get("meaning_match"))
    exact_lemma = bool(row.get("exact_lemma"))
    exact_alias = bool(row.get("exact_alias"))
    text_score = float(row.get("text_score") or 0)
    score = 300 if in_scope else 40
    reasons: list[str] = []

    if in_scope:
        reasons.append("当前考试范围命中")

    if meaning_match:
        score += 120
        reasons.append("中文释义命中")

    if exact_lemma:
        score += 120
        reasons.append("lemma 精确命中")

    if exact_alias:
        score += 95
        reasons.append("alias 精确命中")

    if text_score >= 0.55:
        reasons.append("英文片段高相似")
    elif text_score > 0:
        reasons.append("英文片段相似")

    score += round(text_score * 100)

    if not in_scope:
        score -= 80

    return candidate_from_row(
        row,
        reason="；".join(reasons) or "候选词条",
        score=score,
    )


def to_psycopg_conninfo(database_url: str) -> str:
    parsed = urlsplit(database_url)
    allowed_params = {
        "application_name",
        "connect_timeout",
        "sslcert",
        "sslkey",
        "sslmode",
        "sslrootcert",
        "target_session_attrs",
    }
    query = urlencode(
        [
            (key, value)
            for key, value in parse_qsl(parsed.query, keep_blank_values=True)
            if key in allowed_params
        ],
    )

    hostname = "127.0.0.1" if parsed.hostname == "localhost" else parsed.hostname
    netloc = parsed.netloc

    if hostname:
        auth = ""
        if parsed.username:
            auth = quote(parsed.username, safe="")
            if parsed.password is not None:
                auth = f"{auth}:{quote(parsed.password, safe='')}"
            auth = f"{auth}@"

        netloc = f"{auth}{hostname}"
        if parsed.port:
            netloc = f"{netloc}:{parsed.port}"

    return urlunsplit(
        (
            parsed.scheme,
            netloc,
            parsed.path,
            query,
            parsed.fragment,
        ),
    )


class StructuredLookupRepository:
    def __init__(
        self,
        *,
        database_url: str,
        connect: Callable[..., object] = psycopg.connect,
    ):
        self.database_url = to_psycopg_conninfo(database_url)
        self.connect = connect

    def _connect(self):
        for attempt in range(5):
            try:
                return self.connect(self.database_url, row_factory=dict_row)
            except psycopg.OperationalError as error:
                if attempt < 4:
                    time.sleep(0.05 * (attempt + 1))
                    continue

                raise

        raise RuntimeError("unreachable connection retry state")

    def find_exact_entry(
        self,
        active_exam_target: str,
        lookup: str,
    ) -> RetrievalCandidate | None:
        normalized_lookup = lookup.strip().lower()

        if not normalized_lookup:
            return None

        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    WITH matched_entry AS (
                        SELECT
                            ve.id AS entry_id,
                            ve.lemma,
                            ve.pos AS part_of_speech,
                            va.alias AS matched_alias,
                            LOWER(ve.lemma) = LOWER(%(lookup)s) AS exact_lemma,
                            va.alias IS NOT NULL AS exact_alias
                        FROM vocabulary_entry ve
                        LEFT JOIN vocabulary_alias va
                            ON va."entryId" = ve.id
                            AND LOWER(va.alias) = LOWER(%(lookup)s)
                        WHERE LOWER(ve.lemma) = LOWER(%(lookup)s)
                            OR va.alias IS NOT NULL
                        ORDER BY
                            CASE
                                WHEN LOWER(ve.lemma) = LOWER(%(lookup)s) THEN 0
                                ELSE 1
                            END,
                            ve.lemma ASC
                        LIMIT 1
                    )
                    SELECT
                        matched_entry.entry_id,
                        matched_entry.lemma,
                        matched_entry.part_of_speech,
                        matched_entry.matched_alias,
                        matched_entry.exact_lemma,
                        matched_entry.exact_alias,
                        COALESCE(
                            ARRAY_AGG(DISTINCT vm.zh) FILTER (WHERE vm.zh IS NOT NULL),
                            '{}'
                        ) AS meanings_zh,
                        COALESCE(
                            ARRAY_AGG(DISTINCT ves."scopeCode"::text)
                                FILTER (WHERE ves."scopeCode" IS NOT NULL),
                            '{}'
                        ) AS scope_codes,
                        BOOL_OR(ves."scopeCode"::text = %(active_scope)s) AS in_scope
                    FROM matched_entry
                    LEFT JOIN vocabulary_meaning vm
                        ON vm."entryId" = matched_entry.entry_id
                    LEFT JOIN vocabulary_entry_scope ves
                        ON ves."entryId" = matched_entry.entry_id
                    GROUP BY
                        matched_entry.entry_id,
                        matched_entry.lemma,
                        matched_entry.part_of_speech,
                        matched_entry.matched_alias,
                        matched_entry.exact_lemma,
                        matched_entry.exact_alias
                    """,
                    {
                        "lookup": normalized_lookup,
                        "active_scope": active_exam_target,
                    },
                )
                row = cursor.fetchone()

        if not row:
            return None

        exact_alias = bool(row.get("exact_alias"))
        reason = "structured exact alias match" if exact_alias else "structured exact match"

        return RetrievalCandidate(
            entry_id=row["entry_id"],
            lemma=row["lemma"],
            part_of_speech=format_part_of_speech(row.get("part_of_speech")),
            meanings_zh=list(row.get("meanings_zh") or []),
            matched_alias=row.get("matched_alias"),
            scope_codes=list(row.get("scope_codes") or []),
            in_scope=bool(row.get("in_scope")),
            reason=reason,
            score=100,
            source_kind="structured",
            exact_lemma=bool(row.get("exact_lemma")),
            exact_alias=bool(row.get("exact_alias")),
            text_score=1,
        )

    def find_confusion_groups_for_entry_ids(
        self,
        active_exam_target: str,
        entry_ids: list[str],
    ) -> list[ConfusionGroup]:
        if not entry_ids:
            return []

        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        cg.id AS group_id,
                        cg."teachFirstEntryId" AS teach_first_entry_id,
                        cg."whyConfusing" AS why_confusing,
                        cg."commonMisusePoints" AS common_misuse_points,
                        cg."semanticBoundaryNotes" AS semantic_boundary_notes,
                        cg.labels,
                        cg.purposes,
                        cg."anchorPattern" AS anchor_pattern,
                        cg."quickDistinction" AS quick_distinction,
                        cg."examHook" AS exam_hook,
                        cgm."entryId" AS entry_id,
                        cgm.ordinal,
                        cgm."emphasisNote" AS emphasis_note,
                        ve.lemma,
                        ve.pos AS part_of_speech,
                        COALESCE(
                            ARRAY_AGG(DISTINCT vm.zh) FILTER (WHERE vm.zh IS NOT NULL),
                            '{}'
                        ) AS meanings_zh,
                        COALESCE(
                            ARRAY_AGG(DISTINCT ves."scopeCode"::text)
                                FILTER (WHERE ves."scopeCode" IS NOT NULL),
                            '{}'
                        ) AS scope_codes,
                        BOOL_OR(ves."scopeCode"::text = %(active_scope)s) AS in_scope
                    FROM confusion_group cg
                    INNER JOIN confusion_group_member cgm
                        ON cgm."confusionGroupId" = cg.id
                    INNER JOIN vocabulary_entry ve
                        ON ve.id = cgm."entryId"
                    LEFT JOIN vocabulary_meaning vm
                        ON vm."entryId" = ve.id
                    LEFT JOIN vocabulary_entry_scope ves
                        ON ves."entryId" = ve.id
                    WHERE cg.id IN (
                        SELECT DISTINCT cgm2."confusionGroupId"
                        FROM confusion_group_member cgm2
                        WHERE cgm2."entryId" = ANY(%(entry_ids)s)
                    )
                    GROUP BY
                        cg.id,
                        cg."teachFirstEntryId",
                        cg."whyConfusing",
                        cg."commonMisusePoints",
                        cg."semanticBoundaryNotes",
                        cg.labels,
                        cg.purposes,
                        cg."anchorPattern",
                        cg."quickDistinction",
                        cg."examHook",
                        cgm."entryId",
                        cgm.ordinal,
                        cgm."emphasisNote",
                        ve.lemma,
                        ve.pos
                    ORDER BY
                        cg.id ASC,
                        cgm.ordinal ASC,
                        ve.lemma ASC
                    """,
                    {
                        "entry_ids": entry_ids,
                        "active_scope": active_exam_target,
                    },
                )
                rows = cursor.fetchall()

        groups_by_id: dict[str, ConfusionGroup] = {}
        members_by_group_id: dict[str, list[ConfusionGroupMember]] = {}

        for row in rows:
            group_id = row["group_id"]
            members_by_group_id.setdefault(group_id, []).append(
                ConfusionGroupMember(
                    candidate=RetrievalCandidate(
                        entry_id=row["entry_id"],
                        lemma=row["lemma"],
                        part_of_speech=format_part_of_speech(row.get("part_of_speech")),
                        meanings_zh=list(row.get("meanings_zh") or []),
                        matched_alias=None,
                        scope_codes=list(row.get("scope_codes") or []),
                        in_scope=bool(row.get("in_scope")),
                        reason="confusion group member",
                        score=80,
                        source_kind="structured",
                    ),
                    ordinal=int(row.get("ordinal") or 0),
                    emphasis_note=row.get("emphasis_note"),
                ),
            )

            if group_id not in groups_by_id:
                groups_by_id[group_id] = ConfusionGroup(
                    id=group_id,
                    teach_first_entry_id=row["teach_first_entry_id"],
                    why_confusing=row["why_confusing"],
                    common_misuse_points=list(row.get("common_misuse_points") or []),
                    semantic_boundary_notes=list(
                        row.get("semantic_boundary_notes") or [],
                    ),
                    labels=list(row.get("labels") or []),
                    purposes=list(row.get("purposes") or []),
                    anchor_pattern=row.get("anchor_pattern"),
                    quick_distinction=row.get("quick_distinction"),
                    exam_hook=row.get("exam_hook"),
                    members=[],
                )

        return [
            ConfusionGroup(
                id=group.id,
                teach_first_entry_id=group.teach_first_entry_id,
                why_confusing=group.why_confusing,
                common_misuse_points=group.common_misuse_points,
                semantic_boundary_notes=group.semantic_boundary_notes,
                labels=group.labels,
                purposes=group.purposes,
                anchor_pattern=group.anchor_pattern,
                quick_distinction=group.quick_distinction,
                exam_hook=group.exam_hook,
                members=members_by_group_id[group.id],
            )
            for group in groups_by_id.values()
        ]

    def find_english_candidates(
        self,
        active_exam_target: str,
        needle: str,
        *,
        limit: int = 8,
    ) -> list[RetrievalCandidate]:
        normalized_needle = needle.strip().lower()

        if not normalized_needle:
            return []

        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    WITH candidate AS (
                        SELECT
                            ve.id AS entry_id,
                            ve.lemma,
                            ve.pos AS part_of_speech,
                            best_alias.alias AS matched_alias,
                            LOWER(ve.lemma) = LOWER(%(needle)s) AS exact_lemma,
                            COALESCE(best_alias.exact_alias, false) AS exact_alias,
                            GREATEST(
                                similarity(ve.lemma, %(needle)s),
                                word_similarity(%(needle)s, ve.lemma),
                                COALESCE(best_alias.alias_similarity, 0),
                                COALESCE(best_alias.alias_word_similarity, 0)
                            ) AS text_score
                        FROM vocabulary_entry ve
                        LEFT JOIN LATERAL (
                            SELECT
                                va.alias,
                                LOWER(va.alias) = LOWER(%(needle)s) AS exact_alias,
                                similarity(va.alias, %(needle)s) AS alias_similarity,
                                word_similarity(%(needle)s, va.alias) AS alias_word_similarity
                            FROM vocabulary_alias va
                            WHERE va."entryId" = ve.id
                            ORDER BY
                                (LOWER(va.alias) = LOWER(%(needle)s)) DESC,
                                GREATEST(
                                    similarity(va.alias, %(needle)s),
                                    word_similarity(%(needle)s, va.alias)
                                ) DESC
                            LIMIT 1
                        ) AS best_alias ON TRUE
                        WHERE
                            LOWER(ve.lemma) = LOWER(%(needle)s)
                            OR ve.lemma ILIKE %(like_pattern)s
                            OR ve.lemma %% %(needle)s
                            OR GREATEST(
                                similarity(ve.lemma, %(needle)s),
                                word_similarity(%(needle)s, ve.lemma)
                            ) >= 0.45
                            OR COALESCE(LOWER(best_alias.alias) = LOWER(%(needle)s), false)
                            OR COALESCE(best_alias.alias ILIKE %(like_pattern)s, false)
                            OR COALESCE(best_alias.alias %% %(needle)s, false)
                            OR COALESCE(best_alias.alias_word_similarity, 0) >= 0.45
                    )
                    SELECT
                        candidate.entry_id,
                        candidate.lemma,
                        candidate.part_of_speech,
                        candidate.matched_alias,
                        candidate.exact_lemma,
                        candidate.exact_alias,
                        candidate.text_score,
                        false AS meaning_match,
                        COALESCE(
                            ARRAY_AGG(DISTINCT vm.zh) FILTER (WHERE vm.zh IS NOT NULL),
                            '{}'
                        ) AS meanings_zh,
                        COALESCE(
                            ARRAY_AGG(DISTINCT ves."scopeCode"::text)
                                FILTER (WHERE ves."scopeCode" IS NOT NULL),
                            '{}'
                        ) AS scope_codes,
                        BOOL_OR(ves."scopeCode"::text = %(active_scope)s) AS in_scope
                    FROM candidate
                    LEFT JOIN vocabulary_meaning vm
                        ON vm."entryId" = candidate.entry_id
                    LEFT JOIN vocabulary_entry_scope ves
                        ON ves."entryId" = candidate.entry_id
                    GROUP BY
                        candidate.entry_id,
                        candidate.lemma,
                        candidate.part_of_speech,
                        candidate.matched_alias,
                        candidate.exact_lemma,
                        candidate.exact_alias,
                        candidate.text_score
                    ORDER BY
                        candidate.exact_lemma DESC,
                        candidate.exact_alias DESC,
                        BOOL_OR(ves."scopeCode"::text = %(active_scope)s) DESC,
                        candidate.text_score DESC,
                        candidate.lemma ASC
                    LIMIT %(limit)s
                    """,
                    {
                        "needle": normalized_needle,
                        "like_pattern": f"%{normalized_needle}%",
                        "active_scope": active_exam_target,
                        "limit": limit,
                    },
                )
                rows = cursor.fetchall()

        return [
            rank_candidate(active_exam_target, row)
            for row in rows
        ]

    def find_meaning_candidates(
        self,
        active_exam_target: str,
        meaning_keyword: str,
        *,
        limit: int = 8,
    ) -> list[RetrievalCandidate]:
        keyword = meaning_keyword.strip()

        if not keyword:
            return []

        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    WITH matched_entry AS (
                        SELECT
                            vm."entryId" AS entry_id,
                            MIN(
                                CASE
                                    WHEN vm.zh = %(keyword)s THEN 0
                                    WHEN vm.zh LIKE %(prefix_pattern)s THEN 1
                                    ELSE 2
                                END
                            ) AS meaning_rank,
                            MIN(LENGTH(vm.zh)) AS meaning_length
                        FROM vocabulary_meaning vm
                        WHERE vm.zh ILIKE %(like_pattern)s
                        GROUP BY vm."entryId"
                        ORDER BY
                            meaning_rank ASC,
                            meaning_length ASC,
                            vm."entryId" ASC
                        LIMIT %(limit)s
                    )
                    SELECT
                        ve.id AS entry_id,
                        ve.lemma,
                        ve.pos AS part_of_speech,
                        NULL AS matched_alias,
                        false AS exact_lemma,
                        false AS exact_alias,
                        0 AS text_score,
                        true AS meaning_match,
                        COALESCE(
                            ARRAY_AGG(DISTINCT vm.zh) FILTER (WHERE vm.zh IS NOT NULL),
                            '{}'
                        ) AS meanings_zh,
                        COALESCE(
                            ARRAY_AGG(DISTINCT ves."scopeCode"::text)
                                FILTER (WHERE ves."scopeCode" IS NOT NULL),
                            '{}'
                        ) AS scope_codes,
                        BOOL_OR(ves."scopeCode"::text = %(active_scope)s) AS in_scope
                    FROM matched_entry
                    INNER JOIN vocabulary_entry ve
                        ON ve.id = matched_entry.entry_id
                    LEFT JOIN vocabulary_meaning vm
                        ON vm."entryId" = ve.id
                    LEFT JOIN vocabulary_entry_scope ves
                        ON ves."entryId" = ve.id
                    GROUP BY ve.id, ve.lemma, ve.pos, matched_entry.meaning_rank, matched_entry.meaning_length
                    ORDER BY
                        matched_entry.meaning_rank ASC,
                        matched_entry.meaning_length ASC,
                        ve.lemma ASC
                    """,
                    {
                        "keyword": keyword,
                        "prefix_pattern": f"{keyword}%",
                        "like_pattern": f"%{keyword}%",
                        "active_scope": active_exam_target,
                        "limit": limit,
                    },
                )
                rows = cursor.fetchall()

        return [
            rank_candidate(active_exam_target, row)
            for row in rows
        ]

    def find_in_scope_lookalike_candidates(
        self,
        active_exam_target: str,
        needle: str,
        *,
        limit: int = 8,
    ) -> list[RetrievalCandidate]:
        normalized_needle = needle.strip().lower()

        if not normalized_needle:
            return []

        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    WITH candidate AS (
                        SELECT
                            ve.id AS entry_id,
                            ve.lemma,
                            ve.pos AS part_of_speech,
                            LOWER(ve.lemma) = LOWER(%(needle)s) AS exact_lemma,
                            GREATEST(
                                similarity(ve.lemma, %(needle)s),
                                word_similarity(%(needle)s, ve.lemma)
                            ) AS text_score
                        FROM vocabulary_entry ve
                        INNER JOIN vocabulary_entry_scope ves
                            ON ves."entryId" = ve.id
                            AND ves."scopeCode"::text = %(active_scope)s
                        WHERE
                            LOWER(ve.lemma) = LOWER(%(needle)s)
                            OR GREATEST(
                                similarity(ve.lemma, %(needle)s),
                                word_similarity(%(needle)s, ve.lemma)
                            ) >= 0.45
                        ORDER BY
                            exact_lemma DESC,
                            text_score DESC,
                            LENGTH(ve.lemma) ASC,
                            ve.lemma ASC
                        LIMIT %(limit)s
                    )
                    SELECT
                        candidate.entry_id,
                        candidate.lemma,
                        candidate.part_of_speech,
                        NULL AS matched_alias,
                        candidate.exact_lemma,
                        false AS exact_alias,
                        candidate.text_score,
                        false AS meaning_match,
                        COALESCE(
                            ARRAY_AGG(DISTINCT vm.zh) FILTER (WHERE vm.zh IS NOT NULL),
                            '{}'
                        ) AS meanings_zh,
                        COALESCE(
                            ARRAY_AGG(DISTINCT ves."scopeCode"::text)
                                FILTER (WHERE ves."scopeCode" IS NOT NULL),
                            '{}'
                        ) AS scope_codes,
                        true AS in_scope
                    FROM candidate
                    LEFT JOIN vocabulary_meaning vm
                        ON vm."entryId" = candidate.entry_id
                    LEFT JOIN vocabulary_entry_scope ves
                        ON ves."entryId" = candidate.entry_id
                    GROUP BY
                        candidate.entry_id,
                        candidate.lemma,
                        candidate.part_of_speech,
                        candidate.exact_lemma,
                        candidate.text_score
                    ORDER BY
                        candidate.exact_lemma DESC,
                        candidate.text_score DESC,
                        LENGTH(candidate.lemma) ASC,
                        candidate.lemma ASC
                    """,
                    {
                        "needle": normalized_needle,
                        "active_scope": active_exam_target,
                        "limit": limit,
                    },
                )
                rows = cursor.fetchall()

        return [
            rank_candidate(active_exam_target, row)
            for row in rows
            if row.get("meanings_zh")
        ]

    def find_entries_by_lemmas(
        self,
        active_exam_target: str,
        lemmas: list[str],
    ) -> list[RetrievalCandidate]:
        normalized_lemmas = [lemma.lower() for lemma in lemmas]

        if not normalized_lemmas:
            return []

        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        ve.id AS entry_id,
                        ve.lemma,
                        ve.pos AS part_of_speech,
                        NULL AS matched_alias,
                        LOWER(ve.lemma) = ANY(%(lemmas)s) AS exact_lemma,
                        false AS exact_alias,
                        1 AS text_score,
                        false AS meaning_match,
                        COALESCE(
                            ARRAY_AGG(DISTINCT vm.zh) FILTER (WHERE vm.zh IS NOT NULL),
                            '{}'
                        ) AS meanings_zh,
                        COALESCE(
                            ARRAY_AGG(DISTINCT ves."scopeCode"::text)
                                FILTER (WHERE ves."scopeCode" IS NOT NULL),
                            '{}'
                        ) AS scope_codes,
                        BOOL_OR(ves."scopeCode"::text = %(active_scope)s) AS in_scope
                    FROM vocabulary_entry ve
                    LEFT JOIN vocabulary_meaning vm
                        ON vm."entryId" = ve.id
                    LEFT JOIN vocabulary_entry_scope ves
                        ON ves."entryId" = ve.id
                    WHERE LOWER(ve.lemma) = ANY(%(lemmas)s)
                    GROUP BY ve.id, ve.lemma, ve.pos
                    ORDER BY ve.lemma ASC
                    """,
                    {
                        "lemmas": normalized_lemmas,
                        "active_scope": active_exam_target,
                    },
                )
                rows = cursor.fetchall()

        return [
            rank_candidate(active_exam_target, row)
            for row in rows
        ]

    def find_in_scope_entries(
        self,
        active_exam_target: str,
    ) -> list[RetrievalCandidate]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        ve.id AS entry_id,
                        ve.lemma,
                        ve.pos AS part_of_speech,
                        NULL AS matched_alias,
                        false AS exact_lemma,
                        false AS exact_alias,
                        0 AS text_score,
                        false AS meaning_match,
                        COALESCE(
                            ARRAY_AGG(DISTINCT vm.zh) FILTER (WHERE vm.zh IS NOT NULL),
                            '{}'
                        ) AS meanings_zh,
                        COALESCE(
                            ARRAY_AGG(DISTINCT ves_all."scopeCode"::text)
                                FILTER (WHERE ves_all."scopeCode" IS NOT NULL),
                            '{}'
                        ) AS scope_codes,
                        true AS in_scope
                    FROM vocabulary_entry ve
                    INNER JOIN vocabulary_entry_scope ves
                        ON ves."entryId" = ve.id
                        AND ves."scopeCode"::text = %(active_scope)s
                    LEFT JOIN vocabulary_meaning vm
                        ON vm."entryId" = ve.id
                    LEFT JOIN vocabulary_entry_scope ves_all
                        ON ves_all."entryId" = ve.id
                    GROUP BY ve.id, ve.lemma, ve.pos
                    ORDER BY ve.lemma ASC
                    """,
                    {
                        "active_scope": active_exam_target,
                    },
                )
                rows = cursor.fetchall()

        return [
            rank_candidate(active_exam_target, row)
            for row in rows
        ]
