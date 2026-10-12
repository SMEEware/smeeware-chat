"use client";

import * as React from "react";
import {
  AudioLinesIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CommandIcon,
  CompassIcon,
  FolderGit2Icon,
  FolderPlusIcon,
  MessageSquareIcon,
  MicIcon,
  SettingsIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Kbd } from "@/components/ui/kbd";
import { useSidebar } from "@/components/ui/sidebar";
import { useSettings } from "@/lib/settings/store";
import { cn } from "@/lib/utils";
import { useT } from "@/context/i18n-provider";
import type { TranslateFn } from "@/lib/i18n/translate";

type Side = "top" | "bottom";

type Step = {
  id: string;
  targets: string[];
  icon: LucideIcon;
  title: string;
  text: React.ReactNode;
  side?: Side;
  radius?: number;
  sidebar?: boolean;
};

function buildSteps(t: TranslateFn): Step[] {
  return [
    {
      id: "composer",
      targets: ["composer"],
      icon: MessageSquareIcon,
      title: t("tour.composerTitle"),
      text: (
        <>
          {t("tour.composerText1")} <Kbd>↵</Kbd> {t("tour.composerText2")}{" "}
          <Kbd>⇧</Kbd>
          <Kbd>↵</Kbd> {t("tour.composerText3")}
        </>
      ),
      side: "top",
      radius: 26,
    },
    {
      id: "model",
      targets: ["model"],
      icon: SparklesIcon,
      title: t("tour.modelTitle"),
      text: <>{t("tour.modelText")}</>,
      side: "top",
      radius: 999,
    },
    {
      id: "attach",
      targets: ["attach", "voice"],
      icon: MicIcon,
      title: t("tour.attachTitle"),
      text: <>{t("tour.attachText")}</>,
      side: "top",
      radius: 999,
    },
    {
      id: "call",
      targets: ["call"],
      icon: AudioLinesIcon,
      title: t("tour.callTitle"),
      text: <>{t("tour.callText")}</>,
      side: "top",
      radius: 999,
    },
    {
      id: "workspace",
      targets: ["workspace"],
      icon: FolderGit2Icon,
      title: t("tour.workspaceTitle"),
      text: <>{t("tour.workspaceText")}</>,
      side: "top",
      radius: 999,
    },
    {
      id: "new",
      targets: ["new"],
      icon: FolderPlusIcon,
      title: t("tour.newTitle"),
      text: <>{t("tour.newText")}</>,
      side: "bottom",
      radius: 10,
      sidebar: true,
    },
    {
      id: "search",
      targets: ["search"],
      icon: CommandIcon,
      title: t("tour.searchTitle"),
      text: (
        <>
          {t("tour.searchText1")} <Kbd>⌘</Kbd>
          <Kbd>K</Kbd> {t("tour.searchText2")} <Kbd>/</Kbd>{" "}
          {t("tour.searchText3")}
        </>
      ),
      side: "bottom",
      radius: 10,
      sidebar: true,
    },
    {
      id: "settings",
      targets: ["settings"],
      icon: SettingsIcon,
      title: t("tour.settingsTitle"),
      text: <>{t("tour.settingsText")}</>,
      side: "top",
      radius: 8,
      sidebar: true,
    },
    {
      id: "tour",
      targets: ["tour"],
      icon: CompassIcon,
      title: t("tour.tourTitle"),
      text: <>{t("tour.tourText")}</>,
      side: "top",
      radius: 8,
      sidebar: true,
    },
  ];
}

type Rect = { x: number; y: number; width: number; height: number };

const PADDING = 8;
const CARD_WIDTH = 340;
const GAP = 16;
const MARGIN = 16;

export function startTour() {
  useSettings.getState().setTourSeen(false);
}

