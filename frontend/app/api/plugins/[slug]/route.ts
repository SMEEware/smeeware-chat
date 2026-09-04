import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { PLUGINS_ENDPOINT } from "@/lib/chat/backend";

type Context = { params: Promise<{ slug: string }> };

async function forward(
  request: NextRequest,
  context: Context,
  method: "POST" | "DELETE",
) {
  const { slug } = await context.params;

  let upstream: Response;
  try {
    upstream = await fetch(`${PLUGINS_ENDPOINT}/${encodeURIComponent(slug)}`, {
      method,
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

export const POST = (request: NextRequest, context: Context) =>
  forward(request, context, "POST");

export const DELETE = (request: NextRequest, context: Context) =>
  forward(request, context, "DELETE");

function sitzung(request: NextRequest): Record<string, string> {
  const wert = request.cookies.get(SESSION_COOKIE)?.value;
  return wert ? { [SESSION_HEADER]: wert } : {};
}
