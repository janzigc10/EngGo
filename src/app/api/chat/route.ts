import { appendFileSync } from "node:fs";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { createRequestId } from "@/features/observability/request-id";
import { env } from "@/lib/env";

const LOG_PATH = join(process.cwd(), ".runlogs", "chat-interaction.jsonl");

function logInteraction(entry: Record<string, unknown>) {
  try {
    appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // ignore log write failures
  }
}

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
  const startTime = Date.now();
  const query = (payload as Record<string, unknown>)?.query ?? "(unknown)";

  try {
    const backendResponse = await fetch(buildBackendChatUrl(backendUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const responseText = await backendResponse.text();
    const elapsed = Date.now() - startTime;
    const backendRequestId =
      backendResponse.headers.get("x-request-id") ?? requestId;

    let summary = "";
    let errorDetail = "";
    try {
      const parsed = JSON.parse(responseText);
      const answer = parsed?.answer ?? parsed?.message ?? "";
      summary = typeof answer === "string" ? answer.slice(0, 500) : JSON.stringify(answer).slice(0, 500);
      if (parsed?.error) {
        errorDetail = JSON.stringify(parsed.error).slice(0, 500);
      }
    } catch {
      summary = responseText.slice(0, 500);
    }

    logInteraction({
      ts: new Date().toISOString(),
      requestId: backendRequestId,
      query,
      status: backendResponse.status,
      elapsedMs: elapsed,
      answerSummary: summary,
      errorDetail: errorDetail || undefined,
      payloadKeys: payload ? Object.keys(payload as Record<string, unknown>) : null,
      activeExamTarget: (payload as Record<string, unknown>)?.activeExamTarget ?? null,
    });

    return new NextResponse(responseText, {
      status: backendResponse.status,
      headers: {
        "Content-Type": backendResponse.headers.get("content-type") ?? "application/json",
        "x-request-id": backendRequestId,
      },
    });
  } catch {
    const elapsed = Date.now() - startTime;
    logInteraction({
      ts: new Date().toISOString(),
      requestId,
      query,
      status: 500,
      elapsedMs: elapsed,
      error: "FastAPI unreachable",
    });

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
  const payload = await request.json().catch((err) => {
    logInteraction({
      ts: new Date().toISOString(),
      requestId,
      query: "(parse-error)",
      status: 400,
      elapsedMs: 0,
      errorDetail: `JSON parse failed: ${String(err)}`,
    });
    return null;
  });

  if (!payload) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "请求体为空或解析失败。" }, requestId, providerRequestId: null },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  return proxyToBackend(payload, requestId, getBackendUrl());
}
