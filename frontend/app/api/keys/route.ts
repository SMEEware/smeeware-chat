import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { KEYS_ENDPOINT } from "@/lib/chat/backend";

async function relay(
  request: NextRequest,
  method: string,
  url: string,
  withBody: boolean,
): Promise<Response> {
  const session = request.cookies.get(SESSION_COOKIE)?.value;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers: {
        ...(withBody ? { "Content-Type": "application/json" } : {}),
        ...(session ? { [SESSION_HEADER]: session } : {}),
      },
      body: withBody ? await request.text() : undefined,
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

  if (upstream.status === 204) return new Response(null, { status: 204 });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

export function GET(request: NextRequest) {
  return relay(request, "GET", KEYS_ENDPOINT, false);
}

export function POST(request: NextRequest) {
  return relay(request, "POST", KEYS_ENDPOINT, true);
}
