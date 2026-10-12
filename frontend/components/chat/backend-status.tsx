"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/context/i18n-provider";
import type { TranslateFn } from "@/lib/i18n/translate";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Status = "checking" | "connected" | "streaming" | "offline";

type BackendStatusProps = {
  online: boolean | undefined;
  endpoint: string | undefined;
  isStreaming: boolean;
  latencyMs?: number | null;
  checkedAt?: number;
};

const STATES: Record<
  Status,
  {
    labelKey: string;
    titleKey: string;
    dot: string;
    glow: string;
    pill: string;
    pulse: boolean;
  }
> = {
  checking: {
    labelKey: "checkingLabel",
    titleKey: "checkingTitle",
    dot: "bg-muted-foreground/50",
    glow: "bg-muted-foreground/20",
    pill: "ring-border/50 text-muted-foreground",
    pulse: false,
  },
  connected: {
    labelKey: "connectedLabel",
    titleKey: "connectedTitle",
    dot: "bg-emerald-500",
    glow: "bg-emerald-500/30",
    pill: "ring-border/60 text-muted-foreground hover:text-foreground",
    pulse: true,
  },
  streaming: {
    labelKey: "streamingLabel",
    titleKey: "streamingTitle",
    dot: "bg-primary",
    glow: "bg-primary/30",
    pill: "ring-border/60 text-foreground",
    pulse: true,
  },
  offline: {
    labelKey: "offlineLabel",
    titleKey: "offlineTitle",
    dot: "bg-destructive",
    glow: "bg-destructive/30",
    pill: "bg-destructive/[0.07] ring-destructive/40 text-destructive",
    pulse: false,
  },
};

export function BackendStatus({
  online,
  endpoint,
  isStreaming,
  latencyMs,
  checkedAt,
}: BackendStatusProps) {
  const t = useT();
  const status: Status = isStreaming
    ? "streaming"
    : online === undefined
      ? "checking"
      : online
        ? "connected"
        : "offline";

  const meta = STATES[status];
  const target = split(endpoint);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={cn(
              "flex cursor-default items-center gap-2 rounded-full py-1 ps-2 pe-2.5 text-xs font-medium ring-1 ring-inset transition-colors select-none",
              meta.pill,
            )}
          />
        }
      >
        <StatusDot meta={meta} size="sm" />
        {t(`backendStatus.${meta.labelKey}`)}
      </TooltipTrigger>

      <TooltipContent
        side="bottom"
        sideOffset={8}
        className={cn(
          "relative w-64 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-0 overflow-hidden rounded-2xl border border-border/70 bg-card/95 p-0 text-foreground shadow-xl shadow-black/20 backdrop-blur-xl",
          "**:data-[slot=tooltip-arrow]:hidden",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-10 -right-8 size-28 rounded-full opacity-70 blur-3xl",
            meta.glow,
          )}
        />

        <div className="relative flex flex-col gap-2.5 p-3.5">
          <div className="flex items-center gap-2">
            <StatusDot meta={meta} size="lg" />
            <span className="text-[13px] leading-none font-medium tracking-tight">
              {t(`backendStatus.${meta.titleKey}`)}
            </span>

            {typeof latencyMs === "number" ? (
              <span className="ms-auto rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                {latencyMs} ms
              </span>
            ) : null}
          </div>

          {target ? (
            <div className="flex flex-col gap-0.5 font-mono text-[11px] leading-relaxed">
              <span className="truncate">
                <span className="text-muted-foreground/50">{target.schema}</span>
                <span className="text-foreground/90">{target.host}</span>
              </span>
              {target.path ? (
                <span className="break-all text-muted-foreground/60">
                  {target.path}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="relative border-t border-border/60 px-3.5 py-2 text-[10px] leading-relaxed text-muted-foreground/70">
          {footer(t, status, checkedAt)}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function StatusDot({
  meta,
  size,
}: {
  meta: (typeof STATES)[Status];
  size: "sm" | "lg";
}) {
  const s = size === "sm" ? "size-1.5" : "size-2";
  return (
    <span className={cn("relative flex shrink-0", s)}>
      {meta.pulse ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-75",
            meta.dot,
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex rounded-full", s, meta.dot)} />
    </span>
  );
}

function footer(t: TranslateFn, status: Status, checkedAt?: number): string {
  if (status === "offline") return t("backendStatus.footerOffline");
  if (status === "checking") return t("backendStatus.footerChecking");
  if (status === "streaming") return t("backendStatus.footerStreaming");
  return checkedAt
    ? t("backendStatus.footerChecked", { ago: since(t, checkedAt) })
    : t("backendStatus.footerReachable");
}

function since(t: TranslateFn, timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 5) return t("backendStatus.justNow");
  if (seconds < 60) return t("backendStatus.secAgo", { s: seconds });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t("backendStatus.minAgo", { m: minutes });
  return t("backendStatus.hourAgo", { h: Math.round(minutes / 60) });
}

function split(endpoint: string | undefined) {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    return { schema: `${url.protocol}//`, host: url.host, path: url.pathname };
  } catch {
    return { schema: "", host: endpoint, path: "" };
  }
}
