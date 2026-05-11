from collections.abc import Callable
from dataclasses import dataclass
import json
from typing import Any

import httpx


@dataclass(frozen=True)
class GenerateAnswerResult:
    answer: str
    provider_request_id: str | None


class ChatProviderError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        provider_request_id: str | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.provider_request_id = provider_request_id


def trim_trailing_slashes(value: str) -> str:
    return value.rstrip("/")


def is_chat_completions_endpoint(endpoint: str) -> bool:
    return endpoint.rstrip("/").lower().endswith("/chat/completions")


def strip_thinking_content(value: str) -> str:
    while "<think>" in value and "</think>" in value:
        start = value.find("<think>")
        end = value.find("</think>", start) + len("</think>")
        value = f"{value[:start]}{value[end:]}"

    return value.strip()


def extract_chat_completion_text(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""

    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(message, dict):
        return ""

    content = message.get("content")

    if isinstance(content, str):
        return strip_thinking_content(content)

    if not isinstance(content, list):
        return ""

    return "\n".join(
        item.get("text", "").strip()
        for item in content
        if isinstance(item, dict)
        and item.get("type") == "text"
        and isinstance(item.get("text"), str)
        and item.get("text", "").strip()
    ).strip()


def extract_responses_output_text(payload: dict[str, Any]) -> str:
    output = payload.get("output")
    if not isinstance(output, list):
        return ""

    chunks: list[str] = []
    for output_item in output:
        if not isinstance(output_item, dict):
            continue

        content = output_item.get("content")
        if not isinstance(content, list):
            continue

        for content_item in content:
            if (
                isinstance(content_item, dict)
                and content_item.get("type") == "output_text"
                and isinstance(content_item.get("text"), str)
            ):
                text = content_item["text"].strip()
                if text:
                    chunks.append(text)

    return "\n".join(chunks).strip()


def read_json_payload(response) -> dict[str, Any]:
    try:
        payload = response.json()
    except Exception:
        return {
            "error": {
                "message": (getattr(response, "text", "") or "").strip()
                or f"Request failed with status {response.status_code}.",
            },
        }

    return payload if isinstance(payload, dict) else {}


def provider_request_id_from(response, payload: dict[str, Any]) -> str | None:
    headers = getattr(response, "headers", {}) or {}
    return (
        headers.get("x-request-id")
        or headers.get("openai-request-id")
        or payload.get("id")
    )


def post_provider_request(post: Callable[..., object], endpoint: str, **kwargs):
    try:
        return post(endpoint, **kwargs)
    except httpx.TimeoutException as error:
        raise ChatProviderError(
            "OpenAI request timed out.",
            status_code=504,
        ) from error
    except httpx.HTTPError as error:
        raise ChatProviderError(
            "OpenAI request failed.",
            status_code=502,
        ) from error


def build_user_message(
    *,
    query: str,
    grounding: dict[str, Any] | None,
) -> str:
    if not grounding:
        return f"用户当前问题：{query}"

    return "\n".join(
        [
            f"用户当前问题：{query}",
            "",
            "请严格根据下面的 grounding 回答：",
            json.dumps(grounding, ensure_ascii=False, indent=2),
        ],
    )


class OpenAiChatProvider:
    def __init__(
        self,
        *,
        api_key: str | None,
        model: str = "gpt-5.4",
        base_url: str | None = None,
        endpoint: str | None = None,
        post: Callable[..., object] | None = None,
    ):
        self.api_key = api_key.strip() if api_key else None
        self.model = model
        self.endpoint = endpoint or (
            f"{trim_trailing_slashes(base_url)}/chat/completions"
            if base_url
            else "https://api.openai.com/v1/responses"
        )
        self.post = post or httpx.post

    def generate_answer(
        self,
        *,
        query: str,
        history: list[dict[str, str]],
        request_id: str,
        system_prompt: str,
        grounding: dict[str, Any] | None = None,
    ) -> GenerateAnswerResult:
        if not self.api_key:
            raise ChatProviderError(
                "OPENAI_API_KEY is not configured.",
                status_code=503,
            )

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "X-Client-Request-Id": request_id,
        }
        user_message = build_user_message(query=query, grounding=grounding)

        if is_chat_completions_endpoint(self.endpoint):
            response = post_provider_request(
                self.post,
                self.endpoint,
                headers=headers,
                json={
                    "model": self.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": system_prompt,
                        },
                        *history,
                        {
                            "role": "user",
                            "content": user_message,
                        },
                    ],
                },
                timeout=60,
            )
            payload = read_json_payload(response)
            provider_request_id = provider_request_id_from(response, payload)

            if response.status_code < 200 or response.status_code >= 300:
                raise ChatProviderError(
                    payload.get("error", {}).get("message")
                    or f"OpenAI Chat Completions request failed with status {response.status_code}.",
                    status_code=response.status_code,
                    provider_request_id=provider_request_id,
                )

            answer = extract_chat_completion_text(payload)
        else:
            response = post_provider_request(
                self.post,
                self.endpoint,
                headers=headers,
                json={
                    "model": self.model,
                    "reasoning": {"effort": "low"},
                    "instructions": system_prompt,
                    "input": [
                        *history,
                        {
                            "role": "user",
                            "content": user_message,
                        },
                    ],
                },
                timeout=60,
            )
            payload = read_json_payload(response)
            provider_request_id = provider_request_id_from(response, payload)

            if response.status_code < 200 or response.status_code >= 300:
                raise ChatProviderError(
                    payload.get("error", {}).get("message")
                    or f"OpenAI Responses API request failed with status {response.status_code}.",
                    status_code=response.status_code,
                    provider_request_id=provider_request_id,
                )

            answer = extract_responses_output_text(payload)

        if not answer:
            raise ChatProviderError(
                "OpenAI response returned no text output.",
                status_code=502,
                provider_request_id=provider_request_id,
            )

        return GenerateAnswerResult(
            answer=answer,
            provider_request_id=provider_request_id,
        )
