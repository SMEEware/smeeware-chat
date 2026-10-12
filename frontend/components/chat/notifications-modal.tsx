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
  type AppNotification,
} from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";
import { useT } from "@/context/i18n-provider";
import type { TranslateFn } from "@/lib/i18n/translate";

const LEVEL_STYLE: Record<AppNotification["level"], { icon: React.ReactNode; tone: string }> = {
  info: { icon: <InfoIcon className="size-3.5" />, tone: "text-foreground/60" },
  success: {
    icon: <CheckCircle2Icon className="size-3.5" />,
    tone: "text-emerald-500",
  },
  warning: {
    icon: <AlertTriangleIcon className="size-3.5" />,
    tone: "text-amber-500",
  },
  error: {
    icon: <XCircleIcon className="size-3.5" />,
    tone: "text-destructive",
  },
};

function timeAgo(iso: string, t: TranslateFn): string {
  const thenMs = new Date(iso).getTime();
  if (Number.isNaN(thenMs)) return "";
  const min = Math.floor((Date.now() - thenMs) / 60_000);
  if (min < 1) return t("notifications.justNow");
  if (min < 60) return t("notifications.minAgo", { min });
  if (min < 1440) return t("notifications.hoursAgo", { h: Math.floor(min / 60) });
  return new Date(iso).toLocaleDateString();
}

export function NotificationsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const list = useNotifications();
  const { isRead, pendingDelete, deleteAll } = useNotificationActions();

  const unread = list.data?.unread ?? 0;
  React.useEffect(() => {
    if (open && unread > 0) isRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unread]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const notices = list.data?.notifications ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("notifications.title")}
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
              {t("notifications.title")}
            </h2>
            <p className="text-[11px] text-muted-foreground/60">
              {notices.length === 0
                ? t("notifications.nothingYet")
                : `${t("notifications.kept", { count: notices.length })}${unread > 0 ? t("notifications.newSuffix", { count: unread }) : ""}`}
            </p>
          </div>

          {notices.length > 0 ? (
            <button
              type="button"
              onClick={() => deleteAll.mutate()}
              disabled={deleteAll.isPending}
              className="ms-auto cursor-pointer rounded-md px-2 py-1 text-[11px] text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              {t("notifications.clearAll")}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t("notifications.close")}
            className={cn(
              "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted/60 hover:text-foreground",
              notices.length === 0 && "ms-auto",
            )}
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto border-t border-border/60">
          {list.isLoading ? (
            <p className="px-5 py-10 text-center text-[12px] text-muted-foreground/60">
              {t("common.loading")}
            </p>
          ) : notices.length === 0 ? (
            <p className="px-5 py-10 text-center text-[12px] leading-relaxed text-muted-foreground/60">
              {t("notifications.emptyTitle")}
              <br />
              {t("notifications.emptyBody")}
            </p>
          ) : (
            <ul className="flex flex-col">
              {notices.map((notice) => {
                const style = LEVEL_STYLE[notice.level] ?? LEVEL_STYLE.info;
                return (
                  <li
                    key={notice.id}
                    className="group/hinweis relative flex items-start gap-3 border-b border-border/40 px-5 py-3 transition-colors last:border-b-0 hover:bg-muted/30"
                  >
                    {notice.read_at === null ? (
                      <span
                        aria-hidden
                        className="absolute top-1/2 left-2 size-1.5 -translate-y-1/2 rounded-full bg-primary"
                      />
                    ) : null}

                    <span className={cn("mt-0.5 shrink-0", style.tone)}>
                      {style.icon}
                    </span>

                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[13px] leading-snug font-medium wrap-break-words">
                        {notice.title}
                      </span>
                      {notice.body ? (
                        <span className="text-[11px] leading-relaxed text-muted-foreground wrap-break-words">
                          {notice.body}
                        </span>
                      ) : null}
                      <span className="text-[10px] text-muted-foreground/45 tabular-nums">
                        {timeAgo(notice.created_at, t)}
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() => pendingDelete.mutate(notice.id)}
                      aria-label={t("notifications.delete")}
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
