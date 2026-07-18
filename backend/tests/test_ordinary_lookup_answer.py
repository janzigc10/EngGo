from pathlib import Path

import pytest

from backend.app.answering.ordinary_lookup import (
    OrdinaryLookupService,
    UnsupportedQueryMode,
)
from backend.app.answering.provider import GenerateAnswerResult
from backend.app.content.ecdict import EcdictBasicProfile
from backend.app.retrieval.spelling_candidates import (
    SpellingCandidate,
    SpellingCandidateResult,
)
from backend.app.retrieval.spelling_decision import SpellingDecisionPolicy
from backend.app.retrieval.repository import StructuredLookupUnavailable
from backend.app.retrieval.types import RetrievalCandidate


class FakeRepository:
    def __init__(self, candidates, fuzzy_candidates=None, exact_error=None, fuzzy_error=None):
        self.candidates = candidates
        self.fuzzy_candidates = fuzzy_candidates or []
        self.exact_error = exact_error
        self.fuzzy_error = fuzzy_error
        self.lookups = []
        self.fuzzy_lookups = []

    def find_exact_entry(self, active_exam_target, lookup):
        self.lookups.append((active_exam_target, lookup))
        if self.exact_error:
            raise self.exact_error
        return self.candidates.get(lookup)

    def find_english_candidates(self, active_exam_target, needle):
        self.fuzzy_lookups.append((active_exam_target, needle))
        if self.fuzzy_error:
            raise self.fuzzy_error
        return self.fuzzy_candidates


class FakeProvider:
    def __init__(self, answer="plain answer"):
        self.answer = answer
        self.calls = []

    def generate_answer(self, **kwargs):
        self.calls.append(kwargs)
        return GenerateAnswerResult(
            answer=self.answer,
            provider_request_id="provider_req_plain",
        )


class FakeSpellingCandidateProvider:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def generate(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def spelling_candidate(
    lemma: str,
    *,
    distance: int = 1,
    in_scope: bool = True,
) -> SpellingCandidate:
    return SpellingCandidate(
        lemma=lemma,
        edit_distance=distance,
        in_active_exam_scope=in_scope,
        scope_codes=("cet4",) if in_scope else (),
        source_kind="compact_wordbook" if in_scope else "ecdict",
        reason_codes=(
            f"edit_distance_{distance}",
            "active_exam_scope" if in_scope else "global_competitor",
        ),
        rank_key=(distance, 0 if in_scope else 1, lemma),
    )


def spelling_result(
    term: str,
    candidates: tuple[SpellingCandidate, ...],
    *,
    status: str = "ready",
    complete: bool = True,
) -> SpellingCandidateResult:
    return SpellingCandidateResult(
        term=term,
        status=status,
        input_is_known_word=False,
        global_competition_complete=complete,
        candidates=candidates,
        lexicon_version="fixture-v1",
    )


def assert_spelling_trace_latencies(diagnostics: dict[str, object]) -> None:
    latency_ms = diagnostics["latencyMs"]
    assert isinstance(latency_ms, dict)
    assert set(latency_ms) == {"candidateGeneration", "decision"}
    assert all(
        isinstance(value, float) and value >= 0.0
        for value in latency_ms.values()
    )


def source_fixture(base_dir: Path):
    source_dir = base_dir / "source-lemmas"
    source_dir.mkdir(parents=True)
    (source_dir / "gaokao-2020-lemmas.txt").write_text("accent\n", encoding="utf-8")
    (source_dir / "cet-2016-lemmas.tsv").write_text(
        "lemma\tsourceScope\naccent\tcet4\naccordingto\tcet4\n",
        encoding="utf-8",
    )


def profile(
    canonical,
    meanings,
    *,
    entry_kind="word",
    lookup_key=None,
    match_kind="exact",
    tag="cet4",
):
    return EcdictBasicProfile(
        canonical=canonical,
        lookup_key=lookup_key or canonical,
        entry_kind=entry_kind,
        match_kind=match_kind,
        meanings=meanings,
        raw_translation="\n".join(meanings),
        tag=tag,
    )


def test_structured_exact_lookup_returns_compact_block_without_provider(tmp_path):
    service = OrdinaryLookupService(
        repository=FakeRepository(
            {
                "access": RetrievalCandidate(
                    entry_id="access",
                    lemma="access",
                    part_of_speech="n. / v.",
                    meanings_zh=["进入权", "使用权", "访问"],
                    matched_alias=None,
                    scope_codes=["cet4", "cet6"],
                    in_scope=True,
                    reason="structured exact match",
                    score=100,
                    source_kind="structured",
                ),
            },
        ),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda _query: None,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="access 是什么意思",
        request_id="req_access",
    )

    assert result.status_code == 200
    assert result.payload.answer == "access\n\nn./v. 进入权；使用权；访问"
    assert result.payload.answerKind == "grounded"
    assert result.payload.providerRequestId is None
    assert result.payload.grounding["matchType"] == "exact"
    assert result.payload.grounding["mainAnswer"][0]["lemma"] == "access"


def test_source_lemma_lookup_uses_ecdict_before_provider(tmp_path):
    source_fixture(tmp_path)
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda query: profile("accent", ["n. 口音；重音"])
        if query == "accent"
        else None,
    )

    result = service.answer(
        active_exam_target="cet4",
        query="accent",
        request_id="req_accent",
    )

    assert result.status_code == 200
    assert result.payload.answer == "accent\n\nn. 口音；重音"
    assert result.payload.providerRequestId is None
    assert result.payload.grounding["matchType"] == "source_lemma_exact"
    assert result.payload.grounding["mainAnswer"][0]["sourceKind"] == "source_lemma"


