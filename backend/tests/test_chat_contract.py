import asyncio
import json

from fastapi.testclient import TestClient
from starlette.requests import Request

from backend.app.api.chat import post_chat_stream
from backend.app.answering.direct_compare import DirectCompareService
from backend.app.answering.advanced_lookup import (
    AdvancedLookupResult,
    AdvancedLookupService,
)
from backend.app.answering.ordinary_lookup import OrdinaryLookupService
from backend.app.answering.ordinary_lookup import UnsupportedQueryMode
from backend.app.answering.provider import ChatProviderError, GenerateAnswerResult
from backend.app.content.ecdict import EcdictBasicProfile
from backend.app.core.config import Settings
import backend.app.main as app_main
from backend.app.main import create_app
from backend.app.retrieval.spelling_candidates import (
    SpellingCandidate,
    SpellingCandidateResult,
)
from backend.app.retrieval.spelling_decision import SpellingDecisionPolicy
from backend.app.retrieval.retrieval_trace import InMemoryRetrievalTraceSink
from backend.app.retrieval.types import (
    ConfusionGroup,
    ConfusionGroupMember,
    RetrievalCandidate,
)
from backend.app.schemas.chat import ChatRequest, ChatSuccessResponse


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

NO_MATCH_GROUNDING = {
    "activeExamTarget": "cet6",
    "queryMode": "meaning_lookup",
    "answerStyle": "standard_lookup",
    "resolution": "no_match",
    "noMatchReason": "out_of_kb",
    "mainAnswer": [],
    "confusionBoundary": [],
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
    retrieval_trace_sink=None,
) -> TestClient:
    return TestClient(
        create_app(
            ordinary_lookup_service=ordinary_lookup_service,
            direct_compare_service=direct_compare_service,
            advanced_lookup_service=advanced_lookup_service,
            retrieval_trace_sink=retrieval_trace_sink,
        ),
    )


def parse_sse_events(body: str):
    events = []

    for block in body.strip().split("\n\n"):
        lines = block.splitlines()
        event_name = next(
            line.removeprefix("event: ").strip()
            for line in lines
            if line.startswith("event: ")
        )
        data = "\n".join(
            line.removeprefix("data: ")
            for line in lines
            if line.startswith("data: ")
        )
        events.append((event_name, json.loads(data)))

    return events


class RecordingService:
    def __init__(
        self,
        *,
        answer="ok",
        answer_kind="grounded",
        grounding=None,
        provider_request_id=None,
        status_code=200,
    ):
        self.calls = []
        self.answer_text = answer
        self.answer_kind = answer_kind
        self.grounding = grounding
        self.provider_request_id = provider_request_id
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
                providerRequestId=self.provider_request_id,
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


class FakeSpellingEvidenceProvider:
    def __init__(self, results):
        self.results = results
        self.calls = []

    def generate(self, **kwargs):
        self.calls.append(kwargs)
        return self.results[kwargs["term"]]


class NeverCallProvider:
    def __init__(self):
        self.calls = []

    def generate_answer(self, **kwargs):
        self.calls.append(kwargs)
        raise AssertionError("spelling evidence must not call the LLM provider")


def spelling_candidate(
    lemma,
    *,
    edit_distance=1,
    in_active_exam_scope=True,
    scope_codes=("cet4",),
):
    return SpellingCandidate(
        lemma=lemma,
        edit_distance=edit_distance,
        in_active_exam_scope=in_active_exam_scope,
        scope_codes=scope_codes if in_active_exam_scope else (),
        source_kind=(
            "compact_wordbook" if in_active_exam_scope else "ecdict"
        ),
        reason_codes=(
            f"edit_distance_{edit_distance}",
            (
                "active_exam_scope"
                if in_active_exam_scope
                else "global_competitor"
            ),
        ),
        rank_key=(edit_distance, 0 if in_active_exam_scope else 1, lemma),
    )


def spelling_result(
    term,
    *candidates,
    status="ready",
    input_is_known_word=False,
    global_competition_complete=True,
):
    return SpellingCandidateResult(
        term=term,
        status=status,
        input_is_known_word=input_is_known_word,
        global_competition_complete=global_competition_complete,
        candidates=tuple(candidates),
        lexicon_version="http-fixture-v1",
    )


def ecdict_profile(lemma, *, in_cet4=True):
    return EcdictBasicProfile(
        canonical=lemma,
        lookup_key=lemma,
        entry_kind="word",
        match_kind="exact",
        meanings=[f"n. {lemma} fixture meaning"],
        raw_translation=f"n. {lemma} fixture meaning",
        tag="cet4" if in_cet4 else "",
        definition="",
    )


def ecdict_fixture_lookup(*profiles):
    by_lemma = {profile.canonical: profile for profile in profiles}
    return lambda query: by_lemma.get(query.strip().lower())


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


