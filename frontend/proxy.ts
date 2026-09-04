import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/session";

export function proxy(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  if (CHAT_MIT_ID.test(request.nextUrl.pathname)) return NextResponse.next();

  const ziel = new URL("/login", request.url);
  ziel.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(ziel);
}

const CHAT_MIT_ID = /^\/chat\/[A-Za-z0-9_-]{1,64}\/?$/;

export const config = {
  matcher: ["/chat/:path*"],
};
