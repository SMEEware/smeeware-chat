import { TTS_ENDPOINT } from "@/lib/chat/backend";

/**
 * Die waehlbaren Sprach-Modelle durchreichen.
 *
 * Wie bei /api/transcribe/models: die Liste haengt an einem Schluessel, und
 * das weiss nur das Backend. Ist es weg, kommt eine leere Liste statt eines
 * Fehlers -- die Einstellungen zeigen dann schlicht keine Auswahl.
 */
export async function GET() {
  try {
    const upstream = await fetch(`${TTS_ENDPOINT}/models`, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json({
      count: 0,
      default: "",
      groups: [],
      models: [],
      default_voice: "",
    });
  }
}
