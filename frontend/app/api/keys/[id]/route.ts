import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { KEYS_ENDPOINT } from "@/lib/chat/backend";

type Context = { params: Promise<{ id: string }> };

async function weiter(
  request: NextRequest,
  method: string,
  id: string,
  mitBody: boolean,
): Promise<Response> {
  const sitzung = request.cookies.get(SESSION_COOKIE)?.value;

  let upstream: Response;
  try {
    upstream = await fetch(`${KEYS_ENDPOINT}/${encodeURIComponent(id)}`, {
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

  if (upstream.status === 204) return new Response(null, { status: 204 });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  return weiter(request, "PATCH", id, true);
}

export async function DELETE(request: NextRequest, context: Context) {
  const { id } = await context.params;
  return weiter(request, "DELETE", id, false);
}