def test_exact_phrase_no_match_uses_ecdict_phrase_fallback(tmp_path):
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda query: profile(
            "make up",
            ["v. 组成；编造；化妆；和解"],
            entry_kind="phrase",
        )
        if query == "make up"
        else None,
    )

    result = service.answer(
        active_exam_target="cet4",
        query="make up",
        request_id="req_make_up",
    )

    assert result.status_code == 200
    assert result.payload.answer == "make up\n\nv. 组成；编造；化妆；和解"
    assert result.payload.providerRequestId is None
    assert result.payload.grounding["matchType"] == "external_dictionary_exact"
    assert result.payload.grounding["mainAnswer"][0]["sourceKind"] == (
        "external_dictionary_basic"
    )
    assert result.payload.answerSurface["type"] == "phrase_lookup"
    assert result.payload.answerSurface["title"] == "make up"
    assert result.payload.answerSurface["items"][0]["meaningZh"] == (
        "v. 组成；编造；化妆；和解"
    )


def test_phrase_lookup_with_chinese_suffix_uses_ecdict_phrase_fallback(tmp_path):
    provider = FakeProvider("provider should not answer phrase")
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda query: profile(
            "make up",
            ["v. 组成；编造；化妆；和解"],
            entry_kind="phrase",
        )
        if query == "make up"
        else None,
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet4",
        query="make up 是什么意思",
        request_id="req_make_up_suffix",
    )

    assert result.status_code == 200
    assert result.payload.answer == "make up\n\nv. 组成；编造；化妆；和解"
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert result.payload.grounding["matchType"] == "external_dictionary_exact"
    assert result.payload.grounding["queryMode"] == "direct_lookup"
    assert result.payload.grounding["mainAnswer"][0]["lemma"] == "make up"
    assert result.payload.answerSurface["type"] == "phrase_lookup"
    assert result.payload.answerSurface["title"] == "make up"


def test_postgrad_single_word_meaning_lookup_uses_ecdict_exact_fallback(tmp_path):
    provider = FakeProvider("provider should not answer postgrad exact lookup")
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda query: profile(
            "commit",
            ["v. 承诺；投入；犯下"],
            entry_kind="word",
            tag="ky",
        )
        if query == "commit"
        else None,
        provider=provider,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="commit 是什么意思",
        request_id="req_postgrad_commit_ecdict",
    )

    assert result.status_code == 200
    assert result.payload.answer == "commit\n\nv. 承诺；投入；犯下"
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert result.payload.grounding["matchType"] == "external_dictionary_exact"
    assert result.payload.grounding["queryMode"] == "fuzzy_recall"
    assert result.payload.grounding["mainAnswer"][0]["sourceKind"] == (
        "external_dictionary_basic"
    )
    assert result.payload.grounding["mainAnswer"][0]["scopeCodes"] == ["postgrad"]
    assert "spellingDecision" not in result.payload.grounding
    assert "candidates" not in result.payload.grounding


