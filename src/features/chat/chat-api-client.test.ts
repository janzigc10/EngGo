import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildChatApiUrl,
  buildChatStreamApiUrl,
  getChatApiBaseUrl,
  postChatRequest,
  postChatStreamRequest,
  readChatStreamResponse,
} from "@/features/chat/chat-api-client";
import type { ChatStreamEvent } from "@/features/chat/types";

const originalFastApiUrl = process.env.NEXT_PUBLIC_ENGGO_FASTAPI_URL;

afterEach(() => {
  if (originalFastApiUrl === undefined) {
    delete process.env.NEXT_PUBLIC_ENGGO_FASTAPI_URL;
  } else {
    process.env.NEXT_PUBLIC_ENGGO_FASTAPI_URL = originalFastApiUrl;
  }
  vi.restoreAllMocks();
});

describe("chat-api-client", () => {
  it("defaults browser chat requests to the local FastAPI backend", () => {
    delete process.env.NEXT_PUBLIC_ENGGO_FASTAPI_URL;

    expect(getChatApiBaseUrl()).toBe("http://127.0.0.1:8000");
    expect(buildChatApiUrl()).toBe("http://127.0.0.1:8000/api/chat");
  });

  it("uses NEXT_PUBLIC_ENGGO_FASTAPI_URL when configured", () => {
    process.env.NEXT_PUBLIC_ENGGO_FASTAPI_URL = " http://127.0.0.1:8010/ ";

    expect(getChatApiBaseUrl()).toBe("http://127.0.0.1:8010");
    expect(buildChatApiUrl()).toBe("http://127.0.0.1:8010/api/chat");
    expect(buildChatStreamApiUrl()).toBe("http://127.0.0.1:8010/api/chat/stream");
  });

  it("posts the chat contract directly to FastAPI", async () => {
    delete process.env.NEXT_PUBLIC_ENGGO_FASTAPI_URL;
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await postChatRequest({
      activeExamTarget: "cet6",
      activeWordbookId: "cet6-foundation-v1",
      query: "activity meaning",
      history: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          activeExamTarget: "cet6",
          activeWordbookId: "cet6-foundation-v1",
          query: "activity meaning",
          history: [],
        }),
      },
    );
  });

  it("posts stream requests directly to FastAPI", async () => {
    delete process.env.NEXT_PUBLIC_ENGGO_FASTAPI_URL;
    const fetchMock = vi.fn().mockResolvedValue(new Response(""));
    vi.stubGlobal("fetch", fetchMock);

    await postChatStreamRequest({
      activeExamTarget: "cet6",
      activeWordbookId: "cet6-foundation-v1",
      query: "tran开头的单词有哪些",
      history: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/chat/stream",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          activeExamTarget: "cet6",
          activeWordbookId: "cet6-foundation-v1",
          query: "tran开头的单词有哪些",
          history: [],
        }),
      },
    );
  });

  it("parses card-shell stream events", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'event: meta\ndata: {"requestId":"req_stream"}',
              'event: surface_start\ndata: {"surface":{"type":"compare","title":"Core","text":""}}',
              'event: answer_delta\ndata: {"text":"chunk"}',
              'event: final\ndata: {"payload":{"answer":"chunk","requestId":"req_stream","providerRequestId":"provider_1"}}',
              "",
            ].join("\n\n"),
          ),
        );
        controller.close();
      },
    });
    const events: ChatStreamEvent[] = [];

    await readChatStreamResponse(
      new Response(body),
      (event) => events.push(event),
    );

    expect(events.map((event) => event.type)).toEqual([
      "meta",
      "surface_start",
      "answer_delta",
      "final",
    ]);
    expect(events[1]).toMatchObject({
      type: "surface_start",
      surface: { type: "compare", title: "Core", text: "" },
    });
    expect(events[2]).toMatchObject({ type: "answer_delta", text: "chunk" });
  });
});
