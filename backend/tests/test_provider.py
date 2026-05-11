import pytest
import httpx

from backend.app.answering.provider import (
    ChatProviderError,
    OpenAiChatProvider,
)


class FakeResponse:
    def __init__(self, *, status_code=200, payload=None, headers=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.headers = headers or {}
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError("not json")

        return self._payload


def test_provider_requires_api_key():
    provider = OpenAiChatProvider(api_key=None)

    with pytest.raises(ChatProviderError) as exc_info:
        provider.generate_answer(
            query="hello",
            history=[],
            request_id="req_missing_key",
            system_prompt="answer",
        )

    assert exc_info.value.status_code == 503
    assert exc_info.value.provider_request_id is None


def test_provider_calls_chat_completions_endpoint_and_extracts_answer():
    calls = []

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return FakeResponse(
            payload={"id": "payload_req", "choices": [{"message": {"content": "answer"}}]},
            headers={"x-request-id": "provider_req"},
        )

    provider = OpenAiChatProvider(
        api_key="sk-test",
        base_url="https://example.test/v1",
        model="model-test",
        post=post,
    )

    result = provider.generate_answer(
        query="access assess 怎么区分",
        history=[{"role": "user", "content": "previous"}],
        request_id="req_compare",
        system_prompt="system prompt",
        grounding={"answerStyle": "confusion_untangle", "mainAnswer": []},
    )

    assert result.answer == "answer"
    assert result.provider_request_id == "provider_req"
    assert calls[0][0] == "https://example.test/v1/chat/completions"
    assert calls[0][1]["headers"]["Authorization"] == "Bearer sk-test"
    assert calls[0][1]["headers"]["X-Client-Request-Id"] == "req_compare"
    assert calls[0][1]["json"]["model"] == "model-test"
    assert calls[0][1]["json"]["messages"][0] == {
        "role": "system",
        "content": "system prompt",
    }


def test_provider_calls_responses_endpoint_without_base_url():
    calls = []

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return FakeResponse(
            payload={
                "id": "response_req",
                "output": [
                    {
                        "content": [
                            {"type": "output_text", "text": "responses answer"},
                        ],
                    },
                ],
            },
        )

    provider = OpenAiChatProvider(api_key="sk-test", model="gpt-test", post=post)

    result = provider.generate_answer(
        query="hello",
        history=[],
        request_id="req_responses",
        system_prompt="system prompt",
    )

    assert result.answer == "responses answer"
    assert result.provider_request_id == "response_req"
    assert calls[0][0] == "https://api.openai.com/v1/responses"
    assert calls[0][1]["json"]["instructions"] == "system prompt"


def test_provider_raises_with_provider_request_id_on_non_ok_response():
    def post(_url, **_kwargs):
        return FakeResponse(
            status_code=429,
            payload={"id": "payload_req", "error": {"message": "rate limited"}},
            headers={"openai-request-id": "provider_req"},
        )

    provider = OpenAiChatProvider(api_key="sk-test", post=post)

    with pytest.raises(ChatProviderError) as exc_info:
        provider.generate_answer(
            query="hello",
            history=[],
            request_id="req_error",
            system_prompt="system prompt",
        )

    assert exc_info.value.status_code == 429
    assert exc_info.value.provider_request_id == "provider_req"


def test_provider_raises_when_response_has_no_text():
    def post(_url, **_kwargs):
        return FakeResponse(payload={"id": "payload_req", "output": []})

    provider = OpenAiChatProvider(api_key="sk-test", post=post)

    with pytest.raises(ChatProviderError) as exc_info:
        provider.generate_answer(
            query="hello",
            history=[],
            request_id="req_empty",
            system_prompt="system prompt",
        )

    assert exc_info.value.status_code == 502
    assert exc_info.value.provider_request_id == "payload_req"


def test_provider_maps_timeout_to_chat_provider_error():
    def post(_url, **_kwargs):
        raise httpx.ReadTimeout("provider timed out")

    provider = OpenAiChatProvider(
        api_key="sk-test",
        base_url="https://example.test/v1",
        post=post,
    )

    with pytest.raises(ChatProviderError) as exc_info:
        provider.generate_answer(
            query="hello",
            history=[],
            request_id="req_timeout",
            system_prompt="system prompt",
        )

    assert exc_info.value.status_code == 504
    assert exc_info.value.provider_request_id is None
