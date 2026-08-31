import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { ACCOUNT_ENDPOINT } from "@/lib/chat/backend";

/**
 * Konto und alle zugehoerigen Daten loeschen.
 *
 * Danach ist die Installation wie neu: das Backend hat Konto, Chats, Hinweise
 * und Anhaenge entfernt und jede Sitzung geschlossen. Also muss auch hier das
 * Cookie weg -- sonst wirkt die Oberflaeche noch angemeldet, obwohl es die
 * Sitzung nicht mehr gibt.
 */
export async function DELETE(request: NextRequest) {
  const sitzung = request.cookies.get(SESSION_COOKIE)?.value;

  let upstream: Response;
  try {
    upstream = await fetch(ACCOUNT_ENDPOINT, {
      method: "DELETE",
      headers: sitzung ? { [SESSION_HEADER]: sitzung } : undefined,
      // Das Loeschen faehrt Chats, Hinweise und Dateien an -- ein wenig mehr
      // Luft als bei den anderen Konto-Aufrufen.
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { error: { message: "Backend unreachable." } },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    // Der Fehler des Backends unveraendert weiter -- das Cookie bleibt, es
    // wurde ja nichts geloescht.
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const antwort = new Response(null, { status: 204 });
  antwort.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
  return antwort;
}
