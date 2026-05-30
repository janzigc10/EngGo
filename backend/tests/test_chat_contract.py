from fastapi.testclient import TestClient

from backend.app.answering.direct_compare import DirectCompareService
from backend.app.answering.advanced_lookup import AdvancedLookupResult
from backend.app.answering.ordinary_lookup import OrdinaryLookupService
from backend.app.answering.ordinary_lookup import UnsupportedQueryMode
from backend.app.answering.provider import ChatProviderError, GenerateAnswerResult
from backend.app.content.ecdict import EcdictBasicProfile
from backend.app.core.config import Settings
import backend.app.main as app_main
from backend.app.main import create_app
from backend.app.retrieval.types import (
    ConfusionGroup,
    ConfusionGroupMember,
    RetrievalCandidate,
)
from backend.app.schemas.chat import ChatSuccessResponse


ACCESS_ASSESS_EXCESS_GROUNDING = {
    "activeExamTarget": "cet6",
    "queryMode": "direct_compare",
    "answerStyle": "confusion_untangle",
    "resolution": "resolved",
    "mainAnswer": [],
    "confusionBoundary": [],
    "comparisonView": {
        "id": "access-assess-excess",
        "members": [
            {
                "entryId": "access",
                "lemma": "access",
                "partOfSpeech": "n. / v.",
                "meaningZh": "进入权；使用权",
                "sourceKind": "structured",
            },
            {
                "entryId": "assess",
                "lemma": "assess",
                "partOfSpeech": "v.",
                "meaningZh": "评估",
                "sourceKind": "structured",
            },
            {
                "entryId": "excess",
                "lemma": "excess",
                "partOfSpeech": "n.",
                "meaningZh": "过量",
                "sourceKind": "structured",
            },
        ],
    },
}


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


class RecordingService:
    def __init__(
        self,
        *,
        answer="ok",
        answer_kind="grounded",
        grounding=None,
        status_code=200,
    ):
        self.calls = []
        self.answer_text = answer
        self.answer_kind = answer_kind
        self.grounding = grounding
        self.status_code = status_code

    def answer(self, **kwargs):
        self.calls.append(kwargs)
        return AdvancedLookupResult(
            status_code=self.status_code,
            payload=ChatSuccessResponse(
                answer=self.answer_text,
                answerKind=self.answer_kind,
                grounding=self.grounding,
                requestId=kwargs["request_id"],
                providerRequestId=None,
            ),
        )


class RejectingService:
    def __init__(self):
        self.calls = []

    def answer(self, **kwargs):
        self.calls.append(kwargs)
        raise UnsupportedQueryMode("unsupported")


class FailingIfCalled:
    def answer(self, **_kwargs):
        raise AssertionError("service should not be called")