class SequenceProvider:
    def __init__(self, answers):
        self.answers = list(answers)
        self.calls = []

    def generate_answer(self, **kwargs):
        self.calls.append(kwargs)
        if not self.answers:
            raise AssertionError("provider called more times than expected")

        index = len(self.calls)
        return GenerateAnswerResult(
            answer=self.answers.pop(0),
            provider_request_id=f"provider_seq_{index}",
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
    assert payload["answerSurface"]["type"] == "clarification"
    assert payload["answerSurface"]["text"] == payload["answer"]


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
    direct_service = RecordingService(
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
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=direct_service,
        advanced_lookup_service=FailingIfCalled(),
    )

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
    assert direct_service.calls[0]["active_exam_target"] == "postgrad"
    assert direct_service.calls[0]["query"] == "access assess excess 怎么区分"
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


def test_chat_style_follow_up_prefers_context_choice_over_show_more():
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )
    provider = RecordingProvider(answer="comply 更适合作文表达。")
    client.app.state.provider = provider

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "还有更适合作文的吗",
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
                "continuationCandidates": [
                    {"index": 1, "lemma": "observe", "label": "observe"},
                    {"index": 2, "lemma": "adhere", "label": "adhere"},
                ],
                "availableActions": [
                    "collect_one",
                    "switch_scope",
                    "study_guidance",
                    "collect_group",
                    "context_choice",
                    "show_more",
                ],
                "expiresAfterTurns": 2,
            },
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answer"] == "comply 更适合作文表达。"
    assert payload["resolvedFollowUp"]["action"] == "context_choice"
    assert [
        item["lemma"]
        for item in payload["resolvedFollowUp"]["targetRefs"]
    ] == ["follow", "obey", "comply"]
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
    client.app.state.provider = None

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


def test_chat_semantic_expression_uses_grey_zone_classifier_then_advanced_provider():
    provider = SequenceProvider(
        [
            (
                '{"intent":"semantic_expression","confidence":0.88,'
                '"terms":["follow","adhere"],"meaningHint":null,'
                '"style":"formal","reason":"formal expression request"}'
            ),
            "follow 更正式的表达可以考虑 comply with；作文里比 follow 更书面。",
        ],
    )
    advanced_service = AdvancedLookupService(
        repository=FakeRepository(),
        provider=provider,
    )
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=advanced_service,
    )
    client.app.state.provider = provider

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "more formal way to say follow",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answer"] == "follow 更正式的表达可以考虑 comply with；作文里比 follow 更书面。"
    assert payload["answerKind"] == "plain"
    assert payload["providerRequestId"] == "provider_seq_2"
    assert payload["grounding"]["queryMode"] == "semantic_expression"
    assert payload["grounding"]["answerStyle"] == "semantic_expression"
    assert payload["grounding"]["style"] == "formal"
    assert payload["grounding"]["terms"] == ["follow"]
    assert payload["grounding"]["mainAnswer"] == []
    assert payload["answerSurface"]["type"] == "expression_advice"
    assert payload["answerSurface"]["text"] == payload["answer"]
    assert payload["answerSurface"]["terms"] == ["follow"]
    assert payload["grounding"]["routeDecision"]["source"] == "llm"
    assert payload["grounding"]["routeDecision"]["terms"] == ["follow"]
    assert len(provider.calls) == 2
    assert "受控意图分类器" in provider.calls[0]["system_prompt"]
    assert provider.calls[0]["grounding"]["rulePlan"]["confidence"] < 0.85
    assert "表达建议" in provider.calls[1]["system_prompt"]


def test_chat_explicit_seed_style_request_routes_to_semantic_expression_with_context():
    advanced_service = RecordingService(
        answer="semantic expression answer",
        answer_kind="plain",
        grounding={
            "activeExamTarget": "cet6",
            "queryMode": "semantic_expression",
            "answerStyle": "semantic_expression",
            "resolution": "resolved",
            "terms": ["good"],
            "style": "essay",
            "mainAnswer": [],
        },
    )
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=advanced_service,
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "用作文更正式地表达 good",
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
    assert advanced_service.calls[0]["query"] == "用作文更正式地表达 good"
    assert "resolvedFollowUp" not in payload
    assert payload["answerKind"] == "plain"
    assert payload["grounding"]["queryMode"] == "semantic_expression"
    assert payload["grounding"]["terms"] == ["good"]
    assert payload["answerSurface"]["type"] == "expression_advice"
    assert payload["answerSurface"]["terms"] == ["good"]


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
    assert payload["answerSurface"]["type"] == "phrase_lookup"
    assert payload["answerSurface"]["title"] == "make up"
    assert payload["answerSurface"]["subtitle"] == "短语"
    assert payload["answerSurface"]["items"][0]["meaningZh"] == "组成；编造"


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
    assert payload["answerSurface"]["type"] == "plain"
    assert payload["answerSurface"]["text"] == payload["answer"]
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


def test_chat_orchestrator_handles_natural_context_continuation_before_services():
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )
    provider = RecordingProvider(answer="这几个的用法都围绕上一轮候选。")
    client.app.state.provider = provider

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "这几个具体怎么用",
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
    assert payload["answer"] == "这几个的用法都围绕上一轮候选。"
    assert payload["answerKind"] == "plain"
    assert payload["providerRequestId"] == "provider_study_1"
    assert payload["resolvedFollowUp"]["action"] == "context_continuation"
    assert [
        item["lemma"]
        for item in provider.calls[0]["grounding"]["targetRefs"]
    ] == ["access", "assess", "excess"]
    assert payload["conversationContext"]["topicKind"] == "direct_compare"


