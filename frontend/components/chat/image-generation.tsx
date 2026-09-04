"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { ImageIcon, LayersIcon, SparklesIcon } from "lucide-react";

import type { Bildlauf } from "@/lib/chat/image-runs";
import { cn } from "@/lib/utils";

export function ImageGeneration({ lauf }: { lauf: Bildlauf }) {
  const fertig = lauf.phase === "done";

  return (
    <div className="my-1 w-fit max-w-full">
      <div
        className={cn(
          "relative aspect-square w-full max-w-[22rem] overflow-hidden rounded-2xl border",
          "bg-muted/40 shadow-sm",
        )}
      >
        {lauf.url ? (
          <Blende src={lauf.url} alt={lauf.alt ?? ""} />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <ImageIcon className="size-8 text-muted-foreground/25" />
          </span>
        )}

        {!fertig ? (
          <>
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/50 via-transparent to-transparent" />
            <span className="image-sweep pointer-events-none absolute inset-0" />
          </>
        ) : null}

        <span
          className={cn(
            "absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full",
            "bg-background/85 px-2 py-1 text-[10px] font-medium backdrop-blur-sm",
            "transition-opacity duration-300",
            fertig ? "opacity-0" : "opacity-100",
          )}
        >
          <SparklesIcon className="size-3 animate-pulse text-primary" />
          <span className="text-muted-foreground">
            {lauf.url ? "refining…" : "generating…"}
          </span>
          <Uhr seit={lauf.startedAt} />
        </span>
      </div>

      {lauf.references ? (
        <p className="mt-1.5 flex items-center gap-1 pl-1 text-[11px] text-muted-foreground/60">
          <LayersIcon className="size-3 shrink-0" />
          from {lauf.references} reference
          {lauf.references === 1 ? "" : "s"}
        </p>
      ) : null}

      {lauf.alt ? (
        <p className="mt-1.5 line-clamp-1 pl-1 text-[11px] text-muted-foreground/60">
          {lauf.alt}
        </p>
      ) : null}
    </div>
  );
}

function Blende({ src, alt }: { src: string; alt: string }) {
  const [gezeigt, setGezeigt] = React.useState(src);
  const naechstes = src === gezeigt ? null : src;

  return (
    <>
      <img
        src={gezeigt}
        alt={alt}
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
      {naechstes ? (
        <img
          key={naechstes}
          src={naechstes}
          alt=""
          decoding="async"
          onLoad={() => setGezeigt(naechstes)}
          className="absolute inset-0 size-full object-cover opacity-0"
        />
      ) : null}
    </>
  );
}

function Uhr({ seit }: { seit: number }) {
  const [jetzt, setJetzt] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setJetzt(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="font-mono tabular-nums text-muted-foreground/60">
      {Math.max(0, Math.round((jetzt - seit) / 1000))}s
    </span>
  );
}
