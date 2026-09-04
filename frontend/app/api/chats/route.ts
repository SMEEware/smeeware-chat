import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { CHATS_ENDPOINT } from "@/lib/chat/backend";

export async function GET(request: NextRequest) {
  const url = new URL(CHATS_ENDPOINT);
  for (const key of ["limit", "offset"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) url.searchParams.set(key, value);
  }

  try {
    const upstream = await fetch(url, {
      headers: sitzung(request),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json(
      { error: { message: "Chat history is unavailable." } },
      { status: 502 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const upstream = await fetch(CHATS_ENDPOINT, {
      method: "DELETE",
      headers: sitzung(request),
      signal: request.signal,
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { message: "Chat history is unavailable." } },
      { status: 502 },
    );
  }
}

function sitzung(request: NextRequest): Record<string, string> | undefined {
  const wert = request.cookies.get(SESSION_COOKIE)?.value;
  return wert ? { [SESSION_HEADER]: wert } : undefined;
}
