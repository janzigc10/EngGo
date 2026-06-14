"use client";

import type {
  ChatApiErrorResponse,
  ChatApiRequestBody,
  ChatApiSuccessResponse,
  AnswerSurface,
  ChatStreamEvent,
} from "@/features/chat/types";

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

export function buildChatStreamApiUrl(baseUrl = getChatApiBaseUrl()) {
  return `${normalizeBaseUrl(baseUrl)}/api/chat/stream`;
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

export function postChatStreamRequest(body: ChatApiRequestBody) {
  return fetch(buildChatStreamApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonObject(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);

    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseStreamEventBlock(block: string): ChatStreamEvent | null {
  const lines = block.replace(/\r\n/g, "\n").split("\n");
  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  const data = parseJsonObject(dataLines.join("\n"));

  if (!data) {
    return null;
  }

  if (eventName === "meta" && typeof data.requestId === "string") {
    return {
      type: "meta",
      requestId: data.requestId,
    };
  }

  if (eventName === "answer_delta" && typeof data.text === "string") {
    return {
      type: "answer_delta",
      text: data.text,
    };
  }

  if (eventName === "surface_start" && isRecord(data.surface)) {
    return {
      type: "surface_start",
      surface: data.surface as AnswerSurface,
    };
  }

  if (eventName === "final" && isRecord(data.payload)) {
    return {
      type: "final",
      payload: data.payload as ChatApiSuccessResponse,
    };
  }

  if (eventName === "error" && isRecord(data.payload)) {
    return {
      type: "error",
      statusCode:
        typeof data.statusCode === "number" ? data.statusCode : undefined,
      payload: data.payload as ChatApiErrorResponse | ChatApiSuccessResponse,
    };
  }

  return null;
}

export async function readChatStreamResponse(
  response: Response,
  onEvent: (event: ChatStreamEvent) => void,
) {
  if (!response.body) {
    return false;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    buffer += decoder.decode(value, { stream: !done });

    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex >= 0) {
      const block = buffer.slice(0, boundaryIndex).trim();
      buffer = buffer.slice(boundaryIndex + 2);

      if (block) {
        const event = parseStreamEventBlock(block);

        if (event) {
          onEvent(event);
        }
      }

      boundaryIndex = buffer.indexOf("\n\n");
    }

    if (done) {
      break;
    }
  }

  const trailingBlock = buffer.trim();

  if (trailingBlock) {
    const event = parseStreamEventBlock(trailingBlock);

    if (event) {
      onEvent(event);
    }
  }

  return true;
}
