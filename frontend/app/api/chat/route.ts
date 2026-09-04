import type { NextRequest } from "next/server";

import type { ChatRequestBody, WireMessage } from "@/lib/chat/types";
import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { CHAT_STREAM_ENDPOINT } from "@/lib/chat/backend";

const ENDPOINT = CHAT_STREAM_ENDPOINT;

const MAX_TOKENS = 8000;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function fail(message: string, status: number) {
  return Response.json({ error: { message } }, { status });
}

export async function POST(request: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request body.", 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return fail("No messages provided.", 400);
  }

  const messages: WireMessage[] = body.messages.map(({ role, content }) => ({
    role,
    content,
  }));

  let upstream: Response;
  try {
    const sitzung = request.cookies.get(SESSION_COOKIE)?.value;
    upstream = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sitzung ? { [SESSION_HEADER]: sitzung } : {}),
      },
      body: JSON.stringify({
        messages,
        model: body.model ?? undefined,
        max_tokens: body.max_tokens ?? MAX_TOKENS,
        prompt: body.prompt ?? undefined,
        tools: body.tools,
        voice_id: body.voice_id || undefined,
        tts_model: body.tts_model ?? undefined,
      }),
      signal: request.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      return fail("Backend timed out.", 504);
    }
    return fail(`Backend unreachable: ${ENDPOINT}`, 502);
  }

  if (!upstream.ok || !upstream.body) {
    let message = `HTTP ${upstream.status}`;
    try {
      const payload = await upstream.json();
      message = payload?.error?.message ?? message;
    } catch {
    }
    return fail(message, upstream.status === 200 ? 502 : upstream.status);
  }

  return new Response(upstream.body, { headers: SSE_HEADERS });
}

export async function GET() {
  const origin = new URL(ENDPOINT).origin;
  const start = performance.now();

  try {
    await fetch(origin, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    return Response.json({
      online: true,
      endpoint: ENDPOINT,
      latencyMs: Math.round(performance.now() - start),
    });
  } catch {
    return Response.json({
      online: false,
      endpoint: ENDPOINT,
      latencyMs: null,
    });
  }
}
