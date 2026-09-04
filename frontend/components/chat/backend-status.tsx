"use client";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Zustand = "prueft" | "verbunden" | "streamt" | "weg";

type BackendStatusProps = {
  online: boolean | undefined;
  endpoint: string | undefined;
  isStreaming: boolean;
  latencyMs?: number | null;
  checkedAt?: number;
};

const ZUSTAENDE: Record<
  Zustand,
  {
    kurz: string;
    titel: string;
    punkt: string;
    schein: string;
    pille: string;
    puls: boolean;
  }
> = {
  prueft: {
    kurz: "checking…",
    titel: "Checking the backend",
    punkt: "bg-muted-foreground/50",
    schein: "bg-muted-foreground/20",
    pille: "ring-border/50 text-muted-foreground",
    puls: false,
  },
  verbunden: {
    kurz: "connected",
    titel: "Connected",
    punkt: "bg-emerald-500",
    schein: "bg-emerald-500/30",
    pille: "ring-border/60 text-muted-foreground hover:text-foreground",
    puls: true,
  },
  streamt: {
    kurz: "generating",
    titel: "Streaming a response",
    punkt: "bg-primary",
    schein: "bg-primary/30",
    pille: "ring-border/60 text-foreground",
    puls: true,
  },
  weg: {
    kurz: "offline",
    titel: "Not reachable",
    punkt: "bg-destructive",
    schein: "bg-destructive/30",
    pille: "bg-destructive/[0.07] ring-destructive/40 text-destructive",
    puls: false,
  },
};

export function BackendStatus({
  online,
  endpoint,
  isStreaming,
  latencyMs,
  checkedAt,
}: BackendStatusProps) {
  const zustand: Zustand = isStreaming
    ? "streamt"
    : online === undefined
      ? "prueft"
      : online
        ? "verbunden"
        : "weg";

  const art = ZUSTAENDE[zustand];
  const ziel = zerlegen(endpoint);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={cn(
              "flex cursor-default items-center gap-2 rounded-full py-1 ps-2 pe-2.5 text-xs font-medium ring-1 ring-inset transition-colors select-none",
              art.pille,
            )}
          />
        }
      >
        <Punkt art={art} groesse="klein" />
        {art.kurz}
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
            art.schein,
          )}
        />

        <div className="relative flex flex-col gap-2.5 p-3.5">
          <div className="flex items-center gap-2">
            <Punkt art={art} groesse="gross" />
            <span className="text-[13px] leading-none font-medium tracking-tight">
              {art.titel}
            </span>

            {typeof latencyMs === "number" ? (
              <span className="ms-auto rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                {latencyMs} ms
              </span>
            ) : null}
          </div>

          {ziel ? (
            <div className="flex flex-col gap-0.5 font-mono text-[11px] leading-relaxed">
              <span className="truncate">
                <span className="text-muted-foreground/50">{ziel.schema}</span>
                <span className="text-foreground/90">{ziel.host}</span>
              </span>
              {ziel.pfad ? (
                <span className="break-all text-muted-foreground/60">
                  {ziel.pfad}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="relative border-t border-border/60 px-3.5 py-2 text-[10px] leading-relaxed text-muted-foreground/70">
          {fusszeile(zustand, checkedAt)}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function Punkt({
  art,
  groesse,
}: {
  art: (typeof ZUSTAENDE)[Zustand];
  groesse: "klein" | "gross";
}) {
  const s = groesse === "klein" ? "size-1.5" : "size-2";
  return (
    <span className={cn("relative flex shrink-0", s)}>
      {art.puls ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-75",
            art.punkt,
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex rounded-full", s, art.punkt)} />
    </span>
  );
}

function fusszeile(zustand: Zustand, checkedAt?: number): string {
  if (zustand === "weg") return "Nothing is answering on this port.";
  if (zustand === "prueft") return "Reaching out…";
  if (zustand === "streamt") return "A response is coming in right now.";
  return checkedAt ? `Checked ${seit(checkedAt)}.` : "Reachable.";
}

function seit(zeitpunkt: number): string {
  const sekunden = Math.max(0, Math.round((Date.now() - zeitpunkt) / 1000));
  if (sekunden < 5) return "just now";
  if (sekunden < 60) return `${sekunden}s ago`;
  const minuten = Math.round(sekunden / 60);
  if (minuten < 60) return `${minuten}m ago`;
  return `${Math.round(minuten / 60)}h ago`;
}

function zerlegen(endpoint: string | undefined) {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    return { schema: `${url.protocol}//`, host: url.host, pfad: url.pathname };
  } catch {
    return { schema: "", host: endpoint, pfad: "" };
  }
}