def test_chat_orchestrator_handles_english_context_continuation():
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )
    provider = RecordingProvider(answer="These words stay scoped to the prior candidates.")
    client.app.state.provider = provider

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "how do I use these words",
            "history": [],
            "conversationContext": {
                "activeExamTarget": "cet6",
                "topicKind": "direct_compare",
                "sourceMessageId": "prev:assistant",
                "sourceQuery": "access assess excess 怎么区分",
                "candidates": [
                    {"index": 1, "lemma": "access", "label": "access"},
                    {"index": 2, "lemma": "assess", "label": "assess"},
                    {"index": 3, "lemma": "excess", "label": "excess"},
                ],
                "continuationCandidates": [
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
    assert payload["answer"] == "These words stay scoped to the prior candidates."
    assert payload["answerKind"] == "plain"
    assert payload["resolvedFollowUp"]["action"] == "context_continuation"
    assert [
        item["lemma"]
        for item in provider.calls[0]["grounding"]["targetRefs"]
    ] == ["access", "assess", "excess"]


def test_chat_orchestrator_clarifies_context_continuation_without_context():
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "这几个具体怎么用",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answerKind"] == "plain"
    assert payload["providerRequestId"] is None
    assert payload["resolvedFollowUp"]["kind"] == "clarification"
    assert "grounding" not in payload


def test_chat_orchestrator_recovers_service_no_match_with_provider():
    no_match_service = RecordingService(
        answer="当前词库暂未稳定定位到你说的词",
        grounding=NO_MATCH_GROUNDING,
    )
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=no_match_service,
    )
    provider = RecordingProvider(answer="可以先按英语学习问题理解为：它在问怎么学。")
    client.app.state.provider = provider

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "怎么学英语最快",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answer"] == "可以先按英语学习问题理解为：它在问怎么学。"
    assert payload["answerKind"] == "plain"
    assert payload["providerRequestId"] == "provider_study_1"
    assert provider.calls[0]["grounding"]["recoveryKind"] == "no_match_recovery"
    assert provider.calls[0]["grounding"]["serviceGrounding"]["resolution"] == "no_match"
    assert payload["resolvedFollowUp"]["action"] == "clear_context"
    assert "grounding" not in payload


def test_chat_orchestrator_no_match_recovery_does_not_reuse_stale_context():
    no_match_service = RecordingService(
        answer="当前词库暂未稳定定位到你说的词",
        grounding=NO_MATCH_GROUNDING,
    )
    client = create_client(
        ordinary_lookup_service=no_match_service,
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )
    provider = RecordingProvider(answer="先按通用英语学习问题回答。")
    client.app.state.provider = provider

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "how to learn English fast",
            "history": [],
            "conversationContext": {
                "activeExamTarget": "cet6",
                "topicKind": "direct_compare",
                "sourceMessageId": "prev:assistant",
                "sourceQuery": "access assess excess 怎么区分",
                "candidates": [
                    {"index": 1, "lemma": "access", "label": "access"},
                    {"index": 2, "lemma": "assess", "label": "assess"},
                    {"index": 3, "lemma": "excess", "label": "excess"},
                ],
                "continuationCandidates": [
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
    assert payload["answer"] == "先按通用英语学习问题回答。"
    assert payload["answerKind"] == "plain"
    assert provider.calls[0]["grounding"]["targetRefs"] == []
    assert payload["resolvedFollowUp"]["action"] == "clear_context"
    assert "conversationContext" not in payload
    assert "grounding" not in payload


def test_chat_orchestrator_redirects_unrelated_no_match_without_provider():
    no_match_service = RecordingService(
        answer="当前词库暂未稳定定位到你说的词",
        grounding=NO_MATCH_GROUNDING,
    )
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=no_match_service,
    )
    provider = RecordingProvider(answer="should not be called")
    client.app.state.provider = provider

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "今天天气怎么样",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answerKind"] == "plain"
    assert payload["providerRequestId"] is None
    assert "主要帮你查词" in payload["answer"]
    assert payload["resolvedFollowUp"]["action"] == "clear_context"
    assert provider.calls == []
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
    assert payload["answerSurface"]["type"] == "lookup"
    assert payload["answerSurface"]["title"] == "access"
    assert payload["answerSurface"]["items"][0]["lemma"] == "access"
    assert payload["answerSurface"]["items"][0]["meaningZh"] == (
        "进入权；使用权；访问"
    )


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


def test_chat_tool_router_sends_direct_compare_without_ordinary_preflight():
    direct_service = RecordingService(
        answer="direct compare answer",
        grounding={
            "activeExamTarget": "cet6",
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
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=direct_service,
        advanced_lookup_service=FailingIfCalled(),
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
    assert direct_service.calls[0]["query"] == "access assess 怎么区分"
    assert payload["answer"] == "direct compare answer"
    assert payload["grounding"]["queryMode"] == "direct_compare"


def test_chat_tool_router_sends_shape_query_without_ordinary_preflight():
    advanced_service = RecordingService(
        answer="shape neighbor answer",
        grounding={
            "activeExamTarget": "cet6",
            "queryMode": "shape_neighbor_search",
            "answerStyle": "broad_vocab_summary",
            "resolution": "resolved",
            "mainAnswer": [
                {"entryId": "evaluate", "lemma": "evaluate", "meaningZh": "评估"},
                {"entryId": "evacuate", "lemma": "evacuate", "meaningZh": "撤离"},
            ],
            "confusionBoundary": [],
        },
    )
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=advanced_service,
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "给我几个跟 evaluate 易混的单词",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert advanced_service.calls[0]["query"] == "给我几个跟 evaluate 易混的单词"
    assert payload["answer"] == "shape neighbor answer"
    assert payload["grounding"]["queryMode"] == "shape_neighbor_search"
    assert payload["answerSurface"]["type"] == "candidate_list"
    assert [item["lemma"] for item in payload["answerSurface"]["items"]] == [
        "evaluate",
        "evacuate",
    ]


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
    provider = RecordingProvider(answer="provider direct compare answer")
    direct_compare_service = DirectCompareService(
        repository=repository,
        provider=provider,
    )
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
    assert payload["answer"] == "provider direct compare answer"
    assert payload["providerRequestId"] == "provider_study_1"
    assert payload["grounding"]["queryMode"] == "direct_compare"
    assert payload["grounding"]["answerStyle"] == "confusion_untangle"
    assert payload["grounding"]["comparisonView"] is None
    assert payload["answerSurface"]["type"] == "compare"
    assert payload["answerSurface"]["source"] == "main_answer"
    assert [item["lemma"] for item in payload["answerSurface"]["members"]] == [
        "access",
        "assess",
    ]
    assert [item["lemma"] for item in provider.calls[0]["grounding"]["mainAnswer"]] == [
        "access",
        "assess",
    ]


def test_chat_stream_emits_answer_delta_for_provider_backed_surface():
    direct_service = RecordingService(
        answer=(
            "access focuses on entry or permission; assess focuses on judgment "
            "or evaluation in exam wording."
        ),
        grounding={
            "activeExamTarget": "cet6",
            "queryMode": "direct_compare",
            "answerStyle": "confusion_untangle",
            "resolution": "resolved",
            "mainAnswer": [
                {
                    "entryId": "access",
                    "lemma": "access",
                    "partOfSpeech": "n. / v.",
                    "meaningZh": "entry; permission",
                    "sourceKind": "structured",
                },
                {
                    "entryId": "assess",
                    "lemma": "assess",
                    "partOfSpeech": "v.",
                    "meaningZh": "evaluate",
                    "sourceKind": "structured",
                },
            ],
            "confusionBoundary": [],
        },
        provider_request_id="provider_stream_compare",
    )
    client = create_client(
        ordinary_lookup_service=RejectingService(),
        direct_compare_service=direct_service,
        advanced_lookup_service=FailingIfCalled(),
    )

    response = client.post(
        "/api/chat/stream",
        json={
            "activeExamTarget": "cet6",
            "query": "access assess compare",
            "history": [],
        },
    )

    events = parse_sse_events(response.text)
    event_names = [event_name for event_name, _event_payload in events]
    delta_events = [
        event_payload
        for event_name, event_payload in events
        if event_name == "answer_delta"
    ]
    surface_event = next(
        event_payload
        for event_name, event_payload in events
        if event_name == "surface_start"
    )
    final_payload = events[-1][1]["payload"]

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert event_names[0:2] == ["meta", "surface_start"]
    assert event_names[-1] == "final"
    assert surface_event["surface"]["type"] == "compare"
    assert surface_event["surface"]["title"] == "核心区别"
    assert surface_event["surface"]["text"] == ""
    assert "members" not in surface_event["surface"]
    assert delta_events
    assert "".join(event["text"] for event in delta_events) == final_payload["answer"]
    assert final_payload["providerRequestId"] == "provider_stream_compare"
    assert final_payload["answerSurface"]["type"] == "compare"
    assert [item["lemma"] for item in final_payload["answerSurface"]["members"]] == [
        "access",
        "assess",
    ]


def test_chat_stream_keeps_deterministic_lookup_final_only():
    ordinary_service = RecordingService(
        answer="access\n\nn. entry; permission",
        grounding={
            "activeExamTarget": "cet6",
            "queryMode": "direct_lookup",
            "answerStyle": "standard_lookup",
            "resolution": "resolved",
            "mainAnswer": [
                {
                    "entryId": "access",
                    "lemma": "access",
                    "partOfSpeech": "n.",
                    "meaningZh": "entry; permission",
                    "sourceKind": "structured",
                }
            ],
            "confusionBoundary": [],
        },
    )
    client = create_client(
        ordinary_lookup_service=ordinary_service,
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )

    response = client.post(
        "/api/chat/stream",
        json={
            "activeExamTarget": "cet6",
            "query": "access",
            "history": [],
        },
    )

    events = parse_sse_events(response.text)
    final_payload = events[-1][1]["payload"]

    assert response.status_code == 200
    assert [event_name for event_name, _event_payload in events] == ["meta", "final"]
    assert final_payload["providerRequestId"] is None
    assert final_payload["answerSurface"]["type"] == "lookup"


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


def test_chat_spelling_auto_correct_is_explicit_grounded_and_provider_off(tmp_path):
    evidence = FakeSpellingEvidenceProvider(
        {
            "reqeust": spelling_result(
                "reqeust",
                spelling_candidate("request"),
            ),
        },
    )
    service = OrdinaryLookupService(
        repository=FakeRepository(),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=ecdict_fixture_lookup(ecdict_profile("request")),
        spelling_candidate_provider=evidence,
        spelling_decision_policy=SpellingDecisionPolicy(),
    )
    client = create_client(
        ordinary_lookup_service=service,
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )
    llm = NeverCallProvider()
    client.app.state.provider = llm

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet4",
            "query": "reqeust是什么意思",
            "history": [],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["answerKind"] == "grounded"
    assert payload["providerRequestId"] is None
    assert "reqeust" in payload["answer"]
    assert "request" in payload["answer"]
    assert payload["grounding"]["resolution"] == "resolved"
    assert payload["grounding"]["matchType"] == "spelling_auto_correct"
    assert payload["grounding"]["spellingDecision"] == "auto_correct"
    assert payload["grounding"]["spellingCorrection"] == {
        "input": "reqeust",
        "lemma": "request",
    }
    assert [
        item["lemma"] for item in payload["grounding"]["mainAnswer"]
    ] == ["request"]
    assert payload["answerSurface"]["type"] == "lookup"
    assert evidence.calls == [
        {
            "term": "reqeust",
            "active_exam_target": "cet4",
            "limit": 8,
        },
    ]
    assert llm.calls == []


def test_chat_spelling_ambiguity_builds_candidate_surface_context_and_bare_choice(
    tmp_path,
):
    evidence = FakeSpellingEvidenceProvider(
        {
            "frorm": spelling_result(
                "frorm",
                spelling_candidate("form"),
                spelling_candidate("farm"),
                spelling_candidate(
                    "firm",
                    in_active_exam_scope=False,
                ),
                spelling_candidate("foam", edit_distance=2),
            ),
        },
    )
    service = OrdinaryLookupService(
        repository=FakeRepository(),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=ecdict_fixture_lookup(
            ecdict_profile("form"),
            ecdict_profile("farm"),
            ecdict_profile("firm", in_cet4=False),
            ecdict_profile("foam"),
        ),
        spelling_candidate_provider=evidence,
        spelling_decision_policy=SpellingDecisionPolicy(),
    )
    client = create_client(
        ordinary_lookup_service=service,
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )
    llm = NeverCallProvider()
    client.app.state.provider = llm

    first_response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet4",
            "query": "frorm是什么意思",
            "history": [],
        },
    )

    first = first_response.json()
    candidate_lemmas = [
        item["lemma"] for item in first["grounding"]["candidates"]
    ]

    assert first_response.status_code == 200
    assert first["answerKind"] == "grounded"
    assert first["providerRequestId"] is None
    assert first["grounding"]["resolution"] == "needs_clarification"
    assert first["grounding"]["spellingDecision"] == "clarify_candidates"
    assert first["grounding"]["mainAnswer"] == []
    assert candidate_lemmas == ["form", "farm", "firm"]
    assert len(candidate_lemmas) <= 3
    assert first["grounding"]["candidates"][2]["inScope"] is False
    assert first["answerSurface"]["type"] == "candidate_list"
    assert [
        item["lemma"] for item in first["answerSurface"]["items"]
    ] == candidate_lemmas
    assert first["conversationContext"]["topicKind"] == "spelling_clarification"
    assert [
        item["lemma"] for item in first["conversationContext"]["candidates"]
    ] == candidate_lemmas
    assert llm.calls == []

    second_response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet4",
            "query": "第一个",
            "history": [],
            "conversationContext": first["conversationContext"],
        },
    )

    second = second_response.json()

    assert second_response.status_code == 200
    assert second["answerKind"] == "grounded"
    assert second["grounding"]["resolution"] == "resolved"
    assert second["grounding"]["matchType"] == "external_dictionary_exact"
    assert [
        item["lemma"] for item in second["grounding"]["mainAnswer"]
    ] == ["form"]
    assert second["resolvedFollowUp"]["kind"] == "resolved_query"
    assert second["resolvedFollowUp"]["query"] == "form"
    assert second["resolvedFollowUp"]["reason"] == "spelling_candidate_selection"
    assert [
        item["lemma"] for item in second["resolvedFollowUp"]["targetRefs"]
    ] == ["form"]
    assert evidence.calls == [
        {
            "term": "frorm",
            "active_exam_target": "cet4",
            "limit": 8,
        },
    ]
    assert llm.calls == []


