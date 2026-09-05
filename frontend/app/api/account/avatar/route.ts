import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { ACCOUNT_ENDPOINT } from "@/lib/chat/backend";

export async function GET(request: NextRequest) {
  return weiter(request, "GET");
}

export async function PUT(request: NextRequest) {
  return weiter(request, "PUT", await request.formData());
}

export async function DELETE(request: NextRequest) {
  return weiter(request, "DELETE");
}

async function weiter(request: NextRequest, method: string, body?: FormData) {
  const sitzung = request.cookies.get(SESSION_COOKIE)?.value;

  let upstream: Response;
  try {
    upstream = await fetch(`${ACCOUNT_ENDPOINT}/avatar`, {
      method,
      headers: sitzung ? { [SESSION_HEADER]: sitzung } : undefined,
      body,
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
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "private, no-cache",
    },
  });
}
