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
import { useT } from "@/context/i18n-provider";

export type SystemData = {
  timestamp: string;
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
    cores: number;
    physical: number;
    usage: number;
    load: number[];
    load_per_core: number | null;
  };
  memory: {
    total_gb: number;
    used_gb: number;
    free_gb: number;
    percent: number;
    swap_used_gb: number;
  };
  disk: { total_gb: number; free_gb: number; percent: number };
  process: { rss_mb: number; threads: number; uptime: string };
  services: { ollama?: { status: string; loaded?: string | null } | null };
  notices: string[];
};

function tone(percent: number): { bars: string; text: string } {
  if (percent >= 90) return { bars: "bg-destructive", text: "text-destructive" };
  if (percent >= 75) return { bars: "bg-orange-500", text: "text-orange-500" };
  if (percent >= 55) return { bars: "bg-yellow-500", text: "text-yellow-500" };
  return { bars: "bg-emerald-500", text: "text-emerald-500" };
}

export function SystemModal({
  data,
  onClose,
}: {
  data: SystemData;
  onClose: () => void;
}) {
  const t = useT();
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { cpu, memory, disk, process, host, services, notices } = data;
  const cpuLoad =
    cpu.load_per_core !== null ? Math.min(100, cpu.load_per_core * 100) : cpu.usage;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("systemModal.systemCheck")}
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
                {t("systemModal.systemCheck")}
              </h2>
              {host.container ? (
                <span
                  title={t("systemModal.containerTitle")}
                  className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/50 px-1.5 py-px font-mono text-[9px] tracking-wide text-muted-foreground uppercase"
                >
                  <BoxIcon className="size-2.5" />
                  {host.container}
                </span>
              ) : null}
            </div>
            <p className="truncate text-[11px] text-muted-foreground/60">
              {t("systemModal.subtitle", { hostname: host.hostname, system: host.system, release: host.release, machine: host.machine, uptime: host.uptime })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("systemModal.close")}
            className="ms-auto flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="relative flex flex-col gap-3.5 border-t border-border/60 px-5 py-4">
          <Metric
            icon={<CpuIcon className="size-3.5" />}
            label={t("systemModal.cpu")}
            value={t("systemModal.cpuValue", { usage: cpu.usage, load: cpu.load[0] ?? "–", cores: cpu.cores })}
            percent={cpuLoad}
          />
          <Metric
            icon={<MemoryStickIcon className="size-3.5" />}
            label={t("systemModal.memory")}
            value={`${t("systemModal.memoryValue", { used: memory.used_gb, total: memory.total_gb })}${
              memory.swap_used_gb
                ? t("systemModal.memorySwap", { swap: memory.swap_used_gb })
                : ""
            }`}
            percent={memory.percent}
          />
          <Metric
            icon={<HardDriveIcon className="size-3.5" />}
            label={t("systemModal.disk")}
            value={t("systemModal.diskValue", { free: disk.free_gb, total: disk.total_gb })}
            percent={disk.percent}
          />
        </div>

        <div className="relative grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/60 px-5 py-4 text-[11px]">
          <InfoRow
            icon={<ServerIcon className="size-3" />}
            label={t("systemModal.backend")}
            value={t("systemModal.backendValue", { rss: process.rss_mb, threads: process.threads, uptime: process.uptime })}
          />
          <InfoRow
            label={t("systemModal.ollama")}
            value={services.ollama?.status ?? t("systemModal.disabled")}
          />
          {services.ollama?.loaded ? (
            <InfoRow
              label={t("systemModal.loaded")}
              value={services.ollama.loaded}
              wide
            />
          ) : null}
        </div>

        {notices.length > 0 ? (
          <div className="relative flex flex-col gap-2 border-t border-amber-500/25 bg-amber-500/[0.06] px-5 py-4">
            {notices.map((notice) => (
              <p
                key={notice}
                className="flex items-start gap-2 text-[12px] leading-relaxed text-foreground/85"
              >
                <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                {notice}
              </p>
            ))}
          </div>
        ) : (
          <p className="relative border-t border-border/60 px-5 py-3.5 text-[12px] text-muted-foreground/70">
            {t("systemModal.allNormal")}
          </p>
        )}
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  percent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  percent: number;
}) {
  const color = tone(percent);
  const [grown, setGrown] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-muted-foreground/50">{icon}</span>
        <span className="font-medium text-foreground/80">{label}</span>
        <span className="ms-auto tabular-nums text-muted-foreground/70">
          {value}
        </span>
        <span className={cn("w-9 text-right font-medium tabular-nums", color.text)}>
          {Math.round(percent)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/70 ring-1 ring-inset ring-border/40">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-out",
            color.bars,
          )}
          style={{ width: grown ? `${Math.min(100, percent)}%` : "0%" }}
        />
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  wide,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", wide && "col-span-2")}>
      <span className="flex items-center gap-1.5 text-muted-foreground/45">
        {icon}
        {label}
      </span>
      <span className="truncate text-foreground/80 tabular-nums">{value}</span>
    </div>
  );
}