class RecordingProvider:
    def __init__(self, answer="study guidance answer"):
        self.calls = []
        self.answer = answer

    def generate_answer(self, **kwargs):
        self.calls.append(kwargs)
        return GenerateAnswerResult(
            answer=self.answer,
            provider_request_id="provider_study_1",
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


def test_chat_attaches_conversation_context_to_grounded_direct_compare():
    direct_service = RecordingService(
        answer="access / assess / excess",
        grounding=ACCESS_ASSESS_EXCESS_GROUNDING,
    )
    client = create_client(
        ordinary_lookup_service=RejectingService(),
        direct_compare_service=direct_service,
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "access assess excess 怎么区分",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["conversationContext"]["topicKind"] == "direct_compare"
    assert [
        item["lemma"]
        for item in payload["conversationContext"]["candidates"]
    ] == ["access", "assess", "excess"]


def test_chat_routes_resolved_ordinal_follow_up_through_ordinary_lookup():
    ordinary_service = RecordingService(
        answer="assess\n\nv. 评估",
        grounding={
            "activeExamTarget": "cet6",
            "queryMode": "direct_lookup",
            "answerStyle": "standard_lookup",
            "resolution": "resolved",
            "mainAnswer": [
                {
                    "entryId": "assess",
                    "lemma": "assess",
                    "partOfSpeech": "v.",
                    "meaningZh": "评估",
                    "sourceKind": "structured",
                }
            ],
        },
    )
    client = create_client(ordinary_lookup_service=ordinary_service)

    first_context = {
        "version": 1,
        "activeExamTarget": "cet6",
        "sourceMessageId": "turn_1:assistant",
        "topicKind": "direct_compare",
        "focus": None,
        "candidates": [
            {"index": 1, "lemma": "access", "label": "access"},
            {"index": 2, "lemma": "assess", "label": "assess"},
            {"index": 3, "lemma": "excess", "label": "excess"},
        ],
        "availableActions": ["collect_one", "collect_group"],
        "expiresAfterTurns": 2,
    }

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "第二个是什么意思",
            "history": [],
            "conversationContext": first_context,
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert ordinary_service.calls[0]["query"] == "assess 是什么意思"
    assert payload["resolvedFollowUp"]["kind"] == "resolved_query"
    assert [
        item["lemma"]
        for item in payload["resolvedFollowUp"]["targetRefs"]
    ] == ["assess"]


def test_chat_clarifies_follow_up_without_context_without_calling_services():
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "第二个是什么意思",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answerKind"] == "plain"
    assert payload["providerRequestId"] is None
    assert payload["resolvedFollowUp"]["kind"] == "clarification"
    assert "grounding" not in payload


def test_chat_resolves_collect_group_action_without_calling_lookup_services():
    first_context = {
        "version": 1,
        "activeExamTarget": "cet6",
        "sourceMessageId": "turn_1:assistant",
        "topicKind": "direct_compare",
        "focus": None,
        "candidates": [
            {"index": 1, "lemma": "access", "label": "access"},
            {"index": 2, "lemma": "assess", "label": "assess"},
            {"index": 3, "lemma": "excess", "label": "excess"},
        ],
        "availableActions": ["collect_one", "collect_group"],
        "expiresAfterTurns": 2,
    }
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "把这组都收藏",
            "history": [],
            "conversationContext": first_context,
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answerKind"] == "plain"
    assert payload["providerRequestId"] is None
    assert payload["resolvedFollowUp"]["kind"] == "resolved_action"
    assert payload["resolvedFollowUp"]["action"] == "collect_group"
    assert [
        item["lemma"]
        for item in payload["resolvedFollowUp"]["targetRefs"]
    ] == ["access", "assess", "excess"]


def test_chat_scope_switch_reuses_source_query_with_new_exam_target():
    ordinary_service = RecordingService(
        answer="postgrad compare answer",
        grounding={
            "activeExamTarget": "postgrad",
            "query": "access assess excess 怎么区分",
            "queryMode": "direct_compare",
            "answerStyle": "confusion_untangle",
            "resolution": "resolved",
            "mainAnswer": [
                {"entryId": "access", "lemma": "access", "meaningZh": "进入权"},
                {"entryId": "assess", "lemma": "assess", "meaningZh": "评估"},
            ],
            "confusionBoundary": [],
        },
    )
    client = create_client(ordinary_lookup_service=ordinary_service)

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "换成考研范围",
            "history": [],
            "conversationContext": {
                "version": 1,
                "activeExamTarget": "cet6",
                "sourceMessageId": "turn_1:assistant",
                "topicKind": "direct_compare",
                "sourceQuery": "access assess excess 怎么区分",
                "focus": None,
                "candidates": [
                    {"index": 1, "lemma": "access", "label": "access"},
                    {"index": 2, "lemma": "assess", "label": "assess"},
                    {"index": 3, "lemma": "excess", "label": "excess"},
                ],
                "availableActions": ["collect_one", "switch_scope", "study_guidance", "collect_group"],
                "expiresAfterTurns": 2,
            },
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert ordinary_service.calls[0]["active_exam_target"] == "postgrad"
    assert ordinary_service.calls[0]["query"] == "access assess excess 怎么区分"
    assert payload["resolvedFollowUp"]["kind"] == "resolved_query"
    assert payload["resolvedFollowUp"]["reason"] == "scope_switch"
    assert payload["resolvedFollowUp"]["activeExamTarget"] == "postgrad"
    assert payload["conversationContext"]["activeExamTarget"] == "postgrad"


def test_chat_switches_scope_without_context_without_calling_services():
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "只看四级",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answerKind"] == "plain"
    assert payload["providerRequestId"] is None
    assert payload["resolvedFollowUp"]["kind"] == "resolved_action"
    assert payload["resolvedFollowUp"]["action"] == "switch_scope"
    assert payload["resolvedFollowUp"]["activeExamTarget"] == "cet4"


def test_chat_show_more_uses_continuation_candidates_without_calling_services():
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "postgrad",
            "query": "还有吗",
            "history": [],
            "conversationContext": {
                "version": 1,
                "activeExamTarget": "postgrad",
                "sourceMessageId": "turn_1:assistant",
                "topicKind": "shape_neighbors",
                "sourceQuery": "给我几个跟 evaluate 易混的单词",
                "focus": None,
                "candidates": [
                    {"index": 1, "lemma": "evaluate", "label": "evaluate"},
                    {"index": 2, "lemma": "evacuate", "label": "evacuate"},
                ],
                "continuationCandidates": [
                    {"index": 1, "lemma": "escalate", "label": "escalate", "meaningZh": "升级"},
                    {"index": 2, "lemma": "graduate", "label": "graduate", "meaningZh": "毕业"},
                    {"index": 3, "lemma": "valuable", "label": "valuable", "meaningZh": "有价值的"},
                ],
                "availableActions": ["collect_one", "switch_scope", "study_guidance", "collect_group", "show_more"],
                "expiresAfterTurns": 2,
            },
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["providerRequestId"] is None
    assert payload["resolvedFollowUp"]["action"] == "show_more"
    assert [
        item["lemma"]
        for item in payload["resolvedFollowUp"]["targetRefs"]
    ] == ["escalate", "graduate", "valuable"]
    assert "escalate" in payload["answer"]
    assert [
        item["lemma"]
        for item in payload["conversationContext"]["candidates"]
    ] == ["escalate", "graduate", "valuable"]


def test_chat_show_more_without_context_clarifies_without_services():
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "还有吗",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answerKind"] == "plain"
    assert payload["resolvedFollowUp"]["kind"] == "clarification"
    assert "grounding" not in payload


def test_chat_study_guidance_uses_provider_with_locked_target_refs():
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )
    provider = RecordingProvider()
    client.app.state.provider = provider

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "这组怎么背",
            "history": [],
            "conversationContext": {
                "version": 1,
                "activeExamTarget": "cet6",
                "sourceMessageId": "turn_1:assistant",
                "topicKind": "direct_compare",
                "sourceQuery": "access assess excess 怎么区分",
                "focus": None,
                "candidates": [
                    {"index": 1, "lemma": "access", "label": "access"},
                    {"index": 2, "lemma": "assess", "label": "assess"},
                    {"index": 3, "lemma": "excess", "label": "excess"},
                ],
                "availableActions": ["collect_one", "switch_scope", "study_guidance", "collect_group"],
                "expiresAfterTurns": 2,
            },
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answer"] == "study guidance answer"
    assert payload["providerRequestId"] == "provider_study_1"
    assert payload["resolvedFollowUp"]["action"] == "study_guidance"
    assert set(provider.calls[0]["grounding"].keys()) == {"targetRefs", "rules"}
    assert [
        item["lemma"]
        for item in provider.calls[0]["grounding"]["targetRefs"]
    ] == ["access", "assess", "excess"]


def test_chat_context_choice_uses_provider_with_locked_target_refs():
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )
    provider = RecordingProvider(answer="comply is the most formal choice.")
    client.app.state.provider = provider

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "哪个更正式",
            "history": [],
            "conversationContext": {
                "version": 1,
                "activeExamTarget": "cet6",
                "sourceMessageId": "turn_1:assistant",
                "topicKind": "meaning_lookup",
                "sourceQuery": "遵循的英文是什么",
                "focus": None,
                "candidates": [
                    {"index": 1, "lemma": "follow", "label": "follow"},
                    {"index": 2, "lemma": "obey", "label": "obey"},
                    {"index": 3, "lemma": "comply", "label": "comply"},
                ],
                "availableActions": ["collect_one", "switch_scope", "study_guidance", "collect_group", "context_choice"],
                "expiresAfterTurns": 2,
            },
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answer"] == "comply is the most formal choice."
    assert payload["providerRequestId"] == "provider_study_1"
    assert payload["resolvedFollowUp"]["kind"] == "resolved_action"
    assert payload["resolvedFollowUp"]["action"] == "context_choice"
    assert set(provider.calls[0]["grounding"].keys()) == {"targetRefs", "rules"}
    assert [
        item["lemma"]
        for item in provider.calls[0]["grounding"]["targetRefs"]
    ] == ["follow", "obey", "comply"]


