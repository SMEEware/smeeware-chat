import type { NextRequest } from "next/server";

import { CAPABILITIES_ENDPOINT } from "@/lib/chat/backend";
import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { MAX_ATTACHMENTS, UPLOAD_MAX_BYTES } from "@/lib/chat/attachments";

const unavailable = {
  sharing: false,
  uploads: false,
  uploads_max_bytes: UPLOAD_MAX_BYTES,
  uploads_max_files: MAX_ATTACHMENTS,
};

export async function GET(request: NextRequest) {
  try {
    const session = request.cookies.get(SESSION_COOKIE)?.value;
    const upstream = await fetch(CAPABILITIES_ENDPOINT, {
      headers: session ? { [SESSION_HEADER]: session } : {},
      signal: request.signal,
      cache: "no-store",
    });
    if (!upstream.ok) return Response.json(unavailable);
    return Response.json(await upstream.json());
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(unavailable);
  }
}
