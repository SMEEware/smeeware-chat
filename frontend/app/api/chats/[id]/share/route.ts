import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { CHATS_ENDPOINT } from "@/lib/chat/backend";

type Context = { params: Promise<{ id: string }> };

async function forward(
  request: NextRequest,
  context: Context,
  method: "POST" | "DELETE",
) {
  const { id } = await context.params;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${CHATS_ENDPOINT}/${encodeURIComponent(id)}/share`,
      {
        method,
        headers: session(request),
        signal: request.signal,
        cache: "no-store",
      },
    );
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { message: "Chat history is unavailable." } },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST = (request: NextRequest, context: Context) =>
  forward(request, context, "POST");

export const DELETE = (request: NextRequest, context: Context) =>
  forward(request, context, "DELETE");

function session(request: NextRequest): Record<string, string> {
  const value = request.cookies.get(SESSION_COOKIE)?.value;
  return value ? { [SESSION_HEADER]: value } : {};
}
