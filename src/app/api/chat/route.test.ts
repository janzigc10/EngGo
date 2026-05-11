import { afterEach, describe, expect, test, vi } from "vitest";

const validRequestBody = {
  activeExamTarget: "cet6",
  query: "access meaning",
  history: [],
};

function createPostRequest(body = validRequestBody) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function importRouteWithEnv(backendUrl?: string) {
  vi.resetModules();

  if (backendUrl) {
    process.env.ENGGO_BACKEND_URL = backendUrl;
  } else {
    delete process.env.ENGGO_BACKEND_URL;
  }

  return import("./route");
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ENGGO_BACKEND_URL;
});

describe("POST /api/chat backend split routing", () => {
  test("proxies to the default FastAPI backend when ENGGO_BACKEND_URL is unset", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: "default fastapi answer",
          answerKind: "plain",
          requestId: "py_default_request",
          providerRequestId: null,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "x-request-id": "py_default_request",
          },
        },
      ),
    );
    const retrieveCandidates = vi.fn();

    vi.stubGlobal("fetch", fetchSpy);
    vi.doMock("@/features/retrieval/retrieve-candidates", () => ({
      retrieveCandidates,
    }));
    vi.doMock("@/features/answering/chat-service", () => ({
      createChatService: () => ({
        answer: vi.fn(),
      }),
    }));
    vi.doMock("@/features/content/ecdict-basic-profiles", () => ({
      createEcdictBasicProfileLookup: () => vi.fn(),
    }));

    const { POST } = await importRouteWithEnv();
    const response = await POST(createPostRequest());
    const payload = await response.json();

    expect(retrieveCandidates).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/chat",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validRequestBody),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("py_default_request");
    expect(payload.answer).toBe("default fastapi answer");
  });

  test("uses ENGGO_BACKEND_URL as an override for the FastAPI backend", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: "fastapi answer",
          answerKind: "plain",
          requestId: "py_request",
          providerRequestId: null,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "x-request-id": "py_request",
          },
        },
      ),
    );
    const retrieveCandidates = vi.fn();

    vi.stubGlobal("fetch", fetchSpy);
    vi.doMock("@/features/retrieval/retrieve-candidates", () => ({
      retrieveCandidates,
    }));
    vi.doMock("@/features/answering/chat-service", () => ({
      createChatService: () => ({
        answer: vi.fn(),
      }),
    }));
    vi.doMock("@/features/content/ecdict-basic-profiles", () => ({
      createEcdictBasicProfileLookup: () => vi.fn(),
    }));

    const { POST } = await importRouteWithEnv("http://127.0.0.1:9000");
    const response = await POST(createPostRequest());
    const payload = await response.json();

    expect(retrieveCandidates).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://127.0.0.1:9000/api/chat",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validRequestBody),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("py_request");
    expect(payload.answer).toBe("fastapi answer");
  });

  test("maps FastAPI proxy failures to chat_generation_failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.doMock("@/features/retrieval/retrieve-candidates", () => ({
      retrieveCandidates: vi.fn(),
    }));
    vi.doMock("@/features/answering/chat-service", () => ({
      createChatService: () => ({
        answer: vi.fn(),
      }),
    }));
    vi.doMock("@/features/content/ecdict-basic-profiles", () => ({
      createEcdictBasicProfileLookup: () => vi.fn(),
    }));

    const { POST } = await importRouteWithEnv("http://127.0.0.1:8000");
    const response = await POST(createPostRequest());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe("chat_generation_failed");
    expect(payload.providerRequestId).toBeNull();
    expect(response.headers.get("x-request-id")).toBe(payload.requestId);
  });
});
