from fastapi.testclient import TestClient

from backend.app.answering.direct_compare import DirectCompareService
from backend.app.answering.advanced_lookup import AdvancedLookupResult
from backend.app.answering.ordinary_lookup import OrdinaryLookupService
from backend.app.answering.ordinary_lookup import UnsupportedQueryMode
from backend.app.answering.provider import ChatProviderError
from backend.app.main import create_app
from backend.app.retrieval.types import (
    ConfusionGroup,
    ConfusionGroupMember,
    RetrievalCandidate,
)
from backend.app.schemas.chat import ChatSuccessResponse


class FakeRepository:
    def __init__(self, candidates=None, groups=None):
        self.candidates = candidates or {}
        self.groups = groups or []

    def find_exact_entry(self, _active_exam_target, lookup):
        return self.candidates.get(lookup)

    def find_confusion_groups_for_entry_ids(self, _active_exam_target, _entry_ids):
        return self.groups


def create_client(
    ordinary_lookup_service=None,
    direct_compare_service=None,
    advanced_lookup_service=None,
) -> TestClient:
    return TestClient(
        create_app(
            ordinary_lookup_service=ordinary_lookup_service,
            direct_compare_service=direct_compare_service,
            advanced_lookup_service=advanced_lookup_service,
        ),
    )


def test_chat_rejects_invalid_request_with_400():
    client = create_client()

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 400
    assert response.headers["x-request-id"] == payload["requestId"]
    assert payload["error"]["code"] == "invalid_request"
    assert payload["providerRequestId"] is None


def test_chat_returns_plain_greeting_without_grounding():
    client = create_client()

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "你好",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert response.headers["x-request-id"] == payload["requestId"]
    assert payload["answerKind"] == "plain"
    assert payload["providerRequestId"] is None
    assert "grounding" not in payload
    assert "缩小备考范围" in payload["answer"]


def test_chat_returns_grounded_ordinary_lookup_from_fastapi_service(tmp_path):
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
    client = create_client(ordinary_lookup_service=service)

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "access 是什么意思",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert response.headers["x-request-id"] == payload["requestId"]
    assert payload["answer"] == "access\n\nn./v. 进入权；使用权；访问"
    assert payload["answerKind"] == "grounded"
    assert payload["providerRequestId"] is None
    assert payload["grounding"]["matchType"] == "exact"