def test_chat_spelling_global_top_clarifies_in_distance_order_and_can_be_selected(
    tmp_path,
):
    evidence = FakeSpellingEvidenceProvider(
        {
            "anlize": spelling_result(
                "anlize",
                spelling_candidate(
                    "alize",
                    in_active_exam_scope=False,
                ),
                spelling_candidate("analyze", edit_distance=2),
            ),
        },
    )
    service = OrdinaryLookupService(
        repository=FakeRepository(),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=ecdict_fixture_lookup(
            ecdict_profile("alize", in_cet4=False),
            ecdict_profile("analyze"),
        ),
        spelling_candidate_provider=evidence,
        spelling_decision_policy=SpellingDecisionPolicy(),
    )
    client = create_client(
        ordinary_lookup_service=service,
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )
    llm = NeverCallProvider()
    client.app.state.provider = llm

    first_response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet4",
            "query": "anlize是什么意思",
            "history": [],
        },
    )

    first = first_response.json()
    first_candidates = first["grounding"]["candidates"]

    assert first_response.status_code == 200
    assert first["grounding"]["resolution"] == "needs_clarification"
    assert first["grounding"]["spellingDecision"] == "clarify_candidates"
    assert [item["lemma"] for item in first_candidates] == ["alize", "analyze"]
    assert [item["inScope"] for item in first_candidates] == [False, True]
    assert first["grounding"]["scopeReminder"] == (
        "候选同时包含当前CET-4词书内和词书外结果，已按拼写接近度排序。"
    )
    assert [
        item["lemma"] for item in first["answerSurface"]["items"]
    ] == ["alize", "analyze"]
    assert [
        item["inScope"] for item in first["answerSurface"]["items"]
    ] == [False, True]

    second_response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet4",
            "query": "第一个",
            "history": [],
            "conversationContext": first["conversationContext"],
        },
    )

    second = second_response.json()

    assert second_response.status_code == 200
    assert second["grounding"]["resolution"] == "resolved"
    assert second["grounding"]["matchType"] == "external_dictionary_exact"
    assert [
        item["lemma"] for item in second["grounding"]["mainAnswer"]
    ] == ["alize"]
    assert second["grounding"]["mainAnswer"][0]["inScope"] is False
    assert second["grounding"]["scopeReminder"] == (
        "这次命中的词不在当前CET-4词书范围内，以下按全局 ECDICT 结果说明。"
    )
    assert second["resolvedFollowUp"]["reason"] == (
        "spelling_candidate_selection"
    )
    assert evidence.calls == [
        {
            "term": "anlize",
            "active_exam_target": "cet4",
            "limit": 8,
        },
    ]
    assert llm.calls == []


