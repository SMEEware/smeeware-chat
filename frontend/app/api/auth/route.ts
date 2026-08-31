import type { NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  SESSION_HEADER,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { ACCOUNT_ENDPOINT } from "@/lib/chat/backend";

/**
 * Anmelden, einrichten, abmelden.
 *
 * Das Passwort geht durch diese Route und nie weiter als bis zum Backend --
 * es landet in keinem Cookie und in keinem Speicher des Browsers. Zurueck
 * kommt eine Sitzungskennung, und die setzen wir als httpOnly-Cookie, damit
 * kein Skript sie lesen kann.
 */
export async function GET(request: NextRequest) {
  const sitzung = request.cookies.get(SESSION_COOKIE)?.value;

  try {
    const upstream = await fetch(`${ACCOUNT_ENDPOINT}`, {
      headers: sitzung ? { [SESSION_HEADER]: sitzung } : undefined,
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
  const modus = request.nextUrl.searchParams.get("mode") === "setup"
    ? "setup"
    : "login";

  let upstream: Response;
  try {
    upstream = await fetch(`${ACCOUNT_ENDPOINT}/${modus}`, {
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

  const nutzlast = await upstream.text();
  if (!upstream.ok) {
    return new Response(nutzlast, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { session_id, username } = JSON.parse(nutzlast) as {
    session_id: string;
    username: string;
  };

  const antwort = Response.json({ username });
  antwort.headers.append(
    "Set-Cookie",
    cookieZeile(SESSION_COOKIE, session_id, sessionCookieOptions.maxAge),
  );
  return antwort;
}

export async function DELETE(request: NextRequest) {
  const sitzung = request.cookies.get(SESSION_COOKIE)?.value;

  // Auch wenn das Backend nicht erreichbar ist: das Cookie muss weg. Sonst
  // sieht die Oberflaeche angemeldet aus, ohne es zu sein.
  try {
    await fetch(`${ACCOUNT_ENDPOINT}/logout`, {
      method: "POST",
      headers: sitzung ? { [SESSION_HEADER]: sitzung } : undefined,
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Egal -- die Sitzung im Backend laeuft ohnehin ab.
  }

  const antwort = new Response(null, { status: 204 });
  antwort.headers.append("Set-Cookie", cookieZeile(SESSION_COOKIE, "", 0));
  return antwort;
}

function cookieZeile(name: string, wert: string, maxAge: number): string {
  return [
    `${name}=${wert}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

/** Namen und Passwort aendern -- das Backend prueft die Sitzung. */
export async function PATCH(request: NextRequest) {
  const sitzung = request.cookies.get(SESSION_COOKIE)?.value;

  let upstream: Response;
  try {
    upstream = await fetch(ACCOUNT_ENDPOINT, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(sitzung ? { [SESSION_HEADER]: sitzung } : {}),
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
