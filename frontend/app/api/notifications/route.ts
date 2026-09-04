import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { NOTIFICATIONS_ENDPOINT } from "@/lib/chat/backend";

export async function GET(request: NextRequest) {
  return weiter(request, "GET", NOTIFICATIONS_ENDPOINT);
}

export async function POST(request: NextRequest) {
  return weiter(request, "POST", `${NOTIFICATIONS_ENDPOINT}/read`);
}

export async function DELETE(request: NextRequest) {
  return weiter(request, "DELETE", NOTIFICATIONS_ENDPOINT);
}

export async function weiter(
  request: NextRequest,
  method: string,
  url: string,
) {
  const sitzung = request.cookies.get(SESSION_COOKIE)?.value;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers: sitzung ? { [SESSION_HEADER]: sitzung } : undefined,
      signal: request.signal,
      cache: "no-store",
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { message: "Notifications are unavailable." } },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
