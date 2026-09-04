"use client";

import * as React from "react";

export type ServerEvent =
  | { type: "ready" }
  | {
      type: "toast";
      level: "info" | "success" | "warning" | "error";
      title: string;
      body?: string | null;
    }
  | { type: "system"; daten: unknown }
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
  | {
      type: "speech";
      phase: "start" | "done" | "error";
      run: string;
      url?: string;
      provider?: string;
      text?: string;
    };

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
          const bloecke = rest.split("\n\n");
          rest = bloecke.pop() ?? "";

          for (const block of bloecke) {
            for (const zeile of block.split("\n")) {
              if (!zeile.startsWith("data:")) continue;
              try {
                handlerRef.current(JSON.parse(zeile.slice(5).trim()));
              } catch {
              }
            }
          }
        }
      } catch {
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
