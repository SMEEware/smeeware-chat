import type { StreamFrame } from "./types";

/**
 * Zerlegt einen SSE-Body in Frames, sobald sie ankommen.
 *
 * Das Gegenstueck zu `response.iter_lines()` im Python-Client: der Reader
 * liefert beliebig geschnittene Chunks, also puffern wir bis zum naechsten
 * Zeilenumbruch und geben erst dann eine Zeile weiter.
 */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<StreamFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // stream: true haelt angeschnittene Multibyte-Zeichen zurueck, statt
      // sie als Fragezeichen zu dekodieren.
      buffer += decoder.decode(value, { stream: true });

      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);

        // Leerzeile zwischen Frames, oder die "event:"-Zeile.
        if (!line || !line.startsWith("data:")) continue;

        const data = line.slice("data:".length).trim();
        if (data === "[DONE]") return;

        try {
          yield JSON.parse(data) as StreamFrame;
        } catch {
          // Halbes JSON kann hier nicht mehr auftauchen -- wir haben auf
          // die komplette Zeile gewartet. Also: kaputter Frame, ueberspringen.
        }
      }

      if (signal?.aborted) return;
    }
  } finally {
    // Bei Abbruch faellt die Verbindung weg und das Backend stoppt die
    // Generierung -- genau wie beim Ctrl+C im Python-Client.
    reader.cancel().catch(() => {});
  }
}

/** Fehlermeldung aus einer Nicht-200-Antwort des Proxys ziehen. */
export async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.error?.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
