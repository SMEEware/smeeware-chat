import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { CHATS_ENDPOINT } from "@/lib/chat/backend";

type Context = { params: Promise<{ id: string }> };

async function forward(
  request: NextRequest,
  context: Context,
  method: "GET" | "PUT" | "PATCH" | "DELETE",
) {
  const { id } = await context.params;
  const body =
    method === "PUT" || method === "PATCH" ? await request.text() : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(`${CHATS_ENDPOINT}/${encodeURIComponent(id)}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...sitzung(request),
      },
      body,
      signal: request.signal,
      cache: "no-store",
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { message: "Chat history is unavailable." } },
      { status: 502 },
    );
  }

  if (upstream.status === 204) return new Response(null, { status: 204 });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET = (request: NextRequest, context: Context) =>
  forward(request, context, "GET");

export const PUT = (request: NextRequest, context: Context) =>
  forward(request, context, "PUT");

export const PATCH = (request: NextRequest, context: Context) =>
  forward(request, context, "PATCH");

export const DELETE = (request: NextRequest, context: Context) =>
  forward(request, context, "DELETE");

function sitzung(request: NextRequest): Record<string, string> {
  const wert = request.cookies.get(SESSION_COOKIE)?.value;
  return wert ? { [SESSION_HEADER]: wert } : {};
}
