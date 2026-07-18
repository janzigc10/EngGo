import json
from types import SimpleNamespace

import pytest

import backend.app.retrieval.spelling_candidates as spelling_candidates_module
from backend.app.content.compact_exam_wordbook import (
    CompactExamWordbookInvalid,
    CompactExamWordbookLoader,
    CompactExamWordbookUnavailable,
)
from backend.app.retrieval.spelling_candidates import (
    MAX_SPELLING_TERM_LENGTH,
    EcdictSpellingCandidateProvider,
    SpellingLexicon,
    bounded_osa_distance,
)
from backend.app.retrieval.spelling_decision import SpellingDecisionPolicy


def compact_entries(*entries):
    return json.dumps(list(entries), ensure_ascii=False)


def compact_entry(lemma, scopes, **extra):
    return {
        "lemma": lemma,
        "examScopes": scopes,
        "meaningsZh": ["unused by spelling loader"],
        **extra,
    }


class FakeEcdictLookup:
    def __init__(self, profiles_by_key=None, error=None):
        self.profiles_by_key = profiles_by_key
        self.error = error
        self.load_calls = 0

    def load_index(self):
        self.load_calls += 1
        if self.error:
            raise self.error
        if self.profiles_by_key is None:
            return None
        return SimpleNamespace(profiles_by_key=self.profiles_by_key)


def profiles(*lemmas):
    return {
        lemma: SimpleNamespace(canonical=lemma)
        for lemma in lemmas
    }


def test_compact_wordbook_loader_keeps_only_lemma_scopes_and_caches_by_file_version(tmp_path):
    path = tmp_path / "entries.json"
    path.write_text(
        compact_entries(
            compact_entry("access", ["cet4"], aliases=["entry"]),
            compact_entry("access", ["gaokao", "cet4"]),
            compact_entry("assess", ["cet6"]),
        ),
        encoding="utf-8",
    )
    reads = []
    loader = CompactExamWordbookLoader(
        path=path,
        read_text=lambda source_path: (
            reads.append(source_path),
            source_path.read_text(encoding="utf-8"),
        )[1],
    )

    first = loader.load()
    second = loader.load()

    assert first is second
    assert reads == [path]
    assert first.direct_scope_codes_by_lemma == {
        "access": ("gaokao", "cet4"),
        "assess": ("cet6",),
    }
    assert first.source_version.startswith("compact-wordbook:")
    assert set(first.__dict__) == {
        "direct_scope_codes_by_lemma",
        "source_version",
    }

    path.write_text(
        compact_entries(
            compact_entry("access", ["cet4"]),
            compact_entry("assess", ["cet6"]),
            compact_entry("excess", ["postgrad"]),
        ),
        encoding="utf-8",
    )
    changed = loader.load()

    assert changed is not first
    assert len(reads) == 2
    assert changed.source_version != first.source_version
    assert changed.direct_scope_codes_by_lemma["excess"] == ("postgrad",)


def test_compact_wordbook_loader_distinguishes_unavailable_and_invalid_sources(tmp_path):
    with pytest.raises(CompactExamWordbookUnavailable, match="does not exist"):
        CompactExamWordbookLoader(path=tmp_path / "missing.json").load()

    invalid_json = tmp_path / "invalid.json"
    invalid_json.write_text("not-json", encoding="utf-8")
    with pytest.raises(CompactExamWordbookInvalid, match="not valid JSON"):
        CompactExamWordbookLoader(path=invalid_json).load()

    invalid_scope = tmp_path / "invalid-scope.json"
    invalid_scope.write_text(
        compact_entries(compact_entry("access", ["sat"])),
        encoding="utf-8",
    )
    with pytest.raises(CompactExamWordbookInvalid, match="unknown exam scopes"):
        CompactExamWordbookLoader(path=invalid_scope).load()


