import type { StreamFrame } from "./types";

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
      // Ohne ``[DONE]`` zu Ende heisst: die Verbindung ist abgerissen --
      // Backend neu gestartet, Netz weg, ein Proxy hat zugemacht. Das als
      // normales Ende zu werten liess eine halbe Antwort als fertig stehen,
      // ohne dass der Nutzer je erfuhr, dass etwas fehlt.
      if (done) {
        if (signal?.aborted) return;
        throw new Error(
          "The connection closed before the answer was complete.",
        );
      }

      buffer += decoder.decode(value, { stream: true });

      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);

        if (!line || !line.startsWith("data:")) continue;

        const data = line.slice("data:".length).trim();
        if (data === "[DONE]") return;

        try {
          yield JSON.parse(data) as StreamFrame;
        } catch {
        }
      }

      if (signal?.aborted) return;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.error?.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
