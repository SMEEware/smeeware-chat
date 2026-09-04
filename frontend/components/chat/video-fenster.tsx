"use client";

import * as React from "react";
import { GripHorizontalIcon, Maximize2Icon, XIcon } from "lucide-react";

import { VideoInhalt, quellenName } from "@/components/chat/chat-video";
import { useVideoFenster } from "@/lib/video-store";

const BREITE = 320;
const HOEHE = 180;
const RAND = 16;

function einpassen(x: number, y: number) {
  return {
    x: Math.min(Math.max(x, RAND), Math.max(RAND, window.innerWidth - BREITE - RAND)),
    y: Math.min(Math.max(y, RAND), Math.max(RAND, window.innerHeight - HOEHE - RAND)),
  };
}

export function VideoFenster() {
  const { video, position, schliessen, setPosition } = useVideoFenster();
  const rahmenRef = React.useRef<HTMLDivElement>(null);
  const zugRef = React.useRef<{ dx: number; dy: number } | null>(null);
  const letzteRef = React.useRef<{ x: number; y: number } | null>(null);
  const [zieht, setZieht] = React.useState(false);

  React.useEffect(() => {
    const rahmen = rahmenRef.current;
    if (!rahmen || !video) return;

    const start =
      position ??
      einpassen(window.innerWidth - BREITE - RAND, window.innerHeight - HOEHE - RAND);
    letzteRef.current = start;
    rahmen.style.transform = `translate3d(${start.x}px, ${start.y}px, 0)`;
  }, [video, position]);

  React.useEffect(() => {
    if (!video) return;
    const beiGroesse = () => {
      const letzte = letzteRef.current;
      const rahmen = rahmenRef.current;
      if (!letzte || !rahmen) return;
      const neu = einpassen(letzte.x, letzte.y);
      letzteRef.current = neu;
      rahmen.style.transform = `translate3d(${neu.x}px, ${neu.y}px, 0)`;
    };
    window.addEventListener("resize", beiGroesse);
    return () => window.removeEventListener("resize", beiGroesse);
  }, [video]);

  if (!video) return null;

  const anfassen = (event: React.PointerEvent) => {
    const letzte = letzteRef.current;
    if (!letzte) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    zugRef.current = { dx: event.clientX - letzte.x, dy: event.clientY - letzte.y };
    if (rahmenRef.current) rahmenRef.current.style.willChange = "transform";
    setZieht(true);
  };

  const ziehen = (event: React.PointerEvent) => {
    const zug = zugRef.current;
    const rahmen = rahmenRef.current;
    if (!zug || !rahmen) return;
    const neu = einpassen(event.clientX - zug.dx, event.clientY - zug.dy);
    letzteRef.current = neu;
    rahmen.style.transform = `translate3d(${neu.x}px, ${neu.y}px, 0)`;
  };

  const loslassen = () => {
    if (!zugRef.current) return;
    zugRef.current = null;
    if (rahmenRef.current) rahmenRef.current.style.willChange = "auto";
    setZieht(false);
    if (letzteRef.current) setPosition(letzteRef.current);
  };

  return (
    <div
      ref={rahmenRef}
      style={{ width: BREITE }}
      className={[
        "fixed top-0 left-0 z-50 overflow-hidden rounded-xl bg-background shadow-2xl shadow-black/20 ring-1 ring-border/70 ring-inset dark:shadow-black/50",
        "animate-in fade-in zoom-in-95 duration-200",
        zieht ? "cursor-grabbing select-none" : "transition-shadow",
      ].join(" ")}
    >
      <div
        onPointerDown={anfassen}
        onPointerMove={ziehen}
        onPointerUp={loslassen}
        onPointerCancel={loslassen}
        className={[
          "flex h-8 touch-none items-center gap-1 border-b border-border/60 px-2",
          zieht ? "cursor-grabbing" : "cursor-grab",
        ].join(" ")}
      >
        <GripHorizontalIcon className="size-3.5 shrink-0 text-muted-foreground/40" />
        <span className="truncate text-[11px] text-muted-foreground/60">
          {quellenName(video)}
        </span>

        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open the original"
          aria-label="Open the original"
          onPointerDown={(event) => event.stopPropagation()}
          className="ms-auto flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground"
        >
          <Maximize2Icon className="size-3" />
        </a>
        <button
          type="button"
          onClick={schliessen}
          onPointerDown={(event) => event.stopPropagation()}
          title="Close"
          aria-label="Close"
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      <div style={{ height: HOEHE }} className="bg-black">
        <VideoInhalt quelle={video} />
      </div>
    </div>
  );
}
