import type { NextRequest } from "next/server";

import type { ChatRequestBody, WireMessage } from "@/lib/chat/types";
import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { CHAT_STREAM_ENDPOINT } from "@/lib/chat/backend";

// Aus lib/chat/backend.ts, damit die Vorschlaege denselben Endpunkt treffen.
const ENDPOINT = CHAT_STREAM_ENDPOINT;

/**
 * 8000 mit Bedacht: das Entwerfen einer Raetselkette kostet gemessen
 * 1460-3529 Reasoning-Tokens, bevor das erste sichtbare Zeichen entsteht.
 * Bei 4000 kippt die Eroeffnung gelegentlich in eine leere Antwort.
 */
const MAX_TOKENS = 8000;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  // no-transform haelt Proxies davon ab, den Stream umzupacken und dabei
  // zu puffern -- sonst kommt alles auf einen Schlag an.
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function fail(message: string, status: number) {
  return Response.json({ error: { message } }, { status });
}

export async function POST(request: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request body.", 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return fail("No messages provided.", 400);
  }

  // Nur role und content weiterreichen. Der Gedankengang bleibt hier --
  // DeepSeek lehnt Anfragen ab, die das reasoning zurückspielen.
  const messages: WireMessage[] = body.messages.map(({ role, content }) => ({
    role,
    content,
  }));

  let upstream: Response;
  try {
    // Die Sitzungskennung geht mit, falls das Backend online steht und
    // REQUIRE_API_KEY verlangt: das eigene Frontend weist sich damit aus,
    // ohne dass jemand hier einen API-Schluessel hinterlegen muesste.
    const sitzung = request.cookies.get(SESSION_COOKIE)?.value;
    upstream = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sitzung ? { [SESSION_HEADER]: sitzung } : {}),
      },
      body: JSON.stringify({
        messages,
        // Modellwahl durchreichen. Fehlt sie, nimmt das Backend sein Default.
        model: body.model ?? undefined,
        max_tokens: body.max_tokens ?? MAX_TOKENS,
        // Und die Einstellungen. Sie hier zu vergessen faellt nicht auf:
        // das Backend hat fuer beide ein Default, die Anfrage laeuft also
        // durch -- nur eben mit Werkzeugen, die jemand abgeschaltet hat.
        prompt: body.prompt ?? undefined,
        tools: body.tools,
        // Fuers Vorlesen: die im Chat gewaehlte Stimme und das Sprach-Modell.
        // Ohne diese zwei Zeilen kam beim Backend nie an, was der Nutzer
        // eingestellt hat -- es sprach immer mit der Vorgabe-Stimme.
        voice_id: body.voice_id || undefined,
        tts_model: body.tts_model ?? undefined,
      }),
      // Bricht der Browser ab, faellt auch diese Verbindung weg und das
      // Backend stoppt die Generierung.
      signal: request.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      return fail("Backend timed out.", 504);
    }
    return fail(`Backend unreachable: ${ENDPOINT}`, 502);
  }

  // Fehler VOR dem ersten Byte -> ganz normaler HTTP-Status.
  if (!upstream.ok || !upstream.body) {
    let message = `HTTP ${upstream.status}`;
    try {
      const payload = await upstream.json();
      message = payload?.error?.message ?? message;
    } catch {
      // Antwort war kein JSON -- der Status muss reichen.
    }
    return fail(message, upstream.status === 200 ? 502 : upstream.status);
  }

  // Body unveraendert durchreichen: Frames kommen so an, wie sie entstehen.
  return new Response(upstream.body, { headers: SSE_HEADERS });
}

/** Erreichbarkeits-Check fuer die Statusanzeige im Header. */
export async function GET() {
  const origin = new URL(ENDPOINT).origin;
  const start = performance.now();

  try {
    await fetch(origin, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    // Auch ein 404 auf / beweist, dass jemand am Port lauscht.
    //
    // Die Zeit wird von hier aus genommen, nicht im Browser: dazwischen
    // liegen nur dieser Prozess und das Backend. Der Weg zum Browser
    // wuerde die Zahl um alles verfaelschen, was Next selbst braucht --
    // und danach fragt niemand, der auf eine Verbindungsanzeige schaut.
    return Response.json({
      online: true,
      endpoint: ENDPOINT,
      latencyMs: Math.round(performance.now() - start),
    });
  } catch {
    return Response.json({
      online: false,
      endpoint: ENDPOINT,
      latencyMs: null,
    });
  }
}
