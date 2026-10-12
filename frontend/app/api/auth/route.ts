import type { NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  SESSION_HEADER,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { ACCOUNT_ENDPOINT } from "@/lib/chat/backend";

export async function GET(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;

  try {
    const upstream = await fetch(`${ACCOUNT_ENDPOINT}`, {
      headers: session ? { [SESSION_HEADER]: session } : undefined,
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json(
      { error: { message: "Backend unreachable." } },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode") === "setup"
    ? "setup"
    : "login";

  let upstream: Response;
  try {
    upstream = await fetch(`${ACCOUNT_ENDPOINT}/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { error: { message: "Backend unreachable." } },
      { status: 502 },
    );
  }

  const payload = await upstream.text();
  if (!upstream.ok) {
    return new Response(payload, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { session_id, username } = JSON.parse(payload) as {
    session_id: string;
    username: string;
  };

  const response = Response.json({ username });
  response.headers.append(
    "Set-Cookie",
    cookieLine(SESSION_COOKIE, session_id, sessionCookieOptions.maxAge),
  );
  return response;
}

export async function DELETE(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;

  try {
    await fetch(`${ACCOUNT_ENDPOINT}/logout`, {
      method: "POST",
      headers: session ? { [SESSION_HEADER]: session } : undefined,
      signal: AbortSignal.timeout(4000),
    });
  } catch {
  }

  const response = new Response(null, { status: 204 });
  response.headers.append("Set-Cookie", cookieLine(SESSION_COOKIE, "", 0));
  return response;
}

function cookieLine(name: string, value: string, maxAge: number): string {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

export async function PATCH(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;

  let upstream: Response;
  try {
    upstream = await fetch(ACCOUNT_ENDPOINT, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { [SESSION_HEADER]: session } : {}),
      },
      body: await request.text(),
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

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
