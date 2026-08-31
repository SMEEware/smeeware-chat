import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { CHAT_STREAM_ENDPOINT } from "@/lib/chat/backend";
import { parseSseStream } from "@/lib/chat/stream";
import { FALLBACK_SUGGESTIONS } from "@/lib/chat/suggestions";

/**
 * Das Modell bestimmt die drei Startvorschlaege selbst -- passend zu SEINER
 * Rolle aus dem System-Prompt, nicht zu einem festen Fachgebiet. Bewusst
 * kein "du bist ein Assistent fuer Softwareentwicklung o. ae.": das zwang
 * die Vorschlaege frueher in die IT-Ecke, egal welche Persona eingestellt
 * war. Steht keine Rolle fest, sollen es einfach abwechslungsreiche Themen
 * sein -- nicht per Reflex Technik. Wichtig bleibt: nur das JSON-Array,
 * keine Erklaerung, kurze Oberbegriffe statt Saetze.
 */
const PROMPT = [
  "Suggest three short topics a user could tap to start a conversation with you.",
  "Base them on your own role, expertise and personality as set by your system",
  "instructions -- whatever field that is.",
  "If your role points to no particular field, pick three varied, unrelated",
  "everyday topics instead.",
  "Do not lean on technology, programming or security unless your role is",
  "genuinely about that.",
  "Reply with ONLY a JSON array of exactly three strings.",
  "No other text, no markdown, no code fences.",
  "Each string is a short label of two to four words, in English.",
  'Format: ["Topic one", "Topic two", "Topic three"]',
].join(" ");

/**
 * Knappes Budget: es sind nur drei Begriffe, viel Reasoning braucht es
 * dafuer nicht. Reicht es doch nicht, bleibt es bei den Ausweichwerten.
 */
const MAX_TOKENS = 1500;

/**
 * Das Modell haelt sich nicht immer strikt ans Format. Deshalb wird das
 * erste eckige Klammerpaar herausgeschnitten, statt den ganzen Text als
 * JSON zu erwarten -- fuehrender Fliesstext oder ```json-Zaeune stoeren
 * so nicht.
 */
function extractSuggestions(raw: string): string[] | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const items = parsed
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    // Ueberlange Eintraege sind keine Oberbegriffe -- lieber verwerfen als
    // mitten im Wort abschneiden.
    .filter((value) => value.length > 0 && value.length <= 60);

  return items.length >= 3 ? items.slice(0, 3) : null;
}

export async function GET(request: NextRequest) {
  // Der in den Einstellungen gewaehlte System-Prompt, falls gesetzt -- so
  // passen die Vorschlaege zur Persona. Fehlt er, nimmt das Backend sein
  // Default.
  const prompt = request.nextUrl.searchParams.get("prompt");

  try {
    // Wie beim Chat: die Sitzung geht mit, falls das Backend online steht
    // und einen Ausweis verlangt -- sonst blieben die Startvorschlaege bei
    // eingeschaltetem REQUIRE_API_KEY dauerhaft auf den Ausweichwerten.
    const sitzung = request.cookies.get(SESSION_COOKIE)?.value;
    const upstream = await fetch(CHAT_STREAM_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sitzung ? { [SESSION_HEADER]: sitzung } : {}),
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: PROMPT }],
        max_tokens: MAX_TOKENS,
        ...(prompt ? { prompt } : {}),
      }),
      // Bricht der Client ab (Seitenwechsel), faellt auch diese Anfrage
      // weg; der Timeout deckelt den Fall eines stummen Backends.
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      return Response.json({ suggestions: FALLBACK_SUGGESTIONS });
    }

    let text = "";
    for await (const frame of parseSseStream(upstream.body, request.signal)) {
      if (frame.type === "content") text += frame.delta;
    }

    return Response.json({
      suggestions: extractSuggestions(text) ?? FALLBACK_SUGGESTIONS,
    });
  } catch {
    // Abbruch, Timeout oder Backend weg -- die Ausweichwerte halten die
    // Startseite funktionsfaehig.
    return Response.json({ suggestions: FALLBACK_SUGGESTIONS });
  }
}
