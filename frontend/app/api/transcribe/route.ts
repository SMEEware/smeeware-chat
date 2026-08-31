import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { TRANSCRIBE_ENDPOINT } from "@/lib/chat/backend";

/**
 * Spracheingabe ans Backend durchreichen.
 *
 * GET fragt nur, ob es benutzbar ist -- das Frontend blendet das Mikrofon
 * sonst aus, statt einen Knopf zu zeigen, der sicher scheitert.
 */
export async function GET(request: NextRequest) {
  // Das gewaehlte Modell steht in der Query und muss mit: die Frage
  // "geht das?" hat fuer whisper.cpp eine andere Antwort als fuer OpenAI.
  const suche = new URL(request.url).search;

  try {
    const upstream = await fetch(`${TRANSCRIBE_ENDPOINT}${suche}`, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // Kein Backend heisst: kein Mikrofon. Das ist kein Fehler, ueber den
    // jemand etwas lesen muss -- der Knopf bleibt einfach weg.
    return Response.json({ available: false, reason: "Backend unreachable." });
  }
}

/**
 * Die Aufnahme selbst. Wie bei den Anhaengen wird das Formular neu
 * aufgebaut, damit fetch die Grenzmarkierung setzt.
 *
 * Kein eigenes Zeitlimit: whisper.cpp braucht fuer eine lange Aufnahme
 * seine Zeit, und das Backend hat dafuer bereits eines.
 */
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: { message: "Invalid recording." } },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    const sitzung = request.cookies.get(SESSION_COOKIE)?.value;
    upstream = await fetch(TRANSCRIBE_ENDPOINT, {
      method: "POST",
      body: form,
      headers: sitzung ? { [SESSION_HEADER]: sitzung } : undefined,
      signal: request.signal,
      cache: "no-store",
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { message: "Transcription is unavailable." } },
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
