import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { VOICE_ENDPOINT } from "@/lib/chat/backend";

export async function POST(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  let upstream: Response;
  try {
    upstream = await fetch(`${VOICE_ENDPOINT}/speak`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { [SESSION_HEADER]: session } : {}),
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