def test_chat_spelling_safe_rejections_stay_grounded_and_skip_outer_recovery(
    tmp_path,
):
    evidence = FakeSpellingEvidenceProvider(
        {
            "acess": spelling_result(
                "acess",
                status="candidate_source_unavailable",
                global_competition_complete=False,
            ),
            "xqzplm": spelling_result(
                "xqzplm",
                spelling_candidate("example", edit_distance=2),
            ),
        },
    )
    service = OrdinaryLookupService(
        repository=FakeRepository(),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=ecdict_fixture_lookup(ecdict_profile("example")),
        spelling_candidate_provider=evidence,
        spelling_decision_policy=SpellingDecisionPolicy(),
    )
    client = create_client(
        ordinary_lookup_service=service,
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=FailingIfCalled(),
    )
    llm = NeverCallProvider()
    client.app.state.provider = llm

    cases = [
        ("acess是什么意思", "candidate_source_unavailable"),
        ("xqzplm是什么意思", "random_like"),
    ]
    for query, expected_reason in cases:
        response = client.post(
            "/api/chat",
            json={
                "activeExamTarget": "cet4",
                "query": query,
                "history": [],
            },
        )
        payload = response.json()

        assert response.status_code == 200
        assert payload["answerKind"] == "grounded"
        assert payload["providerRequestId"] is None
        assert payload["grounding"]["resolution"] == "no_match"
        assert payload["grounding"]["spellingDecision"] == "no_reliable_candidate"
        assert payload["grounding"]["noMatchReason"] == expected_reason
        assert payload["grounding"]["mainAnswer"] == []

    assert [call["term"] for call in evidence.calls] == ["acess", "xqzplm"]
    assert llm.calls == []


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


