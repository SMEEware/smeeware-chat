import type { NextRequest } from "next/server";

import { UPLOADS_ENDPOINT } from "@/lib/chat/backend";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { id } = await context.params;

  let upstream: Response;
  try {
    upstream = await fetch(`${UPLOADS_ENDPOINT}/${encodeURIComponent(id)}`, {
      signal: request.signal,
      cache: "no-store",
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { message: "Attachment is unavailable." } },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
