"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { ArrowUpRightIcon, PictureInPicture2Icon, PlayIcon } from "lucide-react";

import { useVideoFenster } from "@/lib/video-store";
import {
  ANBIETER_NAME,
  embedUrl,
  vorschauBild,
  type VideoQuelle,
} from "@/lib/video-source";
import { cn } from "@/lib/utils";

export function quellenName(quelle: VideoQuelle): string {
  return quelle.kind === "embed" ? ANBIETER_NAME[quelle.anbieter] : "Video";
}

export function ChatVideo({
  quelle,
  poster,
  titel,
}: {
  quelle: VideoQuelle;
  poster?: string;
  titel?: string;
}) {
  const [laeuft, setLaeuft] = React.useState(false);
  const verkleinern = useVideoFenster((z) => z.verkleinern);

  const bild = poster ?? vorschauBild(quelle);
  const fassade = !laeuft && (quelle.kind === "embed" || bild !== null);
  const einbettung = embedUrl(quelle, true);

  return (
    <span className="group/video relative my-2 block w-full max-w-md overflow-hidden rounded-xl ring-1 ring-border/70 ring-inset">
      <span className="relative block aspect-video w-full bg-muted/40">
        {fassade ? (
          <button
            type="button"
            onClick={() => setLaeuft(true)}
            className="absolute inset-0 size-full cursor-pointer"
            aria-label={titel ? `Play: ${titel}` : "Play video"}
          >
            {bild ? (
              <img
                src={bild}
                alt=""
                className="size-full object-cover transition-transform duration-500 group-hover/video:scale-[1.03]"
              />
            ) : (
              <span className="absolute inset-0 bg-gradient-to-br from-muted/70 to-muted/30" />
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-background/90 shadow-lg ring-1 ring-border/50 backdrop-blur transition-transform duration-300 ring-inset group-hover/video:scale-110">
                <PlayIcon className="ms-0.5 size-6 fill-primary text-primary" />
              </span>
            </span>
            <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 pb-2.5 text-left">
              {titel ? (
                <span className="truncate text-[12px] font-medium text-white/95 drop-shadow">
                  {titel}
                </span>
              ) : null}
              <span
                className={cn(
                  "shrink-0 rounded-md bg-black/45 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-white/80 backdrop-blur-sm",
                  titel && "ms-auto",
                )}
              >
                {quellenName(quelle)}
              </span>
            </span>
          </button>
        ) : einbettung ? (
          <iframe
            src={einbettung}
            title={titel || quellenName(quelle)}
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <video
            src={quelle.url}
            controls
            autoPlay={laeuft}
            preload="metadata"
            playsInline
            className="absolute inset-0 size-full bg-black object-contain"
          />
        )}
      </span>

      <span className="pointer-events-none absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover/video:opacity-100 focus-within:opacity-100 max-md:opacity-100">
        <button
          type="button"
          onClick={() => verkleinern(quelle)}
          title="Play in a floating window"
          aria-label="Play in a floating window"
          className="pointer-events-auto flex size-7 cursor-pointer items-center justify-center rounded-lg bg-background/85 text-muted-foreground ring-1 ring-border/60 backdrop-blur transition-colors ring-inset hover:text-foreground"
        >
          <PictureInPicture2Icon className="size-3.5" />
        </button>
        <a
          href={quelle.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open the original"
          aria-label="Open the original"
          className="pointer-events-auto flex size-7 cursor-pointer items-center justify-center rounded-lg bg-background/85 text-muted-foreground ring-1 ring-border/60 backdrop-blur transition-colors ring-inset hover:text-foreground"
        >
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </span>
    </span>
  );
}

export function VideoInhalt({ quelle }: { quelle: VideoQuelle }) {
  const einbettung = embedUrl(quelle, true);

  if (einbettung) {
    return (
      <iframe
        src={einbettung}
        title={quellenName(quelle)}
        allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className="size-full border-0"
      />
    );
  }

  return (
    <video
      src={quelle.url}
      controls
      autoPlay
      playsInline
      className="size-full bg-black object-contain"
    />
  );
}

export function VideoKarte({
  href,
  poster,
  titel,
}: {
  href: string;
  poster: string;
  titel?: string;
}) {
  const wirt = React.useMemo(() => {
    try {
      return new URL(href).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }, [href]);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group/video relative my-2 block w-full max-w-md overflow-hidden rounded-xl ring-1 ring-border/70 transition-shadow ring-inset hover:ring-border"
    >
      <span className="relative block aspect-video w-full bg-muted/40">
        <img
          src={poster}
          alt=""
          className="size-full object-cover transition-transform duration-500 group-hover/video:scale-[1.03]"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />

        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-background/90 shadow-lg ring-1 ring-border/50 backdrop-blur transition-transform duration-300 ring-inset group-hover/video:scale-110">
            <PlayIcon className="ms-0.5 size-6 fill-primary text-primary" />
          </span>
        </span>

        <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 pb-2.5">
          {titel ? (
            <span className="truncate text-left text-[12px] font-medium text-white/95 drop-shadow">
              {titel}
            </span>
          ) : null}
          {wirt ? (
            <span
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-white/80 backdrop-blur-sm",
                titel && "ms-auto",
              )}
            >
              {wirt}
              <ArrowUpRightIcon className="size-2.5" />
            </span>
          ) : null}
        </span>
      </span>
    </a>
  );
}