def test_provider_ranks_distance_before_scope_and_treats_transposition_as_one_edit():
    provider = EcdictSpellingCandidateProvider(
        lexicon=SpellingLexicon(
            global_lemmas=("access", "access", "across", "request"),
            direct_scope_codes_by_lemma={
                "across": ("cet4",),
                "request": ("cet4",),
            },
            source_version="fixture-v1",
        ),
    )

    result = provider.generate(
        term="acess",
        active_exam_target="cet4",
        limit=3,
    )

    assert result.status == "ready"
    assert result.global_competition_complete is True
    assert [candidate.lemma for candidate in result.candidates] == [
        "access",
        "across",
    ]
    assert [candidate.edit_distance for candidate in result.candidates] == [1, 2]
    assert result.candidates[0].in_active_exam_scope is False
    assert result.candidates[1].in_active_exam_scope is True
    assert "global_competitor" in result.candidates[0].reason_codes
    assert "active_exam_scope" in result.candidates[1].reason_codes

    transposition = provider.generate(
        term="reqeust",
        active_exam_target="cet4",
        limit=3,
    )
    assert [candidate.lemma for candidate in transposition.candidates] == ["request"]
    assert transposition.candidates[0].edit_distance == 1
    assert "adjacent_transposition" in transposition.candidates[0].reason_codes
    assert bounded_osa_distance("reqeust", "request", 2) == 1


def test_provider_uses_scope_closure_only_as_same_distance_tie_break():
    provider = EcdictSpellingCandidateProvider(
        lexicon=SpellingLexicon(
            global_lemmas=("able", "axle", "arle"),
            direct_scope_codes_by_lemma={
                "able": ("gaokao",),
                "axle": ("cet4",),
                "arle": ("postgrad",),
            },
            source_version="fixture-v1",
        ),
    )

    result = provider.generate(
        term="aale",
        active_exam_target="cet4",
        limit=3,
    )

    assert [(item.lemma, item.edit_distance) for item in result.candidates] == [
        ("able", 1),
        ("axle", 1),
        ("arle", 1),
    ]
    assert [item.in_active_exam_scope for item in result.candidates] == [
        True,
        True,
        False,
    ]
    assert result.candidates[2].source_kind == "compact_wordbook"
    assert "global_competitor" in result.candidates[2].reason_codes


def test_provider_marks_known_words_but_still_generates_ranked_neighbors():
    provider = EcdictSpellingCandidateProvider(
        lexicon=SpellingLexicon(
            global_lemmas=("form", "farm"),
            direct_scope_codes_by_lemma={"form": ("cet4",)},
            source_version="fixture-v1",
        ),
        max_edit_distance=1,
    )

    result = provider.generate(
        term=" Form ",
        active_exam_target="cet4",
    )

    assert result.term == "form"
    assert result.status == "ready"
    assert result.input_is_known_word is True
    assert result.global_competition_complete is True
    assert [candidate.lemma for candidate in result.candidates] == ["farm"]


def test_provider_rejects_overlong_term_before_loading_or_generating(tmp_path, monkeypatch):
    ecdict_lookup = FakeEcdictLookup(profiles("access"))
    provider = EcdictSpellingCandidateProvider(
        ecdict_lookup=ecdict_lookup,
        compact_wordbook_loader=CompactExamWordbookLoader(
            path=tmp_path / "must-not-load.json",
        ),
    )

    def fail_if_generated(term):
        raise AssertionError(f"overlong term reached candidate generation: {term}")

    monkeypatch.setattr(
        spelling_candidates_module,
        "_edit_variants_once",
        fail_if_generated,
    )

    overlong_term = "a" * (MAX_SPELLING_TERM_LENGTH + 1)
    result = provider.generate(
        term=overlong_term,
        active_exam_target="cet4",
    )

    assert result.term == overlong_term
    assert result.status == "unsupported_term"
    assert result.input_is_known_word is False
    assert result.global_competition_complete is True
    assert result.candidates == ()
    assert result.lexicon_version == "not_loaded"
    assert ecdict_lookup.load_calls == 0


def test_provider_requires_two_candidates_in_decision_facing_window():
    provider = EcdictSpellingCandidateProvider(
        lexicon=SpellingLexicon(
            global_lemmas=("form", "farm"),
            direct_scope_codes_by_lemma={"form": ("cet4",)},
            source_version="fixture-v1",
        ),
    )

    with pytest.raises(ValueError, match="at least 2"):
        provider.generate(
            term="frorm",
            active_exam_target="cet4",
            limit=1,
        )


