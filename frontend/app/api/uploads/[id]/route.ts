import type { NextRequest } from "next/server";

import { UPLOADS_ENDPOINT } from "@/lib/chat/backend";
import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { id } = await context.params;

  let upstream: Response;
  try {
    const session = request.cookies.get(SESSION_COOKIE)?.value;
    upstream = await fetch(`${UPLOADS_ENDPOINT}/${encodeURIComponent(id)}`, {
      headers: session ? { [SESSION_HEADER]: session } : {},
      signal: request.signal,
      cache: "no-store",
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { code: "upload_unavailable", message: "Attachment is unavailable." } },
      { status: 502 },
    );
  }

  const headers = new Headers({
    "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
    "Cache-Control": upstream.headers.get("Cache-Control") ?? "private, no-store",
    "X-Content-Type-Options": upstream.headers.get("X-Content-Type-Options") ?? "nosniff",
  });
  const disposition = upstream.headers.get("Content-Disposition");
  if (disposition) headers.set("Content-Disposition", disposition);

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