def test_chat_emits_one_internal_trace_with_route_tools_and_pre_recovery_state():
    sink = InMemoryRetrievalTraceSink()
    service = RecordingService(
        grounding={
            "activeExamTarget": "cet6",
            "queryMode": "fuzzy_recall",
            "answerStyle": "standard_lookup",
            "resolution": "resolved",
            "noMatchReason": None,
            "mainAnswer": [{"lemma": "access"}],
            "confusionBoundary": [],
        },
    )
    client = create_client(
        ordinary_lookup_service=service,
        retrieval_trace_sink=sink,
    )
    client.app.state.retrieval_trace_include_raw_query = False

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
    assert len(sink.snapshots) == 1
    snapshot = sink.snapshots[0]
    assert snapshot["requestId"] == payload["requestId"]
    assert "rawQuery" not in snapshot
    assert snapshot["route"]["source"] == "rule"
    assert snapshot["route"]["queryMode"] == "fuzzy_recall"
    assert snapshot["route"]["normalizedSlots"]["englishTerms"] == ["access"]
    assert "raw" not in snapshot["route"]["normalizedSlots"]
    assert "normalizedText" not in snapshot["route"]["normalizedSlots"]
    assert snapshot["tools"] == {
        "attempted": ["ordinary_lookup"],
        "selected": "ordinary_lookup",
    }
    assert snapshot["candidates"][0]["lemma"] == "access"
    assert snapshot["candidates"][0]["rank"] == 1
    assert snapshot["preRecovery"] == {
        "resolution": "resolved",
        "noMatchReason": None,
        "spellingDecision": None,
    }
    assert snapshot["recovery"] == {
        "kind": "none",
        "providerOutcome": "not_attempted",
    }
    assert snapshot["final"] == {"statusCode": 200, "answerKind": "grounded"}
    assert {"route", "tool", "recovery", "total"} <= set(snapshot["latencyMs"])
    assert "trace" not in payload
    assert "retrievalTrace" not in payload


