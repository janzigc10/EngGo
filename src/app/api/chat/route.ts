import { NextResponse } from "next/server";
import { z } from "zod";

import { createChatService } from "@/features/answering/chat-service";
import { ChatProviderError } from "@/features/answering/chat-provider";
import { examScopeCodes } from "@/features/content/import-types";
import { createRequestId } from "@/features/observability/request-id";
import { retrieveCandidates } from "@/features/retrieval/retrieve-candidates";

export const runtime = "nodejs";

const chatRequestSchema = z.object({
  activeExamTarget: z.enum(examScopeCodes),
  query: z.string().trim().min(1, "query is required"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1, "message content is required"),
      }),
    )
    .default([]),
});

export async function POST(request: Request) {
  const requestId = createRequestId();
  const payload = await request.json().catch(() => null);
  const parsedRequest = chatRequestSchema.safeParse(payload);

  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: "请求体格式不正确。",
          details: parsedRequest.error.flatten(),
        },
        requestId,
      },
      {
        status: 400,
        headers: {
          "x-request-id": requestId,
        },
      },
    );
  }

  try {
    const retrievalResult = await retrieveCandidates({
      activeExamTarget: parsedRequest.data.activeExamTarget,
      query: parsedRequest.data.query,
    });
    const chatService = createChatService();
    const result = await chatService.answer({
      ...parsedRequest.data,
      retrievalResult,
      requestId,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "x-request-id": result.requestId,
      },
    });
  } catch (error) {
    if (error instanceof ChatProviderError && error.status === 503) {
      return NextResponse.json(
        {
          error: {
            code: "openai_unavailable",
            message: "OPENAI_API_KEY is not configured on the server.",
          },
          requestId,
          providerRequestId: error.providerRequestId,
        },
        {
          status: 503,
          headers: {
            "x-request-id": requestId,
          },
        },
      );
    }

    const providerRequestId =
      error instanceof ChatProviderError ? error.providerRequestId : null;
    const status = error instanceof ChatProviderError ? error.status : 500;

    return NextResponse.json(
      {
        error: {
          code: "chat_generation_failed",
          message: "当前回答服务暂时不可用，请稍后再试。",
        },
        requestId,
        providerRequestId,
      },
      {
        status,
        headers: {
          "x-request-id": requestId,
        },
      },
    );
  }
}