def test_ordinary_lookup_keeps_global_ecdict_fallback_for_non_scope_tags(tmp_path):
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path / "missing-source-lemmas",
        ecdict_lookup=lambda lookup: profile(
            "viaduct",
            ["n. 高架桥；高架铁路"],
            tag="gre",
        )
        if lookup == "viaduct"
        else None,
    )

    result = service.answer(
        active_exam_target="gaokao",
        query="viaduct 是什么意思",
        request_id="req_viaduct_global_lookup",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert grounding["matchType"] == "external_dictionary_exact"
    assert grounding["mainAnswer"][0]["lemma"] == "viaduct"
    assert grounding["mainAnswer"][0]["scopeCodes"] == []


def test_postgrad_ecdict_lookup_survives_structured_exact_unavailable(tmp_path):
    service = OrdinaryLookupService(
        repository=FakeRepository(
            {},
            exact_error=StructuredLookupUnavailable("connection timeout expired"),
        ),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda query: profile(
            "substitute",
            ["v. 代替；替换；n. 替代者"],
            entry_kind="word",
            tag="ky",
        )
        if query == "substitute"
        else None,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="substitute 是什么意思",
        request_id="req_postgrad_substitute_no_db",
    )

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert result.payload.grounding["matchType"] == "external_dictionary_exact"
    assert result.payload.grounding["mainAnswer"][0]["lemma"] == "substitute"
    assert result.payload.grounding["mainAnswer"][0]["sourceKind"] == (
        "external_dictionary_basic"
    )
    assert result.payload.grounding["mainAnswer"][0]["scopeCodes"] == ["postgrad"]


def test_postgrad_usage_lookup_does_not_touch_structured_fuzzy_when_db_unavailable(tmp_path):
    repository = FakeRepository(
        {},
        exact_error=StructuredLookupUnavailable("connection timeout expired"),
        fuzzy_error=StructuredLookupUnavailable("connection timeout expired"),
    )
    service = OrdinaryLookupService(
        repository=repository,
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda query: profile(
            "substitute",
            ["v. 代替；替换；n. 替代者"],
            entry_kind="word",
            tag="ky",
        )
        if query == "substitute"
        else None,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="substitute 怎么用",
        request_id="req_postgrad_substitute_usage_no_db",
    )

    assert result.status_code == 200
    assert result.payload.providerRequestId is None
    assert result.payload.grounding["matchType"] == "external_dictionary_exact"
    assert result.payload.grounding["mainAnswer"][0]["lemma"] == "substitute"
    assert repository.fuzzy_lookups == []


def test_out_of_scope_structured_exact_yields_to_ecdict_current_tag(tmp_path):
    out_of_scope_structured = RetrievalCandidate(
        entry_id="structured-commit",
        lemma="commit",
        part_of_speech="v.",
        meanings_zh=["犯下"],
        matched_alias=None,
        scope_codes=["cet4", "cet6"],
        in_scope=False,
        reason="structured exact match",
        score=100,
        source_kind="structured",
        exact_lemma=True,
        text_score=1,
    )
    service = OrdinaryLookupService(
        repository=FakeRepository({"commit": out_of_scope_structured}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda query: profile(
            "commit",
            ["v. 承诺；投入；犯下"],
            entry_kind="word",
            tag="ky",
        )
        if query == "commit"
        else None,
    )

    result = service.answer(
        active_exam_target="postgrad",
        query="commit 是什么意思",
        request_id="req_postgrad_commit_out_of_scope",
    )

    assert result.status_code == 200
    assert result.payload.grounding["matchType"] == "external_dictionary_exact"
    assert result.payload.grounding["mainAnswer"][0]["sourceKind"] == (
        "external_dictionary_basic"
    )
    assert result.payload.grounding["mainAnswer"][0]["scopeCodes"] == ["postgrad"]


def test_source_phrase_lookup_with_chinese_suffix_uses_source_lemma(tmp_path):
    source_fixture(tmp_path)
    provider = FakeProvider("provider should not answer source phrase")
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda query: profile(
            "according to",
            ["prep. 根据；按照"],
            entry_kind="phrase",
        )
        if query == "according to"
        else None,
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet4",
        query="according to 是什么意思",
        request_id="req_according_to_suffix",
    )

    assert result.status_code == 200
    assert result.payload.answer == "according to\n\nprep. 根据；按照"
    assert result.payload.providerRequestId is None
    assert provider.calls == []
    assert result.payload.grounding["matchType"] == "source_lemma_exact"
    assert result.payload.grounding["queryMode"] == "direct_lookup"
    assert result.payload.grounding["mainAnswer"][0]["lemma"] == "accordingto"
    assert result.payload.answerSurface["type"] == "phrase_lookup"
    assert result.payload.answerSurface["title"] == "according to"
    assert result.payload.answerSurface["items"][0]["meaningZh"] == "prep. 根据；按照"


def test_ordinary_no_match_returns_grounded_no_match_without_provider(tmp_path):
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda _query: None,
    )

    result = service.answer(
        active_exam_target="cet4",
        query="zzzzword",
        request_id="req_no_match",
    )

    assert result.status_code == 200
    assert "暂未稳定定位" in result.payload.answer
    assert result.payload.answerKind == "grounded"
    assert result.payload.providerRequestId is None
    assert result.payload.grounding["resolution"] == "no_match"
    assert result.payload.grounding["mainAnswer"] == []


