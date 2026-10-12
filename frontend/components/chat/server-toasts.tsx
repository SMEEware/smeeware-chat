"use client";

import * as React from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";

import { SystemModal, type SystemData } from "@/components/chat/system-modal";
import { useServerEvents, type ServerEvent } from "@/hooks/use-server-events";
import { useImageRuns } from "@/lib/chat/image-runs";
import { useSpeechRun } from "@/lib/chat/speech-runs";
import { noticeKey } from "@/hooks/use-notifications";
import { useSettings } from "@/lib/settings/store";
import { useSound } from "@/hooks/use-sound";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useT } from "@/context/i18n-provider";

type Level = "info" | "success" | "warning" | "error";

type Toast = {
  id: number;
  level: Level;
  title: string;
  body?: string | null;
  visible: boolean;
};

const DISPLAY_MS = 7000;
const EXIT_MS = 220;
const MAX_VISIBLE = 3;

type StyleSet = {
  icon: React.ReactNode;
  ring: string;
  tone: string;
  glow: string;
};

const LEVEL_STYLE: Record<Level, StyleSet> = {
  info: {
    icon: <InfoIcon className="size-4" />,
    ring: "ring-border/70",
    tone: "text-foreground/70",
    glow: "bg-foreground/30",
  },
  success: {
    icon: <CheckCircle2Icon className="size-4" />,
    ring: "ring-emerald-500/40",
    tone: "text-emerald-500",
    glow: "bg-emerald-500",
  },
  warning: {
    icon: <AlertTriangleIcon className="size-4" />,
    ring: "ring-amber-500/40",
    tone: "text-amber-500",
    glow: "bg-amber-500",
  },
  error: {
    icon: <XCircleIcon className="size-4" />,
    ring: "ring-destructive/45",
    tone: "text-destructive",
    glow: "bg-destructive",
  },
};

const TOAST_HEIGHT = 96;

export function ServerToasts() {
  const t = useT();
  const enabled = useSettings((state) => state.notifications);
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [open, setOpen] = React.useState(false);
  const [system, setSystem] = React.useState<SystemData | null>(null);
  const queryClient = useQueryClient();
  const nextId = React.useRef(0);
  const report = useImageRuns((state) => state.report);
  const reportLanguage = useSpeechRun((state) => state.report);

  const playHint = useSound("/assets/sounds/receive_notification.mp3");
  const playSystem = useSound("/assets/sounds/system_check.mp3");

  const close = React.useCallback((id: number) => {
    setToasts((previous) =>
      previous.map((t) => (t.id === id ? { ...t, visible: false } : t)),
    );
    setTimeout(
      () => setToasts((previous) => previous.filter((t) => t.id !== id)),
      EXIT_MS,
    );
  }, []);

  const onEvent = React.useCallback(
    (event: ServerEvent) => {
      if (event.type === "image") {
        report(event);
        return;
      }
      if (event.type === "speech") {
        reportLanguage(event);
        return;
      }
      if (event.type === "toast") {
        void queryClient.invalidateQueries({ queryKey: noticeKey });
      }

      if (!enabled) return;
      if (event.type === "system") {
        playSystem();
        setSystem(event.data as SystemData);
        return;
      }
      if (event.type !== "toast") return;

      playHint();
      const id = nextId.current++;
      setToasts((previous) =>
        [
          ...previous,
          {
            id,
            level: event.level,
            title: event.title,
            body: event.body,
            visible: true,
          },
        ].slice(-MAX_VISIBLE),
      );
      setTimeout(() => close(id), DISPLAY_MS);
    },
    [enabled, report, reportLanguage, queryClient, close, playHint, playSystem],
  );

  useServerEvents(true, onEvent);

  const modal = system ? (
    <SystemModal data={system} onClose={() => setSystem(null)} />
  ) : null;

  if (!enabled || toasts.length === 0) return modal;

  const stack = [...toasts].reverse();

  return (
    <>
      {modal}
      <div
        aria-live="polite"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{ height: open ? undefined : TOAST_HEIGHT }}
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col-reverse items-stretch gap-2"
      >
        {stack.map((toast, depth) => {
          const style = LEVEL_STYLE[toast.level];
          const stacked = !open && depth > 0;

          return (
            <div
              key={toast.id}
              style={
                stacked
                  ? {
                      position: "absolute",
                      insetInline: 0,
                      bottom: 0,
                      transform: `translateY(-${depth * 10}px) scale(${1 - depth * 0.05})`,
                      zIndex: 10 - depth,
                    }
                  : undefined
              }
              className={cn(
                "group pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-2xl p-3.5",
                "bg-background/80 shadow-xl shadow-black/10 ring-1 backdrop-blur-xl ring-inset dark:bg-background/70 dark:shadow-black/40",
                style.ring,
                "transition-all duration-300 ease-out",
                toast.visible
                  ? "translate-y-0 scale-100 opacity-100 blur-0"
                  : "translate-y-2 scale-95 opacity-0 blur-[2px]",
                stacked && "opacity-70",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute -top-8 -left-8 size-24 rounded-full opacity-25 blur-2xl",
                  style.glow,
                )}
              />

              <span
                aria-hidden
                className="absolute inset-y-0 -left-full w-full animate-[toast-schimmer_900ms_ease-out_forwards] bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent"
              />

              <span
                className={cn(
                  "relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-current/10",
                  style.tone,
                )}
              >
                {style.icon}
              </span>

              <span className="relative flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] leading-snug font-medium wrap-break-words">
                  {toast.title}
                </span>
                {toast.body ? (
                  <span className="text-[11px] leading-relaxed text-muted-foreground wrap-break-words">
                    {toast.body}
                  </span>
                ) : null}
              </span>

              <button
                type="button"
                onClick={() => close(toast.id)}
                aria-label={t("toasts.dismiss")}
                className="relative -mt-1 -mr-1 ms-auto flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 opacity-0 transition-[opacity,color] group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 max-md:opacity-100"
              >
                <XIcon className="size-3.5" />
              </button>

              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-0 bottom-0 h-px origin-left animate-[toast-zeit_7000ms_linear_forwards] bg-current opacity-40",
                  style.tone,
                )}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
