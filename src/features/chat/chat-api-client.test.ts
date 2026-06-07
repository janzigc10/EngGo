import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildChatApiUrl,
  getChatApiBaseUrl,
  postChatRequest,
} from "@/features/chat/chat-api-client";

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
});