def test_ordinary_no_match_clear_learning_question_uses_plain_provider(tmp_path):
    provider = FakeProvider("complex means complicated")
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda _query: None,
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet4",
        query="complex 是什么意思",
        request_id="req_plain",
        history=[{"role": "user", "content": "previous"}],
    )

    assert result.status_code == 200
    assert result.payload.answer == "complex means complicated"
    assert result.payload.answerKind == "plain"
    assert result.payload.grounding is None
    assert result.payload.providerRequestId == "provider_req_plain"
    assert provider.calls[0]["query"] == "complex 是什么意思"
    assert provider.calls[0]["history"] == [{"role": "user", "content": "previous"}]
    assert provider.calls[0].get("grounding") is None
    assert "通用英语学习问题" in provider.calls[0]["system_prompt"]


def test_ordinary_no_match_suspicious_typo_uses_spelling_assist(tmp_path):
    provider = FakeProvider("maybe request")
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda _query: None,
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet4",
        query="reqxust 是什么意思",
        request_id="req_spelling",
    )

    assert result.payload.answer == "maybe request"
    assert result.payload.answerKind == "plain"
    assert result.payload.grounding is None
    assert result.payload.providerRequestId == "provider_req_plain"
    assert "拼写候选" in provider.calls[0]["system_prompt"]


def test_ordinary_no_match_random_blob_does_not_call_provider(tmp_path):
    provider = FakeProvider("maybe squeeze")
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda _query: None,
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet4",
        query="zzqvwm 是什么意思",
        request_id="req_random_blob",
    )

    assert "先不硬猜" in result.payload.answer
    assert result.payload.answerKind == "grounded"
    assert result.payload.providerRequestId is None
    assert result.payload.grounding["resolution"] == "no_match"
    assert provider.calls == []


def test_fuzzy_typo_resolution_uses_grounded_provider_correction(tmp_path):
    provider = FakeProvider("you probably mean generate")
    generate = RetrievalCandidate(
        entry_id="generate",
        lemma="generate",
        part_of_speech="v.",
        meanings_zh=["生成"],
        matched_alias=None,
        scope_codes=["cet6"],
        in_scope=True,
        reason="英文片段相似",
        score=420,
        source_kind="structured",
        text_score=0.72,
    )
    service = OrdinaryLookupService(
        repository=FakeRepository({}, [generate]),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda _query: None,
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="generte 是什么意思",
        request_id="req_generte",
    )

    assert result.status_code == 200
    assert result.payload.answer == "you probably mean generate"
    assert result.payload.answerKind == "grounded"
    assert result.payload.grounding["resolution"] == "resolved"
    assert result.payload.grounding["spellingCorrection"] == {
        "input": "generte",
        "lemma": "generate",
    }
    assert result.payload.providerRequestId == "provider_req_plain"
    assert provider.calls[0]["grounding"]["spellingCorrection"]["lemma"] == "generate"


