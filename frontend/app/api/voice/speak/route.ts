import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { VOICE_ENDPOINT } from "@/lib/chat/backend";

/**
 * Einen Satz des Telefonats sprechen. Der MP3-Strom des Backends wird
 * unveraendert durchgereicht -- so kommen die ersten Bytes an, waehrend der
 * Rest noch erzeugt wird.
 */
export async function POST(request: NextRequest) {
  const sitzung = request.cookies.get(SESSION_COOKIE)?.value;
  let upstream: Response;
  try {
    upstream = await fetch(`${VOICE_ENDPOINT}/speak`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sitzung ? { [SESSION_HEADER]: sitzung } : {}),
      },
      body: await request.text(),
      signal: request.signal,
      cache: "no-store",
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { message: "Voice unavailable." } },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(upstream.body, {
      status: upstream.status === 200 ? 502 : upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(upstream.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
