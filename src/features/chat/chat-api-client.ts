"use client";

import type { ChatApiRequestBody } from "@/features/chat/types";

const defaultFastApiBaseUrl = "http://127.0.0.1:8000";

function normalizeBaseUrl(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return defaultFastApiBaseUrl;
  }

  return trimmed.replace(/\/+$/, "");
}

export function getChatApiBaseUrl() {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_ENGGO_FASTAPI_URL);
}

export function buildChatApiUrl(baseUrl = getChatApiBaseUrl()) {
  return `${normalizeBaseUrl(baseUrl)}/api/chat`;
}

export function postChatRequest(body: ChatApiRequestBody) {
  return fetch(buildChatApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