def test_chat_trace_preserves_pre_recovery_failure_and_provider_outcome():
    sink = InMemoryRetrievalTraceSink()
    no_match_service = RecordingService(
        answer="当前词库暂未稳定定位到你说的词",
        grounding=NO_MATCH_GROUNDING,
    )
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=no_match_service,
        retrieval_trace_sink=sink,
    )
    client.app.state.provider = RecordingProvider(answer="按学习问题接住。")

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "怎么学英语最快",
            "history": [],
        },
    )

    payload = response.json()
    assert response.status_code == 200
    assert payload["answer"] == "按学习问题接住。"
    assert len(sink.snapshots) == 1
    snapshot = sink.snapshots[0]
    assert snapshot["preRecovery"] == {
        "resolution": "no_match",
        "noMatchReason": "out_of_kb",
        "spellingDecision": None,
    }
    assert snapshot["recovery"] == {
        "kind": "provider_generated",
        "providerOutcome": "success",
    }
    assert snapshot["final"] == {"statusCode": 200, "answerKind": "plain"}
    assert "grounding" not in payload
    assert "trace" not in payload


def test_chat_trace_marks_provider_error_fallback_without_failing_chat():
    class FailingRecoveryProvider:
        def generate_answer(self, **_kwargs):
            raise ChatProviderError(
                "recovery provider failed",
                status_code=502,
                provider_request_id="provider_recovery_error",
            )

    sink = InMemoryRetrievalTraceSink()
    no_match_service = RecordingService(
        answer="当前词库暂未稳定定位到你说的词",
        grounding=NO_MATCH_GROUNDING,
    )
    client = create_client(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=no_match_service,
        retrieval_trace_sink=sink,
    )
    client.app.state.provider = FailingRecoveryProvider()

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "怎么学英语最快",
            "history": [],
        },
    )

    assert response.status_code == 200
    assert response.json()["answerKind"] == "plain"
    assert sink.snapshots[0]["recovery"] == {
        "kind": "deterministic_fallback",
        "providerOutcome": "error_fallback",
    }


def test_chat_trace_marks_safe_spelling_no_match_as_not_recovered():
    sink = InMemoryRetrievalTraceSink()
    provider = RecordingProvider(answer="must not invent a correction")
    service = RecordingService(
        answer="这次先不硬猜。",
        grounding={
            "activeExamTarget": "cet4",
            "queryMode": "fuzzy_recall",
            "answerStyle": "standard_lookup",
            "resolution": "no_match",
            "noMatchReason": "random_like",
            "spellingDecision": "no_reliable_candidate",
            "mainAnswer": [],
            "confusionBoundary": [],
        },
    )
    client = create_client(
        ordinary_lookup_service=service,
        retrieval_trace_sink=sink,
    )
    client.app.state.provider = provider

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet4",
            "query": "reqeust 是什么意思",
            "history": [],
        },
    )

    assert response.status_code == 200
    snapshot = sink.snapshots[0]
    assert snapshot["preRecovery"]["spellingDecision"] == "no_reliable_candidate"
    assert snapshot["recovery"] == {
        "kind": "none",
        "providerOutcome": "not_attempted",
    }
    assert provider.calls == []


def test_chat_trace_carries_spelling_candidates_without_public_trace(tmp_path):
    sink = InMemoryRetrievalTraceSink()
    spelling_provider = FakeSpellingEvidenceProvider(
        {
            "reqeust": spelling_result(
                "reqeust",
                spelling_candidate("request"),
            ),
        },
    )
    service = OrdinaryLookupService(
        repository=FakeRepository({}),
        source_lemma_base_dir=tmp_path,
        ecdict_lookup=ecdict_fixture_lookup(ecdict_profile("request")),
        spelling_candidate_provider=spelling_provider,
        spelling_decision_policy=SpellingDecisionPolicy(),
    )
    client = create_client(
        ordinary_lookup_service=service,
        retrieval_trace_sink=sink,
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet4",
            "query": "reqeust 是什么意思",
            "history": [],
        },
    )

    payload = response.json()
    assert response.status_code == 200
    snapshot = sink.snapshots[0]
    assert snapshot["candidates"][0]["lemma"] == "request"
    assert snapshot["candidates"][0]["editDistance"] == 1
    assert snapshot["spelling"]["decision"]["kind"] == "auto_correct"
    assert snapshot["preRecovery"]["spellingDecision"] == "auto_correct"
    assert {"candidate", "decision"} <= set(snapshot["latencyMs"])
    assert "trace" not in payload
    assert "retrievalTrace" not in payload