def test_chat_context_choice_without_provider_returns_safe_plain_answer():
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "哪个更适合考试表达",
            "history": [],
            "conversationContext": {
                "version": 1,
                "activeExamTarget": "cet6",
                "sourceMessageId": "turn_1:assistant",
                "topicKind": "direct_compare",
                "sourceQuery": "access assess excess 怎么区分",
                "focus": None,
                "candidates": [
                    {"index": 1, "lemma": "access", "label": "access"},
                    {"index": 2, "lemma": "assess", "label": "assess"},
                    {"index": 3, "lemma": "excess", "label": "excess"},
                ],
                "availableActions": ["collect_one", "switch_scope", "study_guidance", "collect_group", "context_choice"],
                "expiresAfterTurns": 2,
            },
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answerKind"] == "plain"
    assert payload["providerRequestId"] is None
    assert "access / assess / excess" in payload["answer"]
    assert "暂时不可用" not in payload["answer"]
    assert payload["resolvedFollowUp"]["action"] == "context_choice"


def test_chat_context_choice_without_context_clarifies_without_provider():
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "哪个更正式",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answerKind"] == "plain"
    assert payload["providerRequestId"] is None
    assert payload["resolvedFollowUp"]["kind"] == "clarification"
    assert "grounding" not in payload


def test_chat_keeps_normal_query_with_context_on_original_route():
    ordinary_service = RecordingService(
        answer="make up\n\nphr. 组成；编造",
        grounding={
            "activeExamTarget": "cet6",
            "queryMode": "direct_lookup",
            "answerStyle": "standard_lookup",
            "resolution": "resolved",
            "mainAnswer": [
                {
                    "entryId": "make-up",
                    "lemma": "make up",
                    "partOfSpeech": "phr.",
                    "meaningZh": "组成；编造",
                    "sourceKind": "external_dictionary_basic",
                }
            ],
        },
    )
    client = create_client(ordinary_lookup_service=ordinary_service)

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "make up 是什么意思",
            "history": [],
            "conversationContext": {
                "version": 1,
                "activeExamTarget": "cet6",
                "sourceMessageId": "turn_1:assistant",
                "topicKind": "direct_compare",
                "focus": None,
                "candidates": [
                    {"index": 1, "lemma": "access", "label": "access"},
                    {"index": 2, "lemma": "assess", "label": "assess"},
                    {"index": 3, "lemma": "excess", "label": "excess"},
                ],
                "availableActions": ["collect_one", "collect_group"],
                "expiresAfterTurns": 2,
            },
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert ordinary_service.calls[0]["query"] == "make up 是什么意思"
    assert "resolvedFollowUp" not in payload


