import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { CHATS_ENDPOINT } from "@/lib/chat/backend";

type Context = { params: Promise<{ id: string }> };

/**
 * Einen Chat oeffentlich lesbar machen -- oder das wieder zuruecknehmen.
 *
 * Beides braucht die Sitzung: der Verlauf liegt mit dem Schluessel der
 * angemeldeten Person verschluesselt, und nur in diesem Moment kann das
 * Backend ihn lesen, um die oeffentliche Kopie zu schreiben.
 */
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
        headers: sitzung(request),
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

function sitzung(request: NextRequest): Record<string, string> {
  const wert = request.cookies.get(SESSION_COOKIE)?.value;
  return wert ? { [SESSION_HEADER]: wert } : {};
}
