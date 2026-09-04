import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { FS_ENDPOINT } from "@/lib/chat/backend";

export async function GET(request: NextRequest) {
  const url = new URL(FS_ENDPOINT);
  for (const key of ["path", "all"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value !== null) url.searchParams.set(key, value);
  }

  try {
    const upstream = await fetch(url, {
      headers: sitzung(request),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json(
      { error: { message: "The directory browser is unavailable." } },
      { status: 502 },
    );
  }
}

function sitzung(request: NextRequest): Record<string, string> | undefined {
  const wert = request.cookies.get(SESSION_COOKIE)?.value;
  return wert ? { [SESSION_HEADER]: wert } : undefined;
}
