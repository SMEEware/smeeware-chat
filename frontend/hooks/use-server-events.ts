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
  | { type: "system"; data: unknown }
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
  active: boolean,
  onEvent: (event: ServerEvent) => void,
) {
  const handlerRef = React.useRef(onEvent);
  React.useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  React.useEffect(() => {
    if (!active) return;

    const controller = new AbortController();
    let aborted = false;
    let pause = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const read = async () => {
      try {
        const response = await fetch("/api/events", {
          signal: controller.signal,
          cache: "no-store",
        });

        if (response.status === 401 || !response.ok || !response.body) return;

        pause = 1000;
        const reader = response.body
          .pipeThrough(new TextDecoderStream())
          .getReader();

        let rest = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          rest += value;
          const blocks = rest.split("\n\n");
          rest = blocks.pop() ?? "";

          for (const block of blocks) {
            for (const line of block.split("\n")) {
              if (!line.startsWith("data:")) continue;
              try {
                handlerRef.current(JSON.parse(line.slice(5).trim()));
              } catch {
              }
            }
          }
        }
      } catch {
      }

      if (aborted) return;
      timer = setTimeout(read, pause);
      pause = Math.min(pause * 2, 30_000);
    };

    void read();

    return () => {
      aborted = true;
      if (timer !== null) clearTimeout(timer);
      controller.abort();
    };
  }, [active]);
}
