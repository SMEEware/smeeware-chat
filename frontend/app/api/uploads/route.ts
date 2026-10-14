import type { NextRequest } from "next/server";

import { UPLOADS_ENDPOINT } from "@/lib/chat/backend";
import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("Content-Type");
  if (!request.body || !contentType || !/^multipart\/form-data\s*;/i.test(contentType)) {
    return Response.json(
      { error: { code: "invalid_upload", message: "Invalid upload." } },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    const session = request.cookies.get(SESSION_COOKIE)?.value;
    // Relay the multipart stream so large files are not buffered and repackaged
    // by Next.js before the backend can enforce its upload limits.
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        ...(session ? { [SESSION_HEADER]: session } : {}),
      },
      body: request.body,
      duplex: "half",
      signal: request.signal,
      cache: "no-store",
    };
    upstream = await fetch(UPLOADS_ENDPOINT, init);
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { code: "upload_unavailable", message: "Uploads are unavailable." } },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}
