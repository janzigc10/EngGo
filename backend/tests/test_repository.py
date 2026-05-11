import psycopg

from backend.app.retrieval.repository import (
    StructuredLookupRepository,
    to_psycopg_conninfo,
)


class FakeCursor:
    def __init__(self, row=None, rows=None):
        self.row = row
        self.rows = rows if rows is not None else []
        self.sql = None
        self.params = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, sql, params):
        self.sql = sql
        self.params = params

    def fetchone(self):
        return self.row

    def fetchall(self):
        return self.rows


class FakeConnection:
    def __init__(self, cursor):
        self.cursor_instance = cursor

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def cursor(self):
        return self.cursor_instance


def make_repository(row=None, rows=None):
    cursor = FakeCursor(row, rows)

    def connect(database_url, **_kwargs):
        assert database_url == "postgresql://example"
        return FakeConnection(cursor)

    return StructuredLookupRepository(
        database_url="postgresql://example",
        connect=connect,
    ), cursor


def test_exact_lookup_queries_lemma_and_alias_tables():
    repository, cursor = make_repository(None)

    assert repository.find_exact_entry("cet6", "access") is None

    assert "vocabulary_entry" in cursor.sql
    assert "vocabulary_alias" in cursor.sql
    assert "vocabulary_meaning" in cursor.sql
    assert "vocabulary_entry_scope" in cursor.sql
    assert cursor.params == {"lookup": "access", "active_scope": "cet6"}


def test_to_psycopg_conninfo_removes_prisma_only_query_params():
    conninfo = to_psycopg_conninfo(
        "postgresql://user:pass@localhost:5432/db?schema=public&connection_limit=1&pool_timeout=0&max_idle_connection_lifetime=20&sslmode=disable",
    )

    assert conninfo == "postgresql://user:pass@127.0.0.1:5432/db?sslmode=disable"


def test_exact_lookup_maps_structured_entry_candidate():
    repository, _cursor = make_repository(
        {
            "entry_id": "access",
            "lemma": "access",
            "part_of_speech": ["n.", "v."],
            "matched_alias": None,
            "meanings_zh": ["进入权", "使用权", "访问"],
            "scope_codes": ["cet4", "cet6"],
            "in_scope": True,
            "exact_lemma": True,
            "exact_alias": False,
        },
    )

    candidate = repository.find_exact_entry("cet6", "access")

    assert candidate is not None
    assert candidate.entry_id == "access"
    assert candidate.lemma == "access"
    assert candidate.part_of_speech == "n. / v."
    assert candidate.meanings_zh == ["进入权", "使用权", "访问"]
    assert candidate.matched_alias is None
    assert candidate.scope_codes == ["cet4", "cet6"]
    assert candidate.in_scope is True
    assert candidate.reason == "structured exact match"
    assert candidate.source_kind == "structured"


def test_exact_lookup_maps_alias_match():
    repository, _cursor = make_repository(
        {
            "entry_id": "access",
            "lemma": "access",
            "part_of_speech": ["n.", "v."],
            "matched_alias": "have access to",
            "meanings_zh": ["进入权", "使用权", "访问"],
            "scope_codes": ["cet4", "cet6"],
            "in_scope": True,
            "exact_lemma": False,
            "exact_alias": True,
        },
    )

    candidate = repository.find_exact_entry("cet6", "have access to")

    assert candidate is not None
    assert candidate.lemma == "access"
    assert candidate.matched_alias == "have access to"
    assert candidate.reason == "structured exact alias match"


def test_connection_retries_prisma_dev_protocol_blip_once():
    cursor = FakeCursor(
        {
            "entry_id": "access",
            "lemma": "access",
            "part_of_speech": ["n.", "v."],
            "matched_alias": None,
            "meanings_zh": ["进入权", "使用权", "访问"],
            "scope_codes": ["cet4", "cet6"],
            "in_scope": True,
            "exact_lemma": True,
            "exact_alias": False,
        },
    )
    calls = 0

    def connect(database_url, **_kwargs):
        nonlocal calls
        calls += 1
        assert database_url == "postgresql://example"

        if calls == 1:
            raise psycopg.OperationalError(
                'connection failed: expected authentication request from server, but received T',
            )

        return FakeConnection(cursor)

    repository = StructuredLookupRepository(
        database_url="postgresql://example",
        connect=connect,
    )

    candidate = repository.find_exact_entry("cet6", "access")

    assert calls == 2
    assert candidate is not None
    assert candidate.lemma == "access"


def test_confusion_group_lookup_maps_members_and_metadata():
    repository, cursor = make_repository(
        rows=[
            {
                "group_id": "access-assess-excess",
                "teach_first_entry_id": "access",
                "why_confusing": "same shape",
                "common_misuse_points": ["do not swap"],
                "semantic_boundary_notes": ["different meanings"],
                "labels": ["shape_like", "exam_high_value"],
                "purposes": ["confusion_untangle"],
                "anchor_pattern": "acc/ass/exc",
                "quick_distinction": "access entry, assess judge",
                "exam_hook": "pick by meaning",
                "entry_id": "access",
                "ordinal": 0,
                "emphasis_note": "entry right",
                "lemma": "access",
                "part_of_speech": ["n.", "v."],
                "meanings_zh": ["entry"],
                "scope_codes": ["cet4", "cet6"],
                "in_scope": True,
            },
            {
                "group_id": "access-assess-excess",
                "teach_first_entry_id": "access",
                "why_confusing": "same shape",
                "common_misuse_points": ["do not swap"],
                "semantic_boundary_notes": ["different meanings"],
                "labels": ["shape_like", "exam_high_value"],
                "purposes": ["confusion_untangle"],
                "anchor_pattern": "acc/ass/exc",
                "quick_distinction": "access entry, assess judge",
                "exam_hook": "pick by meaning",
                "entry_id": "assess",
                "ordinal": 1,
                "emphasis_note": "judge right",
                "lemma": "assess",
                "part_of_speech": ["v."],
                "meanings_zh": ["judge"],
                "scope_codes": ["cet6"],
                "in_scope": True,
            },
        ],
    )

    groups = repository.find_confusion_groups_for_entry_ids("cet6", ["access", "assess"])

    assert "confusion_group" in cursor.sql
    assert "confusion_group_member" in cursor.sql
    assert cursor.params == {
        "entry_ids": ["access", "assess"],
        "active_scope": "cet6",
    }
    assert len(groups) == 1
    assert groups[0].id == "access-assess-excess"
    assert groups[0].quick_distinction == "access entry, assess judge"
    assert [member.candidate.lemma for member in groups[0].members] == [
        "access",
        "assess",
    ]
    assert groups[0].members[0].candidate.part_of_speech == "n. / v."
    assert groups[0].members[1].emphasis_note == "judge right"
