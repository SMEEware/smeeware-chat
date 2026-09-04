import type { NextRequest } from "next/server";

import { UPLOADS_ENDPOINT } from "@/lib/chat/backend";

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: { message: "Invalid upload." } },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(UPLOADS_ENDPOINT, {
      method: "POST",
      body: form,
      signal: request.signal,
      cache: "no-store",
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { message: "Uploads are unavailable." } },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
}
