"use client";

import * as React from "react";

/** Was das Backend ueber den Rueckkanal schicken kann. */
export type ServerEvent =
  | { type: "ready" }
  | {
      type: "toast";
      level: "info" | "success" | "warning" | "error";
      title: string;
      body?: string | null;
    }
  | { type: "system"; daten: unknown }
  // Eine Bilderzeugung meldet sich: erst "start", dann je Zwischenstand
  // ein "partial", zuletzt "done". Siehe lib/chat/image-runs.ts.
  | {
      type: "image";
      phase: "start" | "partial" | "done" | "error";
      run: string;
      url?: string;
      alt?: string;
      prompt?: string;
      index?: number;
      references?: number;
    }
  // Vorlesen: "start" wenn die Synthese beginnt, "done" mit der fertigen
  // Audio-Adresse, "error" wenn es schiefging. Siehe lib/chat/speech-runs.ts.
  | {
      type: "speech";
      phase: "start" | "done" | "error";
      run: string;
      url?: string;
      provider?: string;
      text?: string;
    };

/**
 * Der Rueckkanal vom Backend.
 *
 * Kein ``EventSource``, obwohl es fuer SSE gemacht ist: das kann man nicht
 * abbrechen lassen, ohne die Instanz wegzuwerfen, und es reicht Fehler nur
 * als Ereignis ohne Status weiter -- eine abgelaufene Sitzung waere von
 * einem Netzwerkfehler nicht zu unterscheiden. Mit ``fetch`` sieht man den
 * 401 und kann aufhoeren, statt endlos neu zu verbinden.
 *
 * Wiederverbinden mit wachsender Pause: ein neu gestartetes Backend ist
 * nach ein paar Sekunden wieder da, ein abgeschaltetes nie -- und dann soll
 * der Browser nicht jede Sekunde anklopfen.
 */
export function useServerEvents(
  aktiv: boolean,
  onEvent: (ereignis: ServerEvent) => void,
) {
  const handlerRef = React.useRef(onEvent);
  React.useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  React.useEffect(() => {
    if (!aktiv) return;

    const controller = new AbortController();
    let abgebrochen = false;
    let pause = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const lesen = async () => {
      try {
        const antwort = await fetch("/api/events", {
          signal: controller.signal,
          cache: "no-store",
        });

        // Nicht angemeldet: es hat keinen Sinn, es weiter zu versuchen.
        // Um die Weiterleitung kuemmert sich der QueryClient.
        if (antwort.status === 401 || !antwort.ok || !antwort.body) return;

        pause = 1000;
        const leser = antwort.body
          .pipeThrough(new TextDecoderStream())
          .getReader();

        let rest = "";
        for (;;) {
          const { done, value } = await leser.read();
          if (done) break;

          rest += value;
          // SSE trennt Nachrichten durch eine Leerzeile.
          const bloecke = rest.split("\n\n");
          rest = bloecke.pop() ?? "";

          for (const block of bloecke) {
            for (const zeile of block.split("\n")) {
              if (!zeile.startsWith("data:")) continue;
              try {
                handlerRef.current(JSON.parse(zeile.slice(5).trim()));
              } catch {
                // Ein kaputtes Frame ist kein Grund, den Strom aufzugeben.
              }
            }
          }
        }
      } catch {
        // Verbindung weg -- unten wird neu versucht.
      }

      if (abgebrochen) return;
      timer = setTimeout(lesen, pause);
      pause = Math.min(pause * 2, 30_000);
    };

    void lesen();

    return () => {
      abgebrochen = true;
      if (timer !== null) clearTimeout(timer);
      controller.abort();
    };
  }, [aktiv]);
}
