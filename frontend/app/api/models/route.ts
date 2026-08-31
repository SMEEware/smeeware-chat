import { MODELS_ENDPOINT } from "@/lib/chat/backend";
import { FALLBACK_MODELS } from "@/lib/chat/models";
import type { ModelList } from "@/lib/chat/types";

/**
 * Reicht die Modellliste des Backends durch. Faellt das Backend aus, kommt
 * die Ausweichliste zurueck (HTTP 200), damit die Auswahl im Frontend nie
 * leer ist und der Chat mit dem Standardmodell weiterlaeuft.
 */
export async function GET() {
  try {
    const upstream = await fetch(MODELS_ENDPOINT, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });

    if (!upstream.ok) return Response.json(FALLBACK_MODELS);

    const data = (await upstream.json()) as ModelList;
    // Nur weiterreichen, wenn wirklich Modelle drin stehen.
    if (!Array.isArray(data.models) || data.models.length === 0) {
      return Response.json(FALLBACK_MODELS);
    }
    return Response.json(data);
  } catch {
    return Response.json(FALLBACK_MODELS);
  }
}