def test_chat_clarifies_mixed_explicit_and_ordinal_reference_without_services():
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "access 和第二个怎么区分",
            "history": [],
            "conversationContext": {
                "version": 1,
                "activeExamTarget": "cet6",
                "sourceMessageId": "turn_1:assistant",
                "topicKind": "direct_compare",
                "focus": None,
                "candidates": [
                    {"index": 1, "lemma": "access", "label": "access"},
                    {"index": 2, "lemma": "assess", "label": "assess"},
                    {"index": 3, "lemma": "excess", "label": "excess"},
                ],
                "availableActions": ["collect_one", "collect_group"],
                "expiresAfterTurns": 2,
            },
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answerKind"] == "plain"
    assert payload["resolvedFollowUp"]["kind"] == "clarification"


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
    assert "我可以陪你" in payload["answer"]


def test_chat_returns_plain_capability_answer_without_grounding():
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "你能干嘛",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answerKind"] == "plain"
    assert payload["providerRequestId"] is None
    assert "查词" in payload["answer"]
    assert "grounding" not in payload


def test_chat_returns_plain_learning_mood_answer_without_grounding():
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "我今天不想背词",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answerKind"] == "plain"
    assert payload["providerRequestId"] is None
    assert "先不硬背" in payload["answer"]
    assert "grounding" not in payload


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


def test_chat_runtime_does_not_instantiate_structured_repository_by_default(
    tmp_path,
    monkeypatch,
):
    class FailingStructuredRepository:
        def __init__(self, **_kwargs):
            raise AssertionError("structured repository should be opt-in")

    class EcdictLookup:
        def __call__(self, query: str):
            if query.strip().lower() != "activity":
                return None

            return EcdictBasicProfile(
                canonical="activity",
                lookup_key="activity",
                entry_kind="word",
                match_kind="exact",
                meanings=["n. activity"],
                raw_translation="n. activity",
                tag="ky",
                definition="",
            )

    monkeypatch.setattr(
        app_main,
        "load_settings",
        lambda: Settings(
            database_url="postgresql://enggo:secret@localhost:5432/enggo",
            source_lemma_base_dir=tmp_path,
            ecdict_dictionary_path=tmp_path / "ecdict.csv",
        ),
    )
    monkeypatch.setattr(app_main, "StructuredLookupRepository", FailingStructuredRepository)
    monkeypatch.setattr(
        app_main,
        "create_ecdict_basic_profile_lookup",
        lambda *, dictionary_path: EcdictLookup(),
    )

    client = TestClient(app_main.create_app())

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "postgrad",
            "query": "activity",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["providerRequestId"] is None
    assert payload["grounding"]["matchType"] == "external_dictionary_exact"
    assert payload["grounding"]["mainAnswer"][0]["lemma"] == "activity"


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


def test_chat_returns_bounded_fallback_when_all_services_reject_normal_query(tmp_path):
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
            "query": "帮我安排一个两分钟小练习",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert response.headers["x-request-id"] == payload["requestId"]
    assert payload["providerRequestId"] is None
    assert payload["answerKind"] == "plain"
    assert "这句话我先接住" in payload["answer"]
    assert "grounding" not in payload
