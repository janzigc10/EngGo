from pathlib import Path

import pytest

from backend.app.answering.ordinary_lookup import (
    OrdinaryLookupService,
    UnsupportedQueryMode,
)
from backend.app.answering.provider import GenerateAnswerResult
from backend.app.content.ecdict import EcdictBasicProfile
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
