import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { PROMPTS_ENDPOINT } from "@/lib/chat/backend";

export async function GET() {
  try {
    const upstream = await fetch(PROMPTS_ENDPOINT, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json({ count: 0, default: "default", prompts: [] });
  }
}

export async function POST(request: NextRequest) {
  return schreiben(request, "POST", PROMPTS_ENDPOINT, await request.text());
}

export async function schreiben(
  request: NextRequest,
  method: string,
  url: string,
  body?: string,
) {
  const sitzung = request.cookies.get(SESSION_COOKIE)?.value;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(sitzung ? { [SESSION_HEADER]: sitzung } : {}),
      },
      body,
      signal: request.signal,
      cache: "no-store",
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { message: "Prompts are unavailable." } },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
