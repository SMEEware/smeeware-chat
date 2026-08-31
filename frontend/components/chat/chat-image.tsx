"use client";

// Absichtlich natives <img>: die Quellen sind beliebige fremde Hosts,
// die next/image nicht ohne Freigabe in next.config laden darf.
/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import {
  ArrowUpRightIcon,
  ExpandIcon,
  ImageOffIcon,
  Info,
  XIcon,
} from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { imageInfo } from "@/lib/image-info";
import { cn } from "@/lib/utils";

type ChatImageProps = {
  src?: string;
  alt?: string;
};

type Status = "loading" | "loaded" | "error";
type Box = { width: number; height: number };

/** Grenzen der Vorschau im Verlauf. */
const MAX_WIDTH = 448;
const MAX_HEIGHT = 320;

/** Obergrenze der Lightbox: größer wird nie skaliert. */
const LIGHTBOX_MAX_WIDTH = 896; // 56rem
/** Reserve für die Infoleiste unter dem Bild + Rand. */
const LIGHTBOX_VERTICAL_RESERVE = 160;

/** Skaliert einen Kasten so, dass er in maxW × maxH passt — nur verkleinern. */
function fit(natural: Box, maxW: number, maxH: number): Box {
  const scale = Math.min(1, maxW / natural.width, maxH / natural.height);
  return {
    width: Math.round(natural.width * scale),
    height: Math.round(natural.height * scale),
  };
}

/**
 * Kasten fuer die Vorschau. Ohne gemessene Maße ein 16:10-Feld -- das ist
 * der Fall bei SVGs, die nur ein viewBox mitbringen und deshalb gar keine
 * eigene Groesse haben.
 */
function boxFor(natural: Box | null): Box {
  if (!natural) {
    return { width: MAX_WIDTH, height: Math.round((MAX_WIDTH * 10) / 16) };
  }
  return fit(natural, MAX_WIDTH, MAX_HEIGHT);
}

/** Viewport-Maße mitlesen — die Lightbox braucht sie zum Einpassen. */
function useViewport(): Box {
  const [viewport, setViewport] = React.useState<Box>({ width: 0, height: 0 });

  React.useEffect(() => {
    const update = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return viewport;
}

/**
 * Kasten der Lightbox: natürliche Maße, eingepasst in den Viewport.
 * Liefert null, solange keine Maße bekannt sind — dann greift der
 * CSS-Fallback mit 16:10.
 */
function lightboxBox(natural: Box | null, viewport: Box): Box | null {
  if (!natural || viewport.width === 0 || viewport.height === 0) return null;
  const maxW = Math.min(LIGHTBOX_MAX_WIDTH, viewport.width - 32);
  const maxH = Math.max(240, viewport.height - LIGHTBOX_VERTICAL_RESERVE);
  return fit(natural, maxW, maxH);
}

/**
 * Bilder aus Modellantworten.
 *
 * Die Groesse steht am Container, nicht am Bild. Sonst leitet der
 * Container seine Breite vom Bild ab und das Bild seine von "100% des
 * Containers" -- bei Quellen ohne eigene Maße, also praktisch jedem SVG
 * mit blossem viewBox, faellt das auf null zusammen.
 *
 * Der Aufbau kommt ausserdem ohne <div> und <figure> aus: Markdown setzt
 * ein Bild in einen Absatz, und in <p> ist nur Phrasing Content erlaubt.
 */
export function ChatImage({ src, alt }: ChatImageProps) {
  const [status, setStatus] = React.useState<Status>("loading");
  const [natural, setNatural] = React.useState<Box | null>(null);
  const [open, setOpen] = React.useState(false);
  const viewport = useViewport();

  const caption = alt?.trim();
  const info = src ? imageInfo(src) : undefined;
  const box = boxFor(natural);
  const lightbox = lightboxBox(natural, viewport);

  const onLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    // Bei Quellen ohne eigene Maße meldet der Browser 0 -- dann bleibt es
    // beim Ersatzkasten.
    setNatural(
      naturalWidth > 0 && naturalHeight > 0
        ? { width: naturalWidth, height: naturalHeight }
        : null,
    );
    setStatus("loaded");
  };

  if (!src || status === "error") {
    return (
      <span className="my-3 inline-flex w-fit max-w-full items-center gap-2.5 rounded-2xl border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <ImageOffIcon className="size-4 shrink-0" />
        <span className="min-w-0 truncate">
          {caption || info?.name || "Image could not be loaded"}
        </span>
      </span>
    );
  }

  return (
    <>
      <span className="my-3 block max-w-full">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={caption ? `Enlarge ${caption}` : "Enlarge image"}
          // Feste Maße am Kasten, das Bild fuellt ihn nur noch aus.
          style={{
            width: box.width,
            aspectRatio: `${box.width} / ${box.height}`,
          }}
          className="group/image relative block max-w-full cursor-pointer overflow-hidden rounded-2xl border bg-muted/30 transition-shadow hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <img
            src={src}
            alt={caption ?? ""}
            loading="lazy"
            decoding="async"
            onLoad={onLoad}
            onError={() => setStatus("error")}
            className={cn(
              "block size-full object-contain transition-opacity duration-200",
              status === "loaded" ? "opacity-100" : "opacity-0",
            )}
          />

          {status === "loading" ? (
            <span className="absolute inset-0 animate-pulse bg-muted" />
          ) : (
            <span className="pointer-events-none absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-background/80 opacity-0 backdrop-blur-sm transition-opacity group-hover/image:opacity-100 group-focus-visible/image:opacity-100">
              <ExpandIcon className="size-3.5" />
            </span>
          )}
        </button>

        {caption ? (
          <span className="flex items-center space-x-2 ml-2 text-xs text-muted-foreground">
            <Info size={12} />
            <p>{caption}</p>
          </span>
        ) : null}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* DialogContent ist auf Formulare gemuenzt -- fuer eine Lightbox
            faellt der Kasten drumherum weg. Die Breite kommt explizit vom
            eingepassten Bild, die Höhe wächst mit der Infoleiste. */}
        <DialogContent
          className="w-auto max-w-none gap-0 border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-none"
          style={lightbox ? { width: lightbox.width } : undefined}
        >
          <DialogTitle className="sr-only">
            {caption || info?.name || "Image at full size"}
          </DialogTitle>

          <div
            // Auch hier braucht eine Quelle ohne eigene Maße einen Kasten,
            // sonst kollabiert sie im schrumpfenden Dialog genauso.
            style={
              lightbox
                ? {
                    width: lightbox.width,
                    aspectRatio: `${lightbox.width} / ${lightbox.height}`,
                  }
                : { width: "min(90vw, 56rem)", aspectRatio: "16 / 10" }
            }
            className="relative block max-w-full overflow-hidden rounded-2xl bg-card shadow-2xl"
          >
            <img
              src={src}
              alt={caption ?? ""}
              className="block size-full object-contain"
            />
          </div>

          {/* Infoleiste: Dateiname, Typ, Beschriftung, Original. */}
          <span className="mt-3 w-full flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border bg-background/80 px-4 py-2.5 backdrop-blur-md">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {info?.name}
            </span>

            {info?.type ? (
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-muted-foreground">
                {info.type}
              </span>
            ) : null}

            {natural ? (
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {natural.width}×{natural.height}
              </span>
            ) : null}

            {info?.href ? (
              <a
                href={info.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Open
                <ArrowUpRightIcon className="size-3.5" />
              </a>
            ) : null}

            {caption ? (
              <span className="w-full text-xs text-muted-foreground">
                {caption}
              </span>
            ) : null}
          </span>
        </DialogContent>
      </Dialog>
    </>
  );
}
