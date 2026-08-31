import { TRANSCRIBE_ENDPOINT } from "@/lib/chat/backend";

/**
 * Die waehlbaren Transkriptions-Modelle durchreichen.
 *
 * Wie bei /api/models: die Liste haengt an Schluesseln und installierten
 * Programmen, und das weiss nur das Backend. Ist es weg, kommt eine leere
 * Liste statt eines Fehlers -- die Einstellungen zeigen dann schlicht
 * keine Auswahl, statt einen roten Kasten.
 */
export async function GET() {
  try {
    const upstream = await fetch(`${TRANSCRIBE_ENDPOINT}/models`, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json({ count: 0, default: "", groups: [], models: [] });
  }
}
