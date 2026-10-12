import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { NOTIFICATIONS_ENDPOINT } from "@/lib/chat/backend";

export async function GET(request: NextRequest) {
  return relay(request, "GET", NOTIFICATIONS_ENDPOINT);
}

export async function POST(request: NextRequest) {
  return relay(request, "POST", `${NOTIFICATIONS_ENDPOINT}/read`);
}

export async function DELETE(request: NextRequest) {
  return relay(request, "DELETE", NOTIFICATIONS_ENDPOINT);
}

export async function relay(
  request: NextRequest,
  method: string,
  url: string,
) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers: session ? { [SESSION_HEADER]: session } : undefined,
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
