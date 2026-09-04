import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { EVENTS_ENDPOINT } from "@/lib/chat/backend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sitzung = request.cookies.get(SESSION_COOKIE)?.value;

  let upstream: Response;
  try {
    upstream = await fetch(EVENTS_ENDPOINT, {
      headers: sitzung ? { [SESSION_HEADER]: sitzung } : undefined,
      signal: request.signal,
      cache: "no-store",
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { message: "Events are unavailable." } },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