def test_plain_like_typo_probe_uses_grounded_fuzzy_lookup(tmp_path):
    provider = FakeProvider("you probably mean request")
    request = RetrievalCandidate(
        entry_id="request",
        lemma="request",
        part_of_speech="v. / n.",
        meanings_zh=["ask for"],
        matched_alias=None,
        scope_codes=["cet4", "cet6"],
        in_scope=True,
        reason="english fragment similar",
        score=420,
        source_kind="structured",
        text_score=0.72,
    )
    service = OrdinaryLookupService(
        repository=FakeRepository({}, [request]),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda _query: None,
        provider=provider,
    )

    result = service.answer(
        active_exam_target="cet6",
        query="\u6709\u4e2a\u50cf reqeust \u7684\u8bcd",
        request_id="req_reqeust",
    )

    grounding = result.payload.grounding

    assert result.status_code == 200
    assert result.payload.answer == "you probably mean request"
    assert result.payload.answerKind == "grounded"
    assert grounding["queryMode"] == "fuzzy_recall"
    assert grounding["answerStyle"] == "standard_lookup"
    assert grounding["spellingCorrection"] == {
        "input": "reqeust",
        "lemma": "request",
    }
    assert result.payload.providerRequestId == "provider_req_plain"
    assert provider.calls[0]["grounding"]["queryMode"] == "fuzzy_recall"


def test_plain_like_exact_word_stays_shape_neighbor_query(tmp_path):
    institute = RetrievalCandidate(
        entry_id="institute",
        lemma="institute",
        part_of_speech="n. / v.",
        meanings_zh=["institute meaning"],
        matched_alias=None,
        scope_codes=["cet6"],
        in_scope=True,
        reason="structured exact match",
        score=100,
        source_kind="structured",
        exact_lemma=True,
        text_score=1,
    )
    service = OrdinaryLookupService(
        repository=FakeRepository({"institute": institute}, [institute]),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda _query: None,
    )

    with pytest.raises(UnsupportedQueryMode):
        service.answer(
            active_exam_target="cet6",
            query="\u6709\u4e2a\u50cf institute \u7684\u8bcd",
            request_id="req_institute_shape",
        )


def test_root_query_is_not_converted_to_ordinary_no_match(tmp_path):
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda _query: None,
    )

    with pytest.raises(UnsupportedQueryMode):
        service.answer(
            active_exam_target="cet4",
            query="re+con 的词根有什么词",
            request_id="req_root",
        )


def test_local_spelling_auto_correct_is_explicit_and_uses_ecdict_exact(tmp_path):
    provider = FakeProvider("provider must not rewrite local spelling evidence")
    spelling_provider = FakeSpellingCandidateProvider(
        spelling_result(
            "reqeust",
            (spelling_candidate("request", in_scope=True),),
        ),
    )
    repository = FakeRepository({})
    service = OrdinaryLookupService(
        repository=repository,
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda query: profile(
            "request",
            ["v. 请求；要求；n. 请求"],
            tag="cet4",
        )
        if query == "request"
        else None,
        provider=provider,
        spelling_candidate_provider=spelling_provider,
        spelling_decision_policy=SpellingDecisionPolicy(),
    )

    result = service.answer(
        active_exam_target="cet4",
        query="reqeust 是什么意思",
        request_id="req_local_auto",
    )

    assert result.status_code == 200
    assert "reqeust" in result.payload.answer
    assert "request" in result.payload.answer
    assert "v. 请求；要求" in result.payload.answer
    assert "n. 请求" in result.payload.answer
    assert result.payload.answerKind == "grounded"
    assert result.payload.providerRequestId is None
    assert result.payload.grounding["resolution"] == "resolved"
    assert result.payload.grounding["spellingDecision"] == "auto_correct"
    assert result.payload.grounding["matchType"] == "spelling_auto_correct"
    assert result.payload.grounding["spellingCorrection"] == {
        "input": "reqeust",
        "lemma": "request",
    }
    assert result.payload.grounding["mainAnswer"][0]["lemma"] == "request"
    assert result.payload.grounding["mainAnswer"][0]["inScope"] is True
    assert spelling_provider.calls == [
        {"term": "reqeust", "active_exam_target": "cet4", "limit": 8},
    ]
    assert repository.fuzzy_lookups == []
    assert provider.calls == []
    diagnostics = result.trace_diagnostics
    assert diagnostics is not None
    assert diagnostics["candidateStatus"] == "ready"
    assert diagnostics["sourceStatus"] == "ready"
    assert diagnostics["lexiconVersion"] == "fixture-v1"
    assert diagnostics["inputIsKnownWord"] is False
    assert diagnostics["globalCompetitionComplete"] is True
    assert diagnostics["candidates"] == [
        {
            "rank": 1,
            "lemma": "request",
            "editDistance": 1,
            "inActiveExamScope": True,
            "scopeCodes": ["cet4"],
            "sourceKind": "compact_wordbook",
            "reasonCodes": ["edit_distance_1", "active_exam_scope"],
            "rankKey": [1, 0, "request"],
        },
    ]
    assert diagnostics["decision"] == {
        "kind": "auto_correct",
        "reasonCode": "high_confidence",
        "selectedCandidates": ["request"],
    }
    assert_spelling_trace_latencies(diagnostics)
    assert "traceDiagnostics" not in result.payload.model_dump(by_alias=True)


