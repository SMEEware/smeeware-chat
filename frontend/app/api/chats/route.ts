import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { CHATS_ENDPOINT } from "@/lib/chat/backend";

/**
 * Die Liste der gespeicherten Chats. Wie bei /api/chat liegt die Adresse
 * des Backends serverseitig -- der Browser kennt nur diese Route.
 *
 * Anders als bei /api/models gibt es hier bewusst KEINE Ausweichliste: eine
 * leere Liste waere von "alle Chats weg" nicht zu unterscheiden. Faellt das
 * Backend aus, sagt die Sidebar das lieber.
 */
export async function GET(request: NextRequest) {
  const url = new URL(CHATS_ENDPOINT);
  for (const key of ["limit", "offset"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) url.searchParams.set(key, value);
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
      { error: { message: "Chat history is unavailable." } },
      { status: 502 },
    );
  }
}

/**
 * Die ganze Ablage leeren. Ein Aufruf statt N -- das Backend loescht in einer
 * Anweisung und kann deshalb nicht auf halbem Weg steckenbleiben.
 *
 * Laenger als beim Lesen: hier laeuft eine Schreiboperation ueber womoeglich
 * hunderte Zeilen, die 5 Sekunden der Liste waeren dafuer knapp bemessen.
 */
export async function DELETE(request: NextRequest) {
  try {
    const upstream = await fetch(CHATS_ENDPOINT, {
      method: "DELETE",
      headers: sitzung(request),
      signal: request.signal,
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { message: "Chat history is unavailable." } },
      { status: 502 },
    );
  }
}

/**
 * Die Sitzungskennung aus dem Cookie in den Header, den das Backend liest.
 *
 * Das Cookie ist httpOnly und bleibt es -- der Browser schickt es hierher,
 * und erst diese Route macht daraus einen Header fuers Backend. Ohne
 * Sitzung geht nichts mit: das Backend antwortet dann mit 401, und genau
 * das soll die Oberflaeche sehen.
 */
function sitzung(request: NextRequest): Record<string, string> | undefined {
  const wert = request.cookies.get(SESSION_COOKIE)?.value;
  return wert ? { [SESSION_HEADER]: wert } : undefined;
}
