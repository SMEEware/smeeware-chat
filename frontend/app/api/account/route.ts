import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { ACCOUNT_ENDPOINT } from "@/lib/chat/backend";

export async function DELETE(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;

  let upstream: Response;
  try {
    upstream = await fetch(ACCOUNT_ENDPOINT, {
      method: "DELETE",
      headers: session ? { [SESSION_HEADER]: session } : undefined,
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { error: { message: "Backend unreachable." } },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const response = new Response(null, { status: 204 });
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
  return response;
}