def test_local_spelling_auto_correct_also_handles_bare_single_word_lookup(tmp_path):
    spelling_provider = FakeSpellingCandidateProvider(
        spelling_result(
            "reqeust",
            (spelling_candidate("request", in_scope=True),),
        ),
    )
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda query: profile(
            "request",
            ["v. 请求；要求；n. 请求"],
            tag="cet4",
        )
        if query == "request"
        else None,
        spelling_candidate_provider=spelling_provider,
        spelling_decision_policy=SpellingDecisionPolicy(),
    )

    result = service.answer(
        active_exam_target="cet4",
        query="reqeust",
        request_id="req_local_auto_bare",
    )

    assert result.status_code == 200
    assert result.payload.answerKind == "grounded"
    assert result.payload.grounding["queryMode"] == "direct_lookup"
    assert result.payload.grounding["spellingDecision"] == "auto_correct"
    assert result.payload.grounding["spellingCorrection"] == {
        "input": "reqeust",
        "lemma": "request",
    }
    assert result.payload.grounding["mainAnswer"][0]["lemma"] == "request"
    assert spelling_provider.calls == [
        {"term": "reqeust", "active_exam_target": "cet4", "limit": 8},
    ]


def test_local_spelling_single_global_candidate_is_safe_no_match(tmp_path):
    spelling_provider = FakeSpellingCandidateProvider(
        spelling_result(
            "viadcut",
            (spelling_candidate("viaduct", in_scope=False),),
        ),
    )
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda query: profile(
            "viaduct",
            ["n. 高架桥"],
            tag="gre",
        )
        if query == "viaduct"
        else None,
        spelling_candidate_provider=spelling_provider,
        spelling_decision_policy=SpellingDecisionPolicy(),
    )

    result = service.answer(
        active_exam_target="gaokao",
        query="viadcut 是什么意思",
        request_id="req_local_global_no_match",
    )

    assert result.status_code == 200
    assert result.payload.answerKind == "grounded"
    assert result.payload.providerRequestId is None
    assert result.payload.grounding["resolution"] == "no_match"
    assert result.payload.grounding["spellingDecision"] == "no_reliable_candidate"
    assert result.payload.grounding["noMatchReason"] == "no_reliable_candidate"
    assert result.payload.grounding["mainAnswer"] == []
    diagnostics = result.trace_diagnostics
    assert diagnostics is not None
    assert [item["lemma"] for item in diagnostics["candidates"]] == ["viaduct"]
    assert diagnostics["candidates"][0]["inActiveExamScope"] is False
    assert diagnostics["decision"] == {
        "kind": "no_reliable_candidate",
        "reasonCode": "no_reliable_candidate",
        "selectedCandidates": [],
    }


def test_local_spelling_global_top_degrades_to_clarification_without_reordering(
    tmp_path,
):
    spelling_provider = FakeSpellingCandidateProvider(
        spelling_result(
            "anlize",
            (
                spelling_candidate("alize", distance=1, in_scope=False),
                spelling_candidate("analyze", distance=2, in_scope=True),
            ),
        ),
    )
    profiles = {
        "alize": profile("alize", ["v. 使成某种状态"], tag="gre"),
        "analyze": profile("analyze", ["v. 分析"], tag="gk"),
    }
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda query: profiles.get(query),
        spelling_candidate_provider=spelling_provider,
        spelling_decision_policy=SpellingDecisionPolicy(),
    )

    result = service.answer(
        active_exam_target="gaokao",
        query="anlize 是什么意思",
        request_id="req_local_global_clarification",
    )

    grounding = result.payload.grounding
    assert result.status_code == 200
    assert result.payload.answerKind == "grounded"
    assert grounding["resolution"] == "needs_clarification"
    assert grounding["spellingDecision"] == "clarify_candidates"
    assert [item["lemma"] for item in grounding["candidates"]] == [
        "alize",
        "analyze",
    ]
    assert [item["inScope"] for item in grounding["candidates"]] == [False, True]
    assert grounding["scopeReminder"] == (
        "候选同时包含当前高考词书内和词书外结果，已按拼写接近度排序。"
    )
    diagnostics = result.trace_diagnostics
    assert diagnostics is not None
    assert diagnostics["decision"] == {
        "kind": "clarify_candidates",
        "reasonCode": "ambiguous_candidates",
        "selectedCandidates": ["alize", "analyze"],
    }


