"use client";

import * as React from "react";
import {
  ActivityIcon,
  BoxIcon,
  CpuIcon,
  HardDriveIcon,
  MemoryStickIcon,
  ServerIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type Systemdaten = {
  zeitpunkt: string;
  host: {
    hostname: string;
    system: string;
    release: string;
    machine: string;
    python: string;
    uptime: string;
    container?: string | null;
  };
  cpu: {
    kerne: number;
    physisch: number;
    auslastung: number;
    last: number[];
    last_je_kern: number | null;
  };
  speicher: {
    gesamt_gb: number;
    benutzt_gb: number;
    frei_gb: number;
    prozent: number;
    swap_benutzt_gb: number;
  };
  platte: { gesamt_gb: number; frei_gb: number; prozent: number };
  prozess: { rss_mb: number; threads: number; laufzeit: string };
  dienste: { ollama?: { status: string; geladen?: string | null } | null };
  hinweise: string[];
};

function ton(prozent: number): { balken: string; text: string } {
  if (prozent >= 90) return { balken: "bg-destructive", text: "text-destructive" };
  if (prozent >= 75) return { balken: "bg-orange-500", text: "text-orange-500" };
  if (prozent >= 55) return { balken: "bg-yellow-500", text: "text-yellow-500" };
  return { balken: "bg-emerald-500", text: "text-emerald-500" };
}

export function SystemModal({
  daten,
  onClose,
}: {
  daten: Systemdaten;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const aufTaste = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", aufTaste);
    return () => window.removeEventListener("keydown", aufTaste);
  }, [onClose]);

  const { cpu, speicher, platte, prozess, host, dienste, hinweise } = daten;
  const cpuLast =
    cpu.last_je_kern !== null ? Math.min(100, cpu.last_je_kern * 100) : cpu.auslastung;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="System check"
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-background/95 shadow-2xl shadow-black/20 ring-1 ring-border/70 backdrop-blur-xl ring-inset dark:shadow-black/50 animate-in zoom-in-95 slide-in-from-bottom-2 duration-300"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 size-48 -translate-x-1/2 rounded-full bg-primary/20 opacity-40 blur-3xl"
        />

        <div className="relative flex items-start gap-3 px-5 pt-5 pb-4">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ActivityIcon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-[15px] font-semibold tracking-tight">
                System check
              </h2>
              {host.container ? (
                <span
                  title="Runs in a container — CPU/RAM/uptime are the host's, the hostname is the container id."
                  className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/50 px-1.5 py-px font-mono text-[9px] tracking-wide text-muted-foreground uppercase"
                >
                  <BoxIcon className="size-2.5" />
                  {host.container}
                </span>
              ) : null}
            </div>
            <p className="truncate text-[11px] text-muted-foreground/60">
              {host.hostname} · {host.system} {host.release} · {host.machine} ·
              up {host.uptime}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ms-auto flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="relative flex flex-col gap-3.5 border-t border-border/60 px-5 py-4">
          <Messwert
            icon={<CpuIcon className="size-3.5" />}
            label="CPU"
            wert={`${cpu.auslastung}% · load ${cpu.last[0] ?? "–"} on ${cpu.kerne} cores`}
            prozent={cpuLast}
          />
          <Messwert
            icon={<MemoryStickIcon className="size-3.5" />}
            label="Memory"
            wert={`${speicher.benutzt_gb} / ${speicher.gesamt_gb} GB${
              speicher.swap_benutzt_gb
                ? ` · swap ${speicher.swap_benutzt_gb} GB`
                : ""
            }`}
            prozent={speicher.prozent}
          />
          <Messwert
            icon={<HardDriveIcon className="size-3.5" />}
            label="Disk"
            wert={`${platte.frei_gb} GB free of ${platte.gesamt_gb} GB`}
            prozent={platte.prozent}
          />
        </div>

        <div className="relative grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/60 px-5 py-4 text-[11px]">
          <Zeile
            icon={<ServerIcon className="size-3" />}
            label="Backend"
            wert={`${prozess.rss_mb} MB · ${prozess.threads} threads · up ${prozess.laufzeit}`}
          />
          <Zeile
            label="Ollama"
            wert={dienste.ollama?.status ?? "disabled"}
          />
          {dienste.ollama?.geladen ? (
            <Zeile
              label="Loaded"
              wert={dienste.ollama.geladen}
              breit
            />
          ) : null}
        </div>

        {hinweise.length > 0 ? (
          <div className="relative flex flex-col gap-2 border-t border-amber-500/25 bg-amber-500/[0.06] px-5 py-4">
            {hinweise.map((hinweis) => (
              <p
                key={hinweis}
                className="flex items-start gap-2 text-[12px] leading-relaxed text-foreground/85"
              >
                <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                {hinweis}
              </p>
            ))}
          </div>
        ) : (
          <p className="relative border-t border-border/60 px-5 py-3.5 text-[12px] text-muted-foreground/70">
            Nothing stands out — every reading is in a normal range.
          </p>
        )}
      </div>
    </div>
  );
}

function Messwert({
  icon,
  label,
  wert,
  prozent,
}: {
  icon: React.ReactNode;
  label: string;
  wert: string;
  prozent: number;
}) {
  const farbe = ton(prozent);
  const [gewachsen, setGewachsen] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setGewachsen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-muted-foreground/50">{icon}</span>
        <span className="font-medium text-foreground/80">{label}</span>
        <span className="ms-auto tabular-nums text-muted-foreground/70">
          {wert}
        </span>
        <span className={cn("w-9 text-right font-medium tabular-nums", farbe.text)}>
          {Math.round(prozent)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/70 ring-1 ring-inset ring-border/40">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-out",
            farbe.balken,
          )}
          style={{ width: gewachsen ? `${Math.min(100, prozent)}%` : "0%" }}
        />
      </div>
    </div>
  );
}

function Zeile({
  icon,
  label,
  wert,
  breit,
}: {
  icon?: React.ReactNode;
  label: string;
  wert: string;
  breit?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", breit && "col-span-2")}>
      <span className="flex items-center gap-1.5 text-muted-foreground/45">
        {icon}
        {label}
      </span>
      <span className="truncate text-foreground/80 tabular-nums">{wert}</span>
    </div>
  );
}
