"use client";

import * as React from "react";
import { useT } from "@/context/i18n-provider";
import { GripHorizontalIcon, Maximize2Icon, XIcon } from "lucide-react";

import { VideoContent, sourceName } from "@/components/chat/chat-video";
import { useVideoWindow } from "@/lib/video-store";

const PANEL_WIDTH = 320;
const TOAST_HEIGHT = 180;
const MARGIN = 16;

function fit(x: number, y: number) {
  return {
    x: Math.min(Math.max(x, MARGIN), Math.max(MARGIN, window.innerWidth - PANEL_WIDTH - MARGIN)),
    y: Math.min(Math.max(y, MARGIN), Math.max(MARGIN, window.innerHeight - TOAST_HEIGHT - MARGIN)),
  };
}

export function VideoWindow() {
  const t = useT();
  const { video, position, close, setPosition } = useVideoWindow();
  const frameRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ dx: number; dy: number } | null>(null);
  const lastRef = React.useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);

  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !video) return;

    const start =
      position ??
      fit(window.innerWidth - PANEL_WIDTH - MARGIN, window.innerHeight - TOAST_HEIGHT - MARGIN);
    lastRef.current = start;
    frame.style.transform = `translate3d(${start.x}px, ${start.y}px, 0)`;
  }, [video, position]);

  React.useEffect(() => {
    if (!video) return;
    const atSize = () => {
      const last = lastRef.current;
      const frame = frameRef.current;
      if (!last || !frame) return;
      const next = fit(last.x, last.y);
      lastRef.current = next;
      frame.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
    };
    window.addEventListener("resize", atSize);
    return () => window.removeEventListener("resize", atSize);
  }, [video]);

  if (!video) return null;

  const startDrag = (event: React.PointerEvent) => {
    const last = lastRef.current;
    if (!last) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { dx: event.clientX - last.x, dy: event.clientY - last.y };
    if (frameRef.current) frameRef.current.style.willChange = "transform";
    setDragging(true);
  };

  const moveDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame) return;
    const next = fit(event.clientX - drag.dx, event.clientY - drag.dy);
    lastRef.current = next;
    frame.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (frameRef.current) frameRef.current.style.willChange = "auto";
    setDragging(false);
    if (lastRef.current) setPosition(lastRef.current);
  };

  return (
    <div
      ref={frameRef}
      style={{ width: PANEL_WIDTH }}
      className={[
        "fixed top-0 left-0 z-50 overflow-hidden rounded-xl bg-background shadow-2xl shadow-black/20 ring-1 ring-border/70 ring-inset dark:shadow-black/50",
        "animate-in fade-in zoom-in-95 duration-200",
        dragging ? "cursor-grabbing select-none" : "transition-shadow",
      ].join(" ")}
    >
      <div
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={[
          "flex h-8 touch-none items-center gap-1 border-b border-border/60 px-2",
          dragging ? "cursor-grabbing" : "cursor-grab",
        ].join(" ")}
      >
        <GripHorizontalIcon className="size-3.5 shrink-0 text-muted-foreground/40" />
        <span className="truncate text-[11px] text-muted-foreground/60">
          {sourceName(video, t)}
        </span>

        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          title={t("video.openOriginal")}
          aria-label={t("video.openOriginal")}
          onPointerDown={(event) => event.stopPropagation()}
          className="ms-auto flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground"
        >
          <Maximize2Icon className="size-3" />
        </a>
        <button
          type="button"
          onClick={close}
          onPointerDown={(event) => event.stopPropagation()}
          title={t("video.close")}
          aria-label={t("video.close")}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      <div style={{ height: TOAST_HEIGHT }} className="bg-black">
        <VideoContent source={video} />
      </div>
    </div>
  );
}
