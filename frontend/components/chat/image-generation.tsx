"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { ImageIcon, LayersIcon, SparklesIcon } from "lucide-react";

import type { ImageRun } from "@/lib/chat/image-runs";
import { cn } from "@/lib/utils";
import { useT } from "@/context/i18n-provider";

export function ImageGeneration({ runFor }: { runFor: ImageRun }) {
  const t = useT();
  const done = runFor.phase === "done";

  return (
    <div className="my-1 w-fit max-w-full">
      <div
        className={cn(
          "relative aspect-square w-full max-w-[22rem] overflow-hidden rounded-2xl border",
          "bg-muted/40 shadow-sm",
        )}
      >
        {runFor.url ? (
          <FadeImage src={runFor.url} alt={runFor.alt ?? ""} />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <ImageIcon className="size-8 text-muted-foreground/25" />
          </span>
        )}

        {!done ? (
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
            done ? "opacity-0" : "opacity-100",
          )}
        >
          <SparklesIcon className="size-3 animate-pulse text-primary" />
          <span className="text-muted-foreground">
            {runFor.url ? t("image.refining") : t("image.generating")}
          </span>
          <ElapsedClock since={runFor.startedAt} />
        </span>
      </div>

      {runFor.references ? (
        <p className="mt-1.5 flex items-center gap-1 pl-1 text-[11px] text-muted-foreground/60">
          <LayersIcon className="size-3 shrink-0" />
          {runFor.references === 1 ? t("image.fromRefsOne") : t("image.fromRefsMany", { count: runFor.references })}
        </p>
      ) : null}

      {runFor.alt ? (
        <p className="mt-1.5 line-clamp-1 pl-1 text-[11px] text-muted-foreground/60">
          {runFor.alt}
        </p>
      ) : null}
    </div>
  );
}

function FadeImage({ src, alt }: { src: string; alt: string }) {
  const [shown, setShown] = React.useState(src);
  const next = src === shown ? null : src;

  return (
    <>
      <img
        src={shown}
        alt={alt}
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
      {next ? (
        <img
          key={next}
          src={next}
          alt=""
          decoding="async"
          onLoad={() => setShown(next)}
          className="absolute inset-0 size-full object-cover opacity-0"
        />
      ) : null}
    </>
  );
}

function ElapsedClock({ since }: { since: number }) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="font-mono tabular-nums text-muted-foreground/60">
      {Math.max(0, Math.round((now - since) / 1000))}s
    </span>
  );
}
