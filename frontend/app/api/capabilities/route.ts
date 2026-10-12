import type { NextRequest } from "next/server";

import { CAPABILITIES_ENDPOINT } from "@/lib/chat/backend";

export async function GET(request: NextRequest) {
  try {
    const upstream = await fetch(CAPABILITIES_ENDPOINT, {
      signal: request.signal,
      cache: "no-store",
    });
    if (!upstream.ok) return Response.json({ sharing: false });
    return Response.json(await upstream.json());
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json({ sharing: false });
  }
}
