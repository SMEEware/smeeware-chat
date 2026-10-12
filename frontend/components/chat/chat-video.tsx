"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { ArrowUpRightIcon, PictureInPicture2Icon, PlayIcon } from "lucide-react";

import { useVideoWindow } from "@/lib/video-store";
import {
  PROVIDER_NAME,
  embedUrl,
  previewImage,
  type VideoSource,
} from "@/lib/video-source";
import { cn } from "@/lib/utils";
import { useT } from "@/context/i18n-provider";
import type { TranslateFn } from "@/lib/i18n/translate";

export function sourceName(source: VideoSource, t: TranslateFn): string {
  return source.kind === "embed" ? PROVIDER_NAME[source.provider] : t("video.video");
}

export function ChatVideo({
  source,
  poster,
  title,
}: {
  source: VideoSource;
  poster?: string;
  title?: string;
}) {
  const t = useT();
  const [running, setRunning] = React.useState(false);
  const minimize = useVideoWindow((z) => z.minimize);

  const image = poster ?? previewImage(source);
  const facade = !running && (source.kind === "embed" || image !== null);
  const embed = embedUrl(source, true);

  return (
    <span className="group/video relative my-2 block w-full max-w-md overflow-hidden rounded-xl ring-1 ring-border/70 ring-inset">
      <span className="relative block aspect-video w-full bg-muted/40">
        {facade ? (
          <button
            type="button"
            onClick={() => setRunning(true)}
            className="absolute inset-0 size-full cursor-pointer"
            aria-label={title ? t("video.playLabel", { title }) : t("video.playVideo")}
          >
            {image ? (
              <img
                src={image}
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
              {title ? (
                <span className="truncate text-[12px] font-medium text-white/95 drop-shadow">
                  {title}
                </span>
              ) : null}
              <span
                className={cn(
                  "shrink-0 rounded-md bg-black/45 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-white/80 backdrop-blur-sm",
                  title && "ms-auto",
                )}
              >
                {sourceName(source, t)}
              </span>
            </span>
          </button>
        ) : embed ? (
          <iframe
            src={embed}
            title={title || sourceName(source, t)}
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <video
            src={source.url}
            controls
            autoPlay={running}
            preload="metadata"
            playsInline
            className="absolute inset-0 size-full bg-black object-contain"
          />
        )}
      </span>

      <span className="pointer-events-none absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover/video:opacity-100 focus-within:opacity-100 max-md:opacity-100">
        <button
          type="button"
          onClick={() => minimize(source)}
          title={t("video.floatingWindow")}
          aria-label={t("video.floatingWindow")}
          className="pointer-events-auto flex size-7 cursor-pointer items-center justify-center rounded-lg bg-background/85 text-muted-foreground ring-1 ring-border/60 backdrop-blur transition-colors ring-inset hover:text-foreground"
        >
          <PictureInPicture2Icon className="size-3.5" />
        </button>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          title={t("video.openOriginal")}
          aria-label={t("video.openOriginal")}
          className="pointer-events-auto flex size-7 cursor-pointer items-center justify-center rounded-lg bg-background/85 text-muted-foreground ring-1 ring-border/60 backdrop-blur transition-colors ring-inset hover:text-foreground"
        >
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </span>
    </span>
  );
}

export function VideoContent({ source }: { source: VideoSource }) {
  const t = useT();
  const embed = embedUrl(source, true);

  if (embed) {
    return (
      <iframe
        src={embed}
        title={sourceName(source, t)}
        allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className="size-full border-0"
      />
    );
  }

  return (
    <video
      src={source.url}
      controls
      autoPlay
      playsInline
      className="size-full bg-black object-contain"
    />
  );
}

export function VideoCard({
  href,
  poster,
  title,
}: {
  href: string;
  poster: string;
  title?: string;
}) {
  const host = React.useMemo(() => {
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
          {title ? (
            <span className="truncate text-left text-[12px] font-medium text-white/95 drop-shadow">
              {title}
            </span>
          ) : null}
          {host ? (
            <span
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-white/80 backdrop-blur-sm",
                title && "ms-auto",
              )}
            >
              {host}
              <ArrowUpRightIcon className="size-2.5" />
            </span>
          ) : null}
        </span>
      </span>
    </a>
  );
}
