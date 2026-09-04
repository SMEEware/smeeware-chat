import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { PLUGINS_ENDPOINT } from "@/lib/chat/backend";

export async function GET(request: NextRequest) {
  let upstream: Response;
  try {
    upstream = await fetch(PLUGINS_ENDPOINT, {
      headers: sitzung(request),
      signal: request.signal,
      cache: "no-store",
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { message: "Plugins are unavailable." } },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

function sitzung(request: NextRequest): Record<string, string> {
  const wert = request.cookies.get(SESSION_COOKIE)?.value;
  return wert ? { [SESSION_HEADER]: wert } : {};
}