export function ChatTour() {
  const t = useT();
  const seen = useSettings((z) => z.tourSeen);
  const setSeen = useSettings((z) => z.setTourSeen);

  const { open, setOpen, isMobile, openMobile, setOpenMobile } = useSidebar();
  const sidebarOpen = isMobile ? openMobile : open;

  const [ready, setReady] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [viewport, setViewport] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    const id = setTimeout(() => setReady(true), 600);
    return () => clearTimeout(id);
  }, []);

  const running = ready && !seen;

  const steps = React.useMemo(() => {
    if (!running) return [];
    return buildSteps(t).filter(
      (s) =>
        s.sidebar ||
        s.targets.every((z) => tourTarget(z) !== null),
    );
  }, [running, t]);

  const step = steps[index];

  const end = React.useCallback(() => {
    setSeen(true);
    setIndex(0);
  }, [setSeen]);

  const relay = React.useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= steps.length) {
        setSeen(true);
        return 0;
      }
      return i + 1;
    });
  }, [steps.length, setSeen]);

  const back = React.useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  React.useEffect(() => {
    if (!running || !step?.sidebar || sidebarOpen) return;
    const id = requestAnimationFrame(() => {
      if (isMobile) setOpenMobile(true);
      else setOpen(true);
    });
    return () => cancelAnimationFrame(id);
  }, [running, step, sidebarOpen, isMobile, setOpen, setOpenMobile]);

  React.useEffect(() => {
    if (!running || !step) return;

    const measure = () => {
      const rects = step.targets
        .map((z) => tourTarget(z))
        .filter((el): el is HTMLElement => el !== null)
        .map((el) => el.getBoundingClientRect());

      if (rects.length === 0) {
        setRect(null);
        return;
      }

      const links = Math.min(...rects.map((k) => k.left));
      const top = Math.min(...rects.map((k) => k.top));
      const right = Math.max(...rects.map((k) => k.right));
      const bottom = Math.max(...rects.map((k) => k.bottom));

      setRect({
        x: links - PADDING,
        y: top - PADDING,
        width: right - links + PADDING * 2,
        height: bottom - top + PADDING * 2,
      });
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };

    measure();
    const t1 = setTimeout(measure, 230);
    const t2 = setTimeout(measure, 520);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", measure);
    };
  }, [running, step, sidebarOpen]);

  React.useEffect(() => {
    if (!running) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        end();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        relay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [running, end, relay, back]);

  if (!running || !step || !rect || steps.length === 0) return null;

  const placement = positionCard(step, rect, viewport);
  const Icon = step.icon;
  const isLast = index === steps.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("tour.dialogLabel")}
      className="fixed inset-0 z-[60] animate-in fade-in duration-300"
    >
      <div
        className="absolute inset-0 bg-background/55 backdrop-blur-[3px] transition-[clip-path] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ clipPath: `path(evenodd, "${cutoutPath(rect, step.radius ?? 12)}")` }}
      />

      <div
        aria-hidden
        className="tour-ring pointer-events-none absolute transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          borderRadius: step.radius ?? 12,
        }}
      />

      <div
        className="absolute w-[340px] max-w-[calc(100vw-2rem)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ left: placement.x, top: placement.top, bottom: placement.bottom }}
      >
        <div className="relative overflow-hidden rounded-2xl bg-card/95 shadow-2xl shadow-black/25 ring-1 ring-border/70 backdrop-blur-xl">
          <span
            aria-hidden
            className="pointer-events-none absolute -top-12 -right-8 size-32 rounded-full bg-primary/25 opacity-50 blur-3xl"
          />

          <div className="relative flex flex-col gap-3 p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <div className="flex min-w-0 flex-col">
                <h2 className="font-heading text-[15px] font-semibold tracking-tight">
                  {step.title}
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {step.text}
                </p>
              </div>

              <button
                type="button"
                onClick={end}
                aria-label={t("tour.skipTheTour")}
                className="-mt-1 -mr-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <span className="flex items-center gap-1.5">
                {steps.map((s, i) => (
                  <span
                    key={s.id}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === index
                        ? "w-5 bg-primary"
                        : i < index
                          ? "w-1.5 bg-primary/40"
                          : "w-1.5 bg-muted-foreground/20",
                    )}
                  />
                ))}
              </span>

              <div className="ms-auto flex items-center gap-1.5">
                {index > 0 ? (
                  <button
                    type="button"
                    onClick={back}
                    className="flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ArrowLeftIcon className="size-3.5" />
                    {t("tour.back")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={end}
                    className="flex h-8 cursor-pointer items-center rounded-lg px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {t("tour.skip")}
                  </button>
                )}

                <button
                  type="button"
                  onClick={relay}
                  autoFocus
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-95"
                >
                  {isLast ? (
                    <>
                      <CheckIcon className="size-3.5" />
                      {t("tour.gotIt")}
                    </>
                  ) : (
                    <>
                      {t("tour.next")}
                      <ArrowRightIcon className="size-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function cutoutPath(k: Rect, radius: number): string {
  const r = Math.max(0, Math.min(radius, k.width / 2, k.height / 2));
  const { x, y, width: b, height: h } = k;
  return [
    `M0 0 H100000 V100000 H0 Z`,
    `M${x + r} ${y}`,
    `H${x + b - r}`,
    `A${r} ${r} 0 0 1 ${x + b} ${y + r}`,
    `V${y + h - r}`,
    `A${r} ${r} 0 0 1 ${x + b - r} ${y + h}`,
    `H${x + r}`,
    `A${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V${y + r}`,
    `A${r} ${r} 0 0 1 ${x + r} ${y}`,
    "Z",
  ].join(" ");
}

function positionCard(
  step: Step,
  k: Rect,
  viewport: { width: number; height: number },
): { x: number; top?: number; bottom?: number } {
  const estimatedHeight = 260;
  const spaceAbove = k.y - GAP - MARGIN;
  const spaceBelow = viewport.height - (k.y + k.height) - GAP - MARGIN;

  const top =
    step.side === "top"
      ? spaceAbove >= estimatedHeight || spaceAbove >= spaceBelow
      : spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

  const middle = k.x + k.width / 2 - CARD_WIDTH / 2;
  const x = Math.min(
    Math.max(MARGIN, middle),
    Math.max(MARGIN, viewport.width - CARD_WIDTH - MARGIN),
  );

  return top
    ? { x, bottom: Math.max(MARGIN, viewport.height - k.y + GAP) }
    : { x, top: Math.max(MARGIN, k.y + k.height + GAP) };
}

function tourTarget(name: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  return Array.from(all).find((el) => el.getBoundingClientRect().width > 0) ?? null;
}
