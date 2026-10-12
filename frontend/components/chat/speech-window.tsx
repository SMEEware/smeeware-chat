"use client";

import * as React from "react";
import {
  ChevronDownIcon,
  GripHorizontalIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react";

import { SpeechVisualizer } from "@/components/chat/speech-visualizer";
import { useSpeechRun, type SpeechRun } from "@/lib/chat/speech-runs";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/context/i18n-provider";
import { useTtsModels } from "@/hooks/use-tts-models";
import { languageName } from "@/lib/i18n/language-name";
import type { TranslateFn } from "@/lib/i18n/translate";

const PANEL_WIDTH = 340;
const MARGIN = 16;
const PEEK_HEIGHT = 56;

type Trail = {
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  startCtx: number;
  offset: number;
  handStop: boolean;
  error: boolean;
};

export function SpeechWindow() {
  const t = useT();
  const locale = useLocale();
  const ttsModels = useTtsModels();
  const freeLanguage = ttsModels.data?.models.find((m) => m.runtime === "free")?.language;
  const runs = useSpeechRun((z) => z.runs);
  const active = useSpeechRun((z) => z.active);
  const position = useSpeechRun((z) => z.position);
  const remove = useSpeechRun((z) => z.remove);
  const empty = useSpeechRun((z) => z.empty);
  const select = useSpeechRun((z) => z.select);
  const setPosition = useSpeechRun((z) => z.setPosition);

  const [analyser, setAnalyser] = React.useState<AnalyserNode | null>(null);
  const [playingId, setPlayingId] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  type LoadState = { status: "loading" | "done" | "error"; duration: number };
  const [loaded, setLoaded] = React.useState<Record<string, LoadState>>({});
  const [openRun, setOpenRun] = React.useState<string | null>(null);

  const frameRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ dx: number; dy: number } | null>(null);
  const lastRef = React.useRef<{ x: number; y: number } | null>(null);

  const ctxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const trailRef = React.useRef<Map<string, Trail>>(new Map());
  const autoRef = React.useRef<Set<string>>(new Set());

  const activeOne = runs.find((l) => l.run === active) ?? null;

  const context = React.useCallback((): AudioContext => {
    if (!ctxRef.current) {
      const c = new AudioContext();
      const a = c.createAnalyser();
      a.fftSize = 256;
      a.smoothingTimeConstant = 0.72;
      a.connect(c.destination);
      ctxRef.current = c;
      analyserRef.current = a;
      setAnalyser(a);
    }
    return ctxRef.current;
  }, []);

  const load = React.useCallback(
    async (run: string, url: string): Promise<Trail> => {
      const da = trailRef.current.get(run);
      if (da) return da;
      const trail: Trail = {
        buffer: null,
        source: null,
        startCtx: 0,
        offset: 0,
        handStop: false,
        error: false,
      };
      trailRef.current.set(run, trail);
      setLoaded((g) => ({ ...g, [run]: { status: "loading", duration: 0 } }));
      try {
        const c = context();
        const raw = await (await fetch(url, { cache: "no-store" })).arrayBuffer();
        trail.buffer = await c.decodeAudioData(raw);
        const duration = trail.buffer.duration;
        setLoaded((g) => ({ ...g, [run]: { status: "done", duration } }));
      } catch {
        trail.error = true;
        setLoaded((g) => ({ ...g, [run]: { status: "error", duration: 0 } }));
      }
      return trail;
    },
    [context],
  );

  const pause = React.useCallback((run: string) => {
    const trail = trailRef.current.get(run);
    const c = ctxRef.current;
    if (trail && trail.source && c) {
      const duration = trail.buffer?.duration ?? 0;
      trail.offset = Math.min(duration, trail.offset + (c.currentTime - trail.startCtx));
      trail.handStop = true;
      try {
        trail.source.stop();
      } catch {
      }
      trail.source = null;
    }
    setPlayingId((id) => (id === run ? null : id));
  }, []);

  const play = React.useCallback(
    async (runFor: SpeechRun) => {
      if (!runFor.url) return;
      const c = context();
      const trail = await load(runFor.run, runFor.url);
      if (!trail.buffer) return;

      for (const [id, s] of trailRef.current) if (id !== runFor.run && s.source) pause(id);

      await c.resume().catch(() => {});
      if (c.state !== "running") return;

      if (trail.offset >= trail.buffer.duration - 0.05) trail.offset = 0;

      const source = c.createBufferSource();
      source.buffer = trail.buffer;
      source.connect(analyserRef.current!);
      trail.handStop = false;
      source.onended = () => {
        if (trail.handStop) return;
        trail.offset = 0;
        trail.source = null;
        setPlayingId((id) => (id === runFor.run ? null : id));
      };
      source.start(0, trail.offset);
      trail.startCtx = c.currentTime;
      trail.source = source;
      setPlayingId(runFor.run);
    },
    [context, load, pause],
  );

  const jump = React.useCallback(
    (run: string, target: number) => {
      const trail = trailRef.current.get(run);
      const c = ctxRef.current;
      if (!trail || !trail.buffer || !c) return;
      const t = Math.max(0, Math.min(target, trail.buffer.duration));
      const wasRunning = !!trail.source;
      if (wasRunning) {
        trail.handStop = true;
        try {
          trail.source!.stop();
        } catch {
        }
        trail.source = null;
      }
      trail.offset = t;
      if (wasRunning) {
        const source = c.createBufferSource();
        source.buffer = trail.buffer;
        source.connect(analyserRef.current!);
        trail.handStop = false;
        source.onended = () => {
          if (trail.handStop) return;
          trail.offset = 0;
          trail.source = null;
          setPlayingId((id) => (id === run ? null : id));
        };
        source.start(0, t);
        trail.startCtx = c.currentTime;
        trail.source = source;
      }
    },
    [],
  );

  const progress = React.useCallback((run: string): number => {
    const trail = trailRef.current.get(run);
    const c = ctxRef.current;
    if (!trail) return 0;
    const duration = trail.buffer?.duration ?? 0;
    const p = trail.source && c ? trail.offset + (c.currentTime - trail.startCtx) : trail.offset;
    return Math.max(0, Math.min(p, duration));
  }, []);

  React.useEffect(() => {
    if (!activeOne || activeOne.phase !== "done" || !activeOne.url) return;
    const trail = trailRef.current.get(activeOne.run);
    if (!trail) {
      void load(activeOne.run, activeOne.url);
      return;
    }
    if (trail.buffer && !autoRef.current.has(activeOne.run)) {
      autoRef.current.add(activeOne.run);
      void play(activeOne);
    }
  }, [activeOne, loaded, load, play]);

  React.useEffect(() => {
    const ids = new Set(runs.map((l) => l.run));
    for (const [id, s] of trailRef.current) {
      if (!ids.has(id)) {
        if (s.source) {
          try {
            s.source.stop();
          } catch {
          }
        }
        trailRef.current.delete(id);
        autoRef.current.delete(id);
        setPlayingId((cur) => (cur === id ? null : cur));
      }
    }
    if (runs.length === 0 && ctxRef.current) {
      void ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
      analyserRef.current = null;
      setAnalyser(null);
      setPlayingId(null);
    }
  }, [runs]);

  const fit = React.useCallback((x: number, y: number) => {
    return {
      x: Math.min(Math.max(x, MARGIN - PANEL_WIDTH + PEEK_HEIGHT), window.innerWidth - PEEK_HEIGHT),
      y: Math.min(Math.max(y, MARGIN), window.innerHeight - PEEK_HEIGHT),
    };
  }, []);

  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame || runs.length === 0) return;
    const start =
      position ??
      fit((window.innerWidth - PANEL_WIDTH) / 2, window.innerHeight - 360);
    lastRef.current = start;
    frame.style.transform = `translate3d(${start.x}px, ${start.y}px, 0)`;
  }, [runs.length, position, fit]);

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

  if (runs.length === 0 || !activeOne) return null;

  const playing = playingId === activeOne.run;
  const loadState = loaded[activeOne.run];
  const preparing =
    (activeOne.phase === "start" && !activeOne.url) ||
    (activeOne.phase === "done" &&
      activeOne.url !== undefined &&
      loadState?.status !== "done" &&
      loadState?.status !== "error");
  const error = activeOne.phase === "error" || loadState?.status === "error";
  const openText = openRun === activeOne.run;

  return (
    <div
      ref={frameRef}
      style={{ width: PANEL_WIDTH }}
      className={cn(
        "fixed top-0 left-0 z-50 flex flex-col overflow-hidden rounded-3xl shadow-2xl shadow-black/25 ring-1 ring-border/60 dark:shadow-black/50",
        "animate-in fade-in zoom-in-95 duration-200",
        dragging
          ? "select-none bg-background dark:bg-background"
          : "bg-background/80 backdrop-blur-xl transition-shadow dark:bg-background/70",
      )}
    >
      <div
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn(
          "flex h-9 touch-none items-center gap-1.5 px-3",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <GripHorizontalIcon className="size-3.5 shrink-0 text-muted-foreground/40" />
        <Volume2Icon className="size-3.5 shrink-0 text-primary" />
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground/70">
          {t("speechWindow.readingAloud")}
        </span>
        {runs.length > 1 ? (
          <span className="rounded-full bg-muted/60 px-1.5 py-px text-[9px] tabular-nums text-muted-foreground/60">
            {runs.length}
          </span>
        ) : null}
        <button
          type="button"
          onClick={empty}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={t("speechWindow.closeAll")}
          title={t("speechWindow.closeAll")}
          className="ms-auto flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      {runs.length > 1 ? (
        <div className="flex gap-1 overflow-x-auto px-2 pb-2 scrollbar-none">
          {runs.map((l, i) => (
            <Tab
              key={l.run}
              runFor={l}
              num={i + 1}
              active={l.run === active}
              playing={playingId === l.run}
              onChoose={() => select(l.run)}
              onClose={() => remove(l.run)}
            />
          ))}
        </div>
      ) : null}

      <div className="group flex flex-col items-center gap-3 px-5 pt-1 pb-5">
        <div className="relative flex items-center justify-center">
          {preparing || error ? (
            <span
              className={cn(
                "flex size-32 items-center justify-center rounded-full",
                error ? "bg-destructive/10" : "bg-primary/10",
              )}
            >
              {error ? (
                <XIcon className="size-6 text-destructive" />
              ) : (
                <Loader2Icon className="size-6 animate-spin text-primary" />
              )}
            </span>
          ) : (
            <SpeechVisualizer
              analyser={analyser}
              active={playing}
              size={128}
              paused={dragging}
            />
          )}

          {!preparing && !error ? (
            <button
              type="button"
              onClick={() =>
                playing ? pause(activeOne.run) : void play(activeOne)
              }
              aria-label={playing ? t("speechWindow.pause") : t("speechWindow.play")}
              className="absolute flex size-11 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95"
            >
              {playing ? (
                <PauseIcon className="size-5 fill-current" />
              ) : (
                <PlayIcon className="size-5 translate-x-0.5 fill-current" />
              )}
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="text-center text-[12px] text-destructive">
            {t("speechWindow.readError")}
          </p>
        ) : null}

        {!preparing && !error ? (
          <SeekBar
            run={activeOne.run}
            playing={playing}
            duration={loadState?.duration ?? 0}
            progress={progress}
            jump={jump}
          />
        ) : null}

        {activeOne.provider === "free" ? (
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground/60">
            {t("speechWindow.freeVoice", {
              language: languageName(locale, freeLanguage ?? "en"),
            })}
          </span>
        ) : null}

        {activeOne.text ? (
          <div className="w-full">
            <div
              className={cn(
                "relative overflow-y-auto rounded-xl bg-muted/30 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground transition-[max-height]",
                openText ? "max-h-40" : "max-h-[3.4rem]",
              )}
            >
              <p className={cn(!openText && "line-clamp-2")}>{activeOne.text}</p>
              {!openText ? (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-6 rounded-b-xl bg-linear-to-t from-background/60 to-transparent" />
              ) : null}
            </div>
            {activeOne.text.length > 90 ? (
              <button
                type="button"
                onClick={() =>
                  setOpenRun((r) => (r === activeOne.run ? null : activeOne.run))
                }
                className="mt-1.5 flex cursor-pointer items-center gap-1 text-[11px] font-medium text-muted-foreground/60 transition-colors hover:text-foreground"
              >
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 transition-transform",
                    openText && "rotate-180",
                  )}
                />
                {openText ? t("speechWindow.showLess") : t("speechWindow.showFullText")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Tab({
  runFor,
  num,
  active,
  playing,
  onChoose,
  onClose,
}: {
  runFor: SpeechRun;
  num: number;
  active: boolean;
  playing: boolean;
  onChoose: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const title = titleFrom(runFor, num, t);
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "group/tab flex shrink-0 items-center gap-1.5 rounded-lg py-1 ps-2 pe-1 text-[11px] transition-colors",
        active
          ? "bg-primary/9 text-foreground ring-1 ring-primary/25 ring-inset"
          : "text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={onChoose}
        className="flex max-w-28 cursor-pointer items-center gap-1.5"
        title={title}
      >
        {playing ? (
          <span className="relative flex size-1.5 shrink-0">
            <span className="absolute inline-flex size-1.5 animate-ping rounded-full bg-primary/70" />
            <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
          </span>
        ) : (
          <Volume2Icon className="size-3 shrink-0 opacity-50" />
        )}
        <span className="truncate">{title}</span>
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("speechWindow.closeTab")}
        className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-[opacity,color] group-hover/tab:opacity-100 hover:text-destructive"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}

function SeekBar({
  run,
  playing,
  duration,
  progress,
  jump,
}: {
  run: string;
  playing: boolean;
  duration: number;
  progress: (run: string) => number;
  jump: (run: string, target: number) => void;
}) {
  const [currentTime, setCurrentTime] = React.useState(0);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const fillRef = React.useRef<HTMLDivElement>(null);
  const dotRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);

  const fraction = (clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const r = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const male = (p: number) => {
    if (fillRef.current) fillRef.current.style.width = `${p * 100}%`;
    if (dotRef.current) dotRef.current.style.left = `${p * 100}%`;
  };

  React.useEffect(() => {
    let image = 0;
    let last = 0;
    const tick = () => {
      image = requestAnimationFrame(tick);
      if (draggingRef.current) return;
      const p = duration > 0 ? Math.min(1, progress(run) / duration) : 0;
      male(p);
      const now = performance.now();
      if (now - last > 150) {
        last = now;
        setCurrentTime(progress(run));
      }
    };
    tick();
    return () => cancelAnimationFrame(image);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, duration]);

  const show = (clientX: number) => {
    const p = fraction(clientX);
    male(p);
    if (duration > 0) setCurrentTime(p * duration);
  };

  const down = (e: React.PointerEvent) => {
    e.stopPropagation();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    show(e.clientX);
  };
  const handleMove = (e: React.PointerEvent) => {
    if (draggingRef.current) show(e.clientX);
  };
  const handleUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (duration > 0) jump(run, fraction(e.clientX) * duration);
  };

  return (
    <div className="w-full">
      <div
        ref={trackRef}
        onPointerDown={down}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        className="group/seek relative flex h-4 cursor-pointer items-center"
      >
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted-foreground/20 transition-all group-hover/seek:h-1.5">
          <div
            ref={fillRef}
            className="h-full rounded-full bg-primary"
            style={{ width: "0%" }}
          />
        </div>
        <div
          ref={dotRef}
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 rounded-full bg-primary shadow ring-2 ring-background transition-transform group-hover/seek:scale-125"
          style={{ left: "0%" }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground/50">
        <span>{clock(currentTime)}</span>
        <span className={cn(!playing && "opacity-70")}>{clock(duration)}</span>
      </div>
    </div>
  );
}

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function titleFrom(runFor: SpeechRun, num: number, t: TranslateFn): string {
  const text = (runFor.text ?? "").trim();
  if (!text) return t("speechWindow.audio", { num });
  const label = text.split(/\s+/).slice(0, 4).join(" ");
  return label.length < text.length ? `${label}…` : label;
}
