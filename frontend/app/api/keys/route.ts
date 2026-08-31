import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { KEYS_ENDPOINT } from "@/lib/chat/backend";

/**
 * Die API-Schluessel des Kontos -- ans Backend durchgereicht.
 *
 * Verwalten darf sie nur, wer angemeldet ist: die Sitzungskennung aus dem
 * httpOnly-Cookie geht als Kopf mit, das Backend prueft sie. Ohne Cookie
 * kommt von dort ein 401, das hier unveraendert weiterlaeuft.
 */
async function weiter(
  request: NextRequest,
  method: string,
  url: string,
  mitBody: boolean,
): Promise<Response> {
  const sitzung = request.cookies.get(SESSION_COOKIE)?.value;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers: {
        ...(mitBody ? { "Content-Type": "application/json" } : {}),
        ...(sitzung ? { [SESSION_HEADER]: sitzung } : {}),
      },
      body: mitBody ? await request.text() : undefined,
      signal: request.signal,
      cache: "no-store",
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { message: "Backend unreachable." } },
      { status: 502 },
    );
  }

  // 204 traegt keinen Rumpf -- den Body dann auch nicht anfassen.
  if (upstream.status === 204) return new Response(null, { status: 204 });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

export function GET(request: NextRequest) {
  return weiter(request, "GET", KEYS_ENDPOINT, false);
}

export function POST(request: NextRequest) {
  return weiter(request, "POST", KEYS_ENDPOINT, true);
}