def test_local_spelling_ambiguity_returns_grounded_candidates_without_llm(tmp_path):
    provider = FakeProvider("provider must not pick a spelling candidate")
    candidates = (
        spelling_candidate("form", in_scope=True),
        spelling_candidate("farm", in_scope=True),
        spelling_candidate("firm", in_scope=False),
        spelling_candidate("foam", distance=2, in_scope=True),
    )
    spelling_provider = FakeSpellingCandidateProvider(
        spelling_result("frorm", candidates),
    )
    meanings = {
        "form": ["n. 形式"],
        "farm": ["n. 农场"],
        "firm": ["adj. 坚定的"],
        "foam": ["n. 泡沫"],
    }
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda query: profile(
            query,
            meanings[query],
            tag="cet4" if query != "firm" else "gre",
        )
        if query in meanings
        else None,
        provider=provider,
        spelling_candidate_provider=spelling_provider,
        spelling_decision_policy=SpellingDecisionPolicy(),
    )

    result = service.answer(
        active_exam_target="cet4",
        query="frorm 是什么意思",
        request_id="req_local_clarify",
    )

    grounding = result.payload.grounding
    assert result.status_code == 200
    assert result.payload.answerKind == "grounded"
    assert result.payload.providerRequestId is None
    assert grounding["resolution"] == "needs_clarification"
    assert grounding["spellingDecision"] == "clarify_candidates"
    assert grounding["mainAnswer"] == []
    assert [item["lemma"] for item in grounding["candidates"]] == [
        "form",
        "farm",
        "firm",
    ]
    assert [item["inScope"] for item in grounding["candidates"]] == [
        True,
        True,
        False,
    ]
    assert provider.calls == []
    diagnostics = result.trace_diagnostics
    assert diagnostics is not None
    assert [item["lemma"] for item in diagnostics["candidates"]] == [
        "form",
        "farm",
        "firm",
        "foam",
    ]
    assert [item["rank"] for item in diagnostics["candidates"]] == [1, 2, 3, 4]
    assert diagnostics["decision"] == {
        "kind": "clarify_candidates",
        "reasonCode": "ambiguous_candidates",
        "selectedCandidates": ["form", "farm", "firm"],
    }
    assert diagnostics["sourceStatus"] == "ready"
    assert_spelling_trace_latencies(diagnostics)


@pytest.mark.parametrize(
    ("candidate_result", "expected_reason"),
    [
        (
            spelling_result(
                "xqzplm",
                (spelling_candidate("example", distance=2),),
            ),
            "random_like",
        ),
        (
            spelling_result(
                "reqeust",
                (),
                status="candidate_source_unavailable",
                complete=False,
            ),
            "candidate_source_unavailable",
        ),
    ],
)
def test_local_spelling_safe_no_match_blocks_internal_and_outer_provider_recovery(
    tmp_path,
    candidate_result,
    expected_reason,
):
    from backend.app.answering.chat_orchestrator import (
        is_recoverable_service_no_match,
    )

    provider = FakeProvider("provider must not invent a spelling candidate")
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda _query: None,
        provider=provider,
        spelling_candidate_provider=FakeSpellingCandidateProvider(candidate_result),
        spelling_decision_policy=SpellingDecisionPolicy(),
    )

    result = service.answer(
        active_exam_target="cet4",
        query=f"{candidate_result.term} 是什么意思",
        request_id="req_local_safe_no_match",
    )

    assert result.status_code == 200
    assert result.payload.answerKind == "grounded"
    assert result.payload.providerRequestId is None
    assert result.payload.grounding["resolution"] == "no_match"
    assert result.payload.grounding["spellingDecision"] == "no_reliable_candidate"
    assert result.payload.grounding["noMatchReason"] == expected_reason
    assert is_recoverable_service_no_match(result.payload) is False
    assert provider.calls == []
    diagnostics = result.trace_diagnostics
    assert diagnostics is not None
    assert diagnostics["candidateStatus"] == candidate_result.status
    assert diagnostics["sourceStatus"] == candidate_result.status
    assert diagnostics["lexiconVersion"] == "fixture-v1"
    assert diagnostics["decision"] == {
        "kind": "no_reliable_candidate",
        "reasonCode": expected_reason,
        "selectedCandidates": [],
    }
    assert [item["lemma"] for item in diagnostics["candidates"]] == [
        candidate.lemma for candidate in candidate_result.candidates
    ]
    assert_spelling_trace_latencies(diagnostics)


