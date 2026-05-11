import { NextResponse } from "next/server";

import { createRequestId } from "@/features/observability/request-id";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const defaultFastApiBackendUrl = "http://127.0.0.1:8000";

function getBackendUrl() {
  return (
    process.env.ENGGO_BACKEND_URL?.trim() ||
    env.enggoBackendUrl ||
    defaultFastApiBackendUrl
  );
}

function buildBackendChatUrl(backendUrl: string) {
  return `${backendUrl.replace(/\/+$/, "")}/api/chat`;
}

async function proxyToBackend(payload: unknown, requestId: string, backendUrl: string) {
  try {
    const backendResponse = await fetch(buildBackendChatUrl(backendUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const responseText = await backendResponse.text();
    const backendRequestId =
      backendResponse.headers.get("x-request-id") ?? requestId;

    return new NextResponse(responseText, {
      status: backendResponse.status,
      headers: {
        "Content-Type": backendResponse.headers.get("content-type") ?? "application/json",
        "x-request-id": backendRequestId,
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "chat_generation_failed",
          message: "FastAPI 聊天后端暂时不可用，请先启动后端服务。",
        },
        requestId,
        providerRequestId: null,
      },
      {
        status: 500,
        headers: {
          "x-request-id": requestId,
        },
      },
    );
  }
}

export async function POST(request: Request) {
  const requestId = createRequestId();
  const payload = await request.json().catch(() => null);

  return proxyToBackend(payload, requestId, getBackendUrl());
}