def test_provider_result_keeps_known_word_protected_by_decision_policy():
    provider = EcdictSpellingCandidateProvider(
        lexicon=SpellingLexicon(
            global_lemmas=("form", "farm"),
            direct_scope_codes_by_lemma={
                "form": ("cet4",),
                "farm": ("cet4",),
            },
            source_version="fixture-v1",
        ),
        max_edit_distance=1,
    )

    result = provider.generate(term="form", active_exam_target="cet4")
    decision = SpellingDecisionPolicy().decide(term="form", result=result)

    assert result.input_is_known_word is True
    assert [candidate.lemma for candidate in result.candidates] == ["farm"]
    assert decision.kind == "no_reliable_candidate"
    assert decision.candidates == ()
    assert decision.reason_code == "valid_word"


def test_provider_does_not_let_scoped_distance_one_hide_global_distance_two():
    provider = EcdictSpellingCandidateProvider(
        lexicon=SpellingLexicon(
            global_lemmas=("cat", "bat"),
            direct_scope_codes_by_lemma={"cat": ("cet4",)},
            source_version="fixture-v1",
        ),
    )

    result = provider.generate(
        term="catt",
        active_exam_target="cet4",
        limit=3,
    )

    assert result.global_competition_complete is True
    assert [(candidate.lemma, candidate.edit_distance) for candidate in result.candidates] == [
        ("cat", 1),
        ("bat", 2),
    ]


def test_provider_reports_missing_error_and_budget_incomplete_without_auto_safe_evidence(tmp_path):
    missing_wordbook = EcdictSpellingCandidateProvider(
        ecdict_lookup=FakeEcdictLookup(profiles("access")),
        compact_wordbook_loader=CompactExamWordbookLoader(
            path=tmp_path / "missing.json",
        ),
    ).generate(term="acess", active_exam_target="cet4")
    assert missing_wordbook.status == "candidate_source_unavailable"
    assert missing_wordbook.global_competition_complete is False
    assert missing_wordbook.candidates == ()

    invalid_path = tmp_path / "invalid.json"
    invalid_path.write_text("{}", encoding="utf-8")
    invalid_wordbook = EcdictSpellingCandidateProvider(
        ecdict_lookup=FakeEcdictLookup(profiles("access")),
        compact_wordbook_loader=CompactExamWordbookLoader(path=invalid_path),
    ).generate(term="acess", active_exam_target="cet4")
    assert invalid_wordbook.status == "candidate_source_error"
    assert invalid_wordbook.global_competition_complete is False

    path = tmp_path / "entries.json"
    path.write_text(
        compact_entries(compact_entry("access", ["cet4"])),
        encoding="utf-8",
    )
    missing_ecdict = EcdictSpellingCandidateProvider(
        ecdict_lookup=FakeEcdictLookup(),
        compact_wordbook_loader=CompactExamWordbookLoader(path=path),
    ).generate(term="acess", active_exam_target="cet4")
    assert missing_ecdict.status == "candidate_source_unavailable"
    assert missing_ecdict.global_competition_complete is False

    broken_ecdict = EcdictSpellingCandidateProvider(
        ecdict_lookup=FakeEcdictLookup(error=RuntimeError("broken CSV")),
        compact_wordbook_loader=CompactExamWordbookLoader(path=path),
    ).generate(term="acess", active_exam_target="cet4")
    assert broken_ecdict.status == "candidate_source_error"
    assert broken_ecdict.global_competition_complete is False

    incomplete = EcdictSpellingCandidateProvider(
        lexicon=SpellingLexicon(
            global_lemmas=("access",),
            direct_scope_codes_by_lemma={"access": ("cet4",)},
            source_version="fixture-v1",
        ),
        max_generated_variants=1,
    ).generate(term="acess", active_exam_target="cet4")
    assert incomplete.status == "ready"
    assert incomplete.global_competition_complete is False


def test_provider_reuses_loaded_ecdict_mapping_and_does_not_full_scan_global_lemmas(tmp_path):
    class MembershipOnlyProfiles(dict):
        def __iter__(self):
            raise AssertionError("query-driven spelling search must not scan ECDICT")

    path = tmp_path / "entries.json"
    path.write_text(
        compact_entries(compact_entry("request", ["cet4"])),
        encoding="utf-8",
    )
    reads = []
    loader = CompactExamWordbookLoader(
        path=path,
        read_text=lambda source_path: (
            reads.append(source_path),
            source_path.read_text(encoding="utf-8"),
        )[1],
    )
    ecdict_lookup = FakeEcdictLookup(
        MembershipOnlyProfiles(profiles("request", "require", "frequent")),
    )
    provider = EcdictSpellingCandidateProvider(
        ecdict_lookup=ecdict_lookup,
        compact_wordbook_loader=loader,
    )

    first = provider.generate(
        term="reqeust",
        active_exam_target="cet4",
    )
    second = provider.generate(
        term="requre",
        active_exam_target="cet4",
    )

    assert [candidate.lemma for candidate in first.candidates] == ["request"]
    assert [candidate.lemma for candidate in second.candidates] == ["require"]
    assert ecdict_lookup.load_calls == 1
    assert reads == [path]
    assert first.lexicon_version == second.lexicon_version