def test_local_spelling_provider_exception_is_safe_no_match(tmp_path):
    provider = FakeProvider("provider must not run after spelling source failure")
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda _query: None,
        provider=provider,
        spelling_candidate_provider=FakeSpellingCandidateProvider(
            RuntimeError("candidate source exploded"),
        ),
        spelling_decision_policy=SpellingDecisionPolicy(),
    )

    result = service.answer(
        active_exam_target="cet4",
        query="reqeust 是什么意思",
        request_id="req_local_source_error",
    )

    assert result.status_code == 200
    assert result.payload.grounding["resolution"] == "no_match"
    assert result.payload.grounding["noMatchReason"] == "candidate_source_error"
    assert result.payload.grounding["spellingDecision"] == "no_reliable_candidate"
    assert provider.calls == []
    diagnostics = result.trace_diagnostics
    assert diagnostics is not None
    assert diagnostics["candidateStatus"] == "candidate_source_error"
    assert diagnostics["sourceStatus"] == "candidate_source_error"
    assert diagnostics["lexiconVersion"] == "unavailable"
    assert diagnostics["globalCompetitionComplete"] is False
    assert diagnostics["candidates"] == []
    assert diagnostics["decision"] == {
        "kind": "no_reliable_candidate",
        "reasonCode": "candidate_source_error",
        "selectedCandidates": [],
    }
    assert_spelling_trace_latencies(diagnostics)
    assert diagnostics["latencyMs"]["decision"] == 0.0


def test_plain_like_query_uses_the_same_local_spelling_recovery(tmp_path):
    spelling_provider = FakeSpellingCandidateProvider(
        spelling_result(
            "reqeust",
            (spelling_candidate("request", in_scope=True),),
        ),
    )
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda query: profile("request", ["v. 请求"], tag="cet4")
        if query == "request"
        else None,
        spelling_candidate_provider=spelling_provider,
        spelling_decision_policy=SpellingDecisionPolicy(),
    )

    result = service.answer(
        active_exam_target="cet4",
        query="有个像 reqeust 的词",
        request_id="req_local_plain_like",
    )

    assert result.payload.grounding["queryMode"] == "fuzzy_recall"
    assert result.payload.grounding["spellingDecision"] == "auto_correct"
    assert result.payload.grounding["spellingCorrection"] == {
        "input": "reqeust",
        "lemma": "request",
    }


def test_create_app_wires_default_local_spelling_recovery_without_structured_runtime(
    tmp_path,
    monkeypatch,
):
    from backend.app.main import create_app
    from backend.app.retrieval.repository import NullStructuredLookupRepository

    monkeypatch.setenv("ENGGO_USE_STRUCTURED_RUNTIME", "false")
    monkeypatch.setenv("ENGGO_SOURCE_LEMMA_BASE_DIR", str(tmp_path / "exam-vocab"))
    monkeypatch.setenv("ENGGO_ECDICT_PATH", str(tmp_path / "ecdict.csv"))

    app = create_app()
    service = app.state.ordinary_lookup_service

    assert isinstance(service.repository, NullStructuredLookupRepository)
    assert service.spelling_candidate_provider is app.state.spelling_candidate_provider
    assert service.spelling_decision_policy is app.state.spelling_decision_policy
    assert service.spelling_candidate_provider._ecdict_lookup is service.ecdict_lookup
    assert service.spelling_candidate_provider._compact_wordbook_loader.path == (
        tmp_path / "exam-vocab" / "ecdict-wordbook" / "entries.json"
    )