def test_chat_stream_reuses_post_chat_trace_lifecycle_exactly_once():
    sink = InMemoryRetrievalTraceSink()
    client = create_client(retrieval_trace_sink=sink)

    response = client.post(
        "/api/chat/stream",
        json={
            "activeExamTarget": "cet4",
            "query": "你好",
            "history": [],
        },
    )

    assert response.status_code == 200
    events = parse_sse_events(response.text)
    assert len(sink.snapshots) == 1
    snapshot = sink.snapshots[0]
    assert snapshot["requestId"] == response.headers["x-request-id"]
    assert snapshot["tools"] == {"attempted": [], "selected": None}
    assert snapshot["preRecovery"]["resolution"] == "not_observed"
    assert snapshot["final"] == {"statusCode": 200, "answerKind": "plain"}
    final_payload = next(data["payload"] for event, data in events if event == "final")
    assert "trace" not in final_payload
    assert "retrievalTrace" not in final_payload


def test_chat_stream_finalizes_trace_before_first_sse_event_is_consumed():
    sink = InMemoryRetrievalTraceSink()
    app = create_app(retrieval_trace_sink=sink)
    request = Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/api/chat/stream",
            "raw_path": b"/api/chat/stream",
            "query_string": b"",
            "headers": [],
            "client": ("testclient", 50000),
            "server": ("testserver", 80),
            "app": app,
            "state": {"request_id": "req_stream_before_meta"},
        },
    )
    payload = ChatRequest(
        activeExamTarget="cet4",
        query="你好",
        history=[],
    )

    response = asyncio.run(post_chat_stream(request, payload))

    assert response.status_code == 200
    assert len(sink.snapshots) == 1
    assert sink.snapshots[0]["requestId"] == "req_stream_before_meta"
    assert sink.snapshots[0]["final"] == {
        "statusCode": 200,
        "answerKind": "plain",
    }


def test_chat_trace_raw_query_requires_app_level_opt_in():
    sink = InMemoryRetrievalTraceSink()
    client = create_client(retrieval_trace_sink=sink)
    client.app.state.retrieval_trace_include_raw_query = True

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet4",
            "query": "你好",
            "history": [],
        },
    )

    assert response.status_code == 200
    assert sink.snapshots[0]["rawQuery"] == "你好"
    assert "trace" not in response.json()


def test_chat_trace_finalizes_provider_error_without_leaking_diagnostics():
    class FailingService:
        def answer(self, **_kwargs):
            raise ChatProviderError(
                "provider failed",
                status_code=502,
                provider_request_id="provider_req_trace_error",
            )

    sink = InMemoryRetrievalTraceSink()
    client = create_client(
        ordinary_lookup_service=FailingService(),
        retrieval_trace_sink=sink,
    )

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "complex 是什么意思",
            "history": [],
        },
    )

    payload = response.json()
    assert response.status_code == 502
    assert len(sink.snapshots) == 1
    snapshot = sink.snapshots[0]
    assert snapshot["tools"]["attempted"] == ["ordinary_lookup"]
    assert snapshot["tools"]["selected"] is None
    assert snapshot["final"] == {"statusCode": 502, "answerKind": "error"}
    assert "trace" not in payload


def test_chat_trace_marks_unexpected_recovery_provider_exception_before_500():
    class UnexpectedRecoveryProvider:
        def generate_answer(self, **_kwargs):
            raise RuntimeError("unexpected provider failure")

    sink = InMemoryRetrievalTraceSink()
    no_match_service = RecordingService(
        answer="当前词库暂未稳定定位到你说的词",
        grounding=NO_MATCH_GROUNDING,
    )
    app = create_app(
        ordinary_lookup_service=FailingIfCalled(),
        direct_compare_service=FailingIfCalled(),
        advanced_lookup_service=no_match_service,
        retrieval_trace_sink=sink,
    )
    app.state.provider = UnexpectedRecoveryProvider()
    client = TestClient(app, raise_server_exceptions=False)

    response = client.post(
        "/api/chat",
        json={
            "activeExamTarget": "cet6",
            "query": "怎么学英语最快",
            "history": [],
        },
    )

    assert response.status_code == 500
    assert len(sink.snapshots) == 1
    snapshot = sink.snapshots[0]
    assert snapshot["preRecovery"]["resolution"] == "no_match"
    assert snapshot["recovery"] == {
        "kind": "provider_generated",
        "providerOutcome": "error",
    }
    assert snapshot["final"] == {"statusCode": 500, "answerKind": "error"}