def test_distance_two_search_matches_legacy_candidate_semantics():
    provider = EcdictSpellingCandidateProvider(
        lexicon=SpellingLexicon(
            global_lemmas={
                "abcd": SimpleNamespace(canonical="abcd"),
                "bcd": SimpleNamespace(canonical="bcd"),
                "bacd": SimpleNamespace(canonical="bacd"),
                "zbcd": SimpleNamespace(canonical="zbcd"),
                "aabcd": SimpleNamespace(canonical="aabcd"),
                "cd": SimpleNamespace(canonical="cd"),
                "abxy": SimpleNamespace(canonical="abdc"),
            },
            direct_scope_codes_by_lemma={"bcd": ("cet4",)},
            source_version="distance-two-parity-v1",
        ),
        max_generated_variants=None,
    )

    result = provider.generate(
        term="abcd",
        active_exam_target="cet4",
        limit=8,
    )

    assert result.input_is_known_word is True
    assert result.global_competition_complete is True
    assert [
        (candidate.lemma, candidate.edit_distance)
        for candidate in result.candidates
    ] == [
        ("bcd", 1),
        ("aabcd", 1),
        ("abdc", 1),
        ("bacd", 1),
        ("zbcd", 1),
        ("cd", 2),
    ]
    assert "abcd" not in {candidate.lemma for candidate in result.candidates}


def test_distance_two_search_preserves_legacy_order_and_budget_counting():
    class RecordingProfiles(dict):
        def __init__(self):
            super().__init__({"zzzzzzzz": SimpleNamespace(canonical="zzzzzzzz")})
            self.probes = []

        def __contains__(self, key):
            self.probes.append(key)
            return super().__contains__(key)

    term = "abcd"
    first_edits = list(dict.fromkeys(
        spelling_candidates_module._edit_variants_once(term),
    ))
    first_second_edits = list(
        spelling_candidates_module._edit_variants_once(first_edits[0]),
    )
    budget = len(first_edits) + len(first_second_edits)
    profiles_by_key = RecordingProfiles()
    provider = EcdictSpellingCandidateProvider(
        lexicon=SpellingLexicon(
            global_lemmas=profiles_by_key,
            direct_scope_codes_by_lemma={},
            source_version="distance-two-order-v1",
        ),
        max_generated_variants=budget,
    )

    result = provider.generate(
        term=term,
        active_exam_target="cet4",
        limit=2,
    )

    expected_probes = [
        term,
        *first_edits,
        *(
            variant
            for variant in first_second_edits
            if variant != term
        ),
    ]
    assert profiles_by_key.probes == expected_probes
    assert result.candidates == ()
    assert result.global_competition_complete is False

    boundary_lexicon = SpellingLexicon(
        global_lemmas={"cd": SimpleNamespace(canonical="cd")},
        direct_scope_codes_by_lemma={},
        source_version="distance-two-budget-v1",
    )
    before_first_distance_two_variant = EcdictSpellingCandidateProvider(
        lexicon=boundary_lexicon,
        max_generated_variants=len(first_edits),
    ).generate(term=term, active_exam_target="cet4", limit=2)
    including_first_distance_two_variant = EcdictSpellingCandidateProvider(
        lexicon=boundary_lexicon,
        max_generated_variants=len(first_edits) + 1,
    ).generate(term=term, active_exam_target="cet4", limit=2)

    assert before_first_distance_two_variant.candidates == ()
    assert before_first_distance_two_variant.global_competition_complete is False
    assert [
        candidate.lemma
        for candidate in including_first_distance_two_variant.candidates
    ] == ["cd"]
    assert including_first_distance_two_variant.global_competition_complete is False
