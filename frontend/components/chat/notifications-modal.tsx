"use client";

import * as React from "react";
import {
  AlertTriangleIcon,
  BellIcon,
  CheckCircle2Icon,
  InfoIcon,
  Trash2Icon,
  XCircleIcon,
  XIcon,
} from "lucide-react";

import {
  useNotificationActions,
  useNotifications,
  type Hinweis,
} from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

const STIL: Record<Hinweis["level"], { icon: React.ReactNode; ton: string }> = {
  info: { icon: <InfoIcon className="size-3.5" />, ton: "text-foreground/60" },
  success: {
    icon: <CheckCircle2Icon className="size-3.5" />,
    ton: "text-emerald-500",
  },
  warning: {
    icon: <AlertTriangleIcon className="size-3.5" />,
    ton: "text-amber-500",
  },
  error: {
    icon: <XCircleIcon className="size-3.5" />,
    ton: "text-destructive",
  },
};

/** "vor 3 Min", "vor 2 Std", sonst das Datum. */
function wann(iso: string): string {
  const dann = new Date(iso).getTime();
  if (Number.isNaN(dann)) return "";
  const min = Math.floor((Date.now() - dann) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (min < 1440) return `${Math.floor(min / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Was der Toast hinterlassen hat.
 *
 * Ein Toast ist nach Sekunden weg -- wer in dem Moment woanders hinsah, hat
 * ihn verpasst. Hier stehen sie alle, neueste zuerst, und bleiben liegen,
 * bis jemand sie wegraeumt.
 */
export function NotificationsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (offen: boolean) => void;
}) {
  const liste = useNotifications();
  const { gelesen, loeschen, alleLoeschen } = useNotificationActions();

  // Beim Oeffnen als gelesen markieren -- das Abzeichen hat seinen Zweck
  // erfuellt, sobald man hingesehen hat.
  const ungelesen = liste.data?.unread ?? 0;
  React.useEffect(() => {
    if (open && ungelesen > 0) gelesen.mutate();
    // gelesen absichtlich nicht in den Abhaengigkeiten: die Mutation
    // wechselt bei jedem Render die Identitaet und wuerde eine Schleife
    // ausloesen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ungelesen]);

  React.useEffect(() => {
    if (!open) return;
    const aufTaste = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", aufTaste);
    return () => window.removeEventListener("keydown", aufTaste);
  }, [open, onOpenChange]);

  if (!open) return null;

  const hinweise = liste.data?.notifications ?? [];

  return (
    <div
      // z-50 wie beim Systemcheck, und das ist hier kein Geschmack: der
      // Kasten haengt in der Sidebar, der Chat daneben ist ein
      // ``relative`` Element mit deckendem Hintergrund und steht spaeter
      // im Dokument. Mit ``z-auto`` entscheidet die Reihenfolge -- und die
      // verliert der Kasten. Er ging also auf und wurde vom Chat
      // uebermalt, was von aussen aussieht, als taete der Knopf nichts.
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        onClick={(event) => event.stopPropagation()}
        className="relative flex max-h-[min(32rem,80vh)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-background/95 shadow-2xl shadow-black/20 ring-1 ring-border/70 backdrop-blur-xl ring-inset dark:shadow-black/50 animate-in zoom-in-95 slide-in-from-bottom-2 duration-300"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 size-48 -translate-x-1/2 rounded-full bg-primary/20 opacity-40 blur-3xl"
        />

        <div className="relative flex items-center gap-3 px-5 pt-5 pb-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BellIcon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <h2 className="font-heading text-[15px] font-semibold tracking-tight">
              Notifications
            </h2>
            <p className="text-[11px] text-muted-foreground/60">
              {hinweise.length === 0
                ? "Nothing yet"
                : `${hinweise.length} kept${ungelesen > 0 ? ` · ${ungelesen} new` : ""}`}
            </p>
          </div>

          {hinweise.length > 0 ? (
            <button
              type="button"
              onClick={() => alleLoeschen.mutate()}
              disabled={alleLoeschen.isPending}
              className="ms-auto cursor-pointer rounded-md px-2 py-1 text-[11px] text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              Clear all
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className={cn(
              "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted/60 hover:text-foreground",
              hinweise.length === 0 && "ms-auto",
            )}
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto border-t border-border/60">
          {liste.isLoading ? (
            <p className="px-5 py-10 text-center text-[12px] text-muted-foreground/60">
              Loading…
            </p>
          ) : hinweise.length === 0 ? (
            <p className="px-5 py-10 text-center text-[12px] leading-relaxed text-muted-foreground/60">
              Nothing here yet.
              <br />
              Notices the assistant raises are kept for you.
            </p>
          ) : (
            <ul className="flex flex-col">
              {hinweise.map((hinweis) => {
                const stil = STIL[hinweis.level] ?? STIL.info;
                return (
                  <li
                    key={hinweis.id}
                    className="group/hinweis relative flex items-start gap-3 border-b border-border/40 px-5 py-3 transition-colors last:border-b-0 hover:bg-muted/30"
                  >
                    {/* Ungelesen: ein Punkt an der Kante, kein zweiter Ton
                        auf der Flaeche. */}
                    {hinweis.read_at === null ? (
                      <span
                        aria-hidden
                        className="absolute top-1/2 left-2 size-1.5 -translate-y-1/2 rounded-full bg-primary"
                      />
                    ) : null}

                    <span className={cn("mt-0.5 shrink-0", stil.ton)}>
                      {stil.icon}
                    </span>

                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[13px] leading-snug font-medium wrap-break-words">
                        {hinweis.title}
                      </span>
                      {hinweis.body ? (
                        <span className="text-[11px] leading-relaxed text-muted-foreground wrap-break-words">
                          {hinweis.body}
                        </span>
                      ) : null}
                      <span className="text-[10px] text-muted-foreground/45 tabular-nums">
                        {wann(hinweis.created_at)}
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() => loeschen.mutate(hinweis.id)}
                      aria-label="Delete"
                      className="ms-auto flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-[opacity,color] group-hover/hinweis:opacity-100 hover:text-destructive focus-visible:opacity-100 max-md:opacity-100"
                    >
                      <Trash2Icon className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
