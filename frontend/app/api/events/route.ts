import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { EVENTS_ENDPOINT } from "@/lib/chat/backend";

/**
 * Der Rueckkanal vom Backend, durchgereicht wie der Chat-Stream.
 *
 * Genau deshalb Server-Sent Events und kein WebSocket: eine Route wie diese
 * kann einen SSE-Koerper unveraendert weiterleiten und dabei das
 * httpOnly-Cookie in den Header uebersetzen, den das Backend liest. Ein
 * WebSocket liesse sich hier nicht durchreichen -- der Browser muesste am
 * Proxy vorbei direkt ans Backend, und die Sitzungskennung koennte er dabei
 * nicht mitgeben, weil sie fuer Skripte unlesbar ist.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sitzung = request.cookies.get(SESSION_COOKIE)?.value;

  let upstream: Response;
  try {
    upstream = await fetch(EVENTS_ENDPOINT, {
      headers: sitzung ? { [SESSION_HEADER]: sitzung } : undefined,
      // Kein Zeitlimit: der Strom soll offen bleiben.
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