def test_chat_keeps_ordinary_exact_lookup_before_broad_services(tmp_path):
    class FailingIfCalled:
        def answer(self, **_kwargs):
            raise AssertionError("ordinary exact lookup should stop routing")

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
    client = create_client(
        ordinary_lookup_service=service,
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "access 是什么意思",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answer"] == "access\n\nn./v. 进入权；使用权；访问"
    assert payload["grounding"]["answerStyle"] == "standard_lookup"
    assert payload["grounding"]["matchType"] == "exact"


def test_chat_routes_direct_compare_after_ordinary_lookup_rejects_mode(tmp_path):
    access = RetrievalCandidate(
        entry_id="access",
        lemma="access",
        part_of_speech="n.",
        meanings_zh=["entry"],
        matched_alias=None,
        scope_codes=["cet6"],
        in_scope=True,
        reason="structured exact match",
        score=100,
        source_kind="structured",
    )
    assess = RetrievalCandidate(
        entry_id="assess",
        lemma="assess",
        part_of_speech="v.",
        meanings_zh=["judge"],
        matched_alias=None,
        scope_codes=["cet6"],
        in_scope=True,
        reason="structured exact match",
        score=100,
        source_kind="structured",
    )
    repository = FakeRepository(
        {"access": access, "assess": assess},
        [
            ConfusionGroup(
                id="access-assess-excess",
                teach_first_entry_id="access",
                why_confusing="same shape",
                common_misuse_points=[],
                semantic_boundary_notes=[],
                labels=["shape_like"],
                purposes=["confusion_untangle"],
                anchor_pattern=None,
                quick_distinction=None,
                exam_hook=None,
                members=[
                    ConfusionGroupMember(access, 0, None),
                    ConfusionGroupMember(assess, 1, None),
                ],
            ),
        ],
    )
    ordinary_service = OrdinaryLookupService(
        repository=repository,
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda _query: None,
    )
    direct_compare_service = DirectCompareService(repository=repository)
    client = create_client(
        ordinary_lookup_service=ordinary_service,
        direct_compare_service=direct_compare_service,
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "access assess 怎么区分",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert response.headers["x-request-id"] == payload["requestId"]
    assert payload["answerKind"] == "grounded"
    assert payload["providerRequestId"] is None
    assert payload["grounding"]["queryMode"] == "direct_compare"
    assert payload["grounding"]["answerStyle"] == "confusion_untangle"
    assert payload["grounding"]["comparisonView"]["id"] == "access-assess-excess"


def test_chat_routes_advanced_lookup_after_prior_services_reject_mode():
    class RejectingService:
        def answer(self, **_kwargs):
            raise UnsupportedQueryMode("root_family_summary")

    class AdvancedService:
        def __init__(self):
            self.calls = []

        def answer(self, **kwargs):
            self.calls.append(kwargs)
            return AdvancedLookupResult(
                status_code=200,
                payload=ChatSuccessResponse(
                    answer="root boundary answer",
                    answerKind="grounded",
                    grounding={
                        "queryMode": "root_family_summary",
                        "answerStyle": "root_family_summary",
                        "resolution": "no_match",
                    },
                    requestId=kwargs["request_id"],
                    providerRequestId=None,
                ),
            )

    advanced_service = AdvancedService()
    client = create_client(
        ordinary_lookup_service=RejectingService(),
        direct_compare_service=RejectingService(),
        advanced_lookup_service=advanced_service,
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "re+con 的词根有什么词",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert response.headers["x-request-id"] == payload["requestId"]
    assert advanced_service.calls[0]["query"] == "re+con 的词根有什么词"
    assert payload["answerKind"] == "grounded"
    assert payload["grounding"]["queryMode"] == "root_family_summary"
    assert payload["grounding"]["resolution"] == "no_match"


def test_chat_maps_missing_provider_to_openai_unavailable():
    class FailingService:
        def answer(self, **_kwargs):
            raise ChatProviderError(
                "OPENAI_API_KEY is not configured on the server.",
                status_code=503,
            )

    client = create_client(ordinary_lookup_service=FailingService())

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "complex是什么意思",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 503
    assert response.headers["x-request-id"] == payload["requestId"]
    assert payload["error"]["code"] == "openai_unavailable"
    assert payload["providerRequestId"] is None


def test_chat_maps_provider_failure_to_generation_failed():
    class FailingService:
        def answer(self, **_kwargs):
            raise ChatProviderError(
                "provider failed",
                status_code=502,
                provider_request_id="provider_req_123",
            )

    client = create_client(ordinary_lookup_service=FailingService())

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "complex是什么意思",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 502
    assert response.headers["x-request-id"] == payload["requestId"]
    assert payload["error"]["code"] == "chat_generation_failed"
    assert payload["providerRequestId"] == "provider_req_123"


def test_chat_returns_not_implemented_when_all_services_reject_query_mode(tmp_path):
    class RejectingService:
        def answer(self, **_kwargs):
            raise UnsupportedQueryMode("root_family_summary")

    service = OrdinaryLookupService(
        repository=FakeRepository(),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=lambda _query: None,
    )
    client = create_client(
        ordinary_lookup_service=service,
        direct_compare_service=RejectingService(),
        advanced_lookup_service=RejectingService(),
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "re+con 的词根有什么词",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 501
    assert response.headers["x-request-id"] == payload["requestId"]
    assert payload["error"]["code"] == "not_implemented"
    assert payload["providerRequestId"] is None
    assert "grounding" not in payload
