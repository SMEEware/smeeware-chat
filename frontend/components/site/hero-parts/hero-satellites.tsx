"use client";

import * as React from "react";
import { AnimatePresence, motion, useSpring, useTransform } from "motion/react";
import { AudioLinesIcon, BrainIcon, GaugeIcon } from "lucide-react";

import { useT } from "@/context/i18n-provider";
import { cn } from "@/lib/utils";

const MODELS = [
  { name: "DeepSeek V4 Flash", local: false },
  { name: "GPT-5.6 Terra", local: false },
  { name: "qwen3:8b", local: true },
];

function Satellite({
  delay,
  float,
  className,
  children,
}: {
  delay: number;
  float: number;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("absolute z-20", className)}>
      <motion.div
        initial={{ opacity: 0, scale: 0.4, filter: "blur(14px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)", y: [0, -float, 0] }}
        transition={{
          opacity: { delay, duration: 0.5 },
          filter: { delay, duration: 0.6 },
          scale: { delay, type: "spring", stiffness: 160, damping: 13 },
          y: { delay: delay + 0.6, duration: 4 + float / 3, repeat: Infinity, ease: "easeInOut" },
        }}
        className="rounded-2xl border bg-card/92 p-3 shadow-2xl shadow-black/20 ring-1 ring-white/5 dark:shadow-black/50"
      >
        {children}
      </motion.div>
    </div>
  );
}

function Waveform() {
  return (
    <span className="flex h-6 items-center gap-[3px]">
      {[0.5, 0.9, 0.6, 1, 0.7, 0.4, 0.8].map((peak, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-primary"
          animate={{ height: ["20%", `${peak * 100}%`, "35%", `${peak * 80}%`, "20%"] }}
          transition={{ duration: 1.1 + i * 0.07, repeat: Infinity, ease: "easeInOut", delay: i * 0.08 }}
        />
      ))}
    </span>
  );
}

function TokenRate() {
  const rate = useSpring(132, { stiffness: 60, damping: 16 });
  const shown = useTransform(rate, (v) => Math.round(v));

  React.useEffect(() => {
    const id = setInterval(() => rate.set(118 + Math.random() * 52), 1100);
    return () => clearInterval(id);
  }, [rate]);

  return (
    <span className="flex items-baseline gap-1">
      <motion.span className="font-mono text-xl font-semibold tabular-nums">{shown}</motion.span>
      <span className="text-[11px] text-muted-foreground">tok/s</span>
    </span>
  );
}

function Sparkline() {
  return (
    <svg viewBox="0 0 120 28" className="h-7 w-28 overflow-visible">
      <defs>
        <linearGradient id="hero-spark" x1="0" x2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="1" />
        </linearGradient>
      </defs>
      <motion.path
        d="M0 20 C 10 6, 18 24, 28 14 S 46 4, 56 16 S 74 26, 84 10 S 104 6, 120 12"
        fill="none"
        stroke="url(#hero-spark)"
        strokeWidth="2.2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: [0, 1, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 0.6, ease: "easeInOut" }}
      />
    </svg>
  );
}

function ModelCycler() {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % MODELS.length), 2400);
    return () => clearInterval(id);
  }, []);

  const model = MODELS[index];
  return (
    <span className="relative flex h-5 min-w-36 items-center overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={model.name}
          initial={{ y: 18, opacity: 0, filter: "blur(4px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: -18, opacity: 0, filter: "blur(4px)" }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="flex items-center gap-1.5 font-mono text-xs font-medium whitespace-nowrap"
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              model.local ? "bg-emerald-500" : "bg-primary",
            )}
          />
          {model.name}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function HeroSatellites() {
  const t = useT();

  return (
    <>
      <Satellite delay={1.5} float={8} className="-top-24 left-2 w-52">
        <span className="flex items-center gap-2 text-xs font-semibold">
          <span className="flex size-6 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <BrainIcon className="size-3.5" />
          </span>
          {t("hero.satReasonTitle")}
        </span>
        <span className="mt-2 block space-y-1.5">
          {[92, 74, 58].map((width, i) => (
            <motion.span
              key={width}
              className="block h-1.5 rounded-full bg-muted-foreground/20"
              animate={{ width: [`${width * 0.3}%`, `${width}%`, `${width}%`] }}
              transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.25, ease: "easeInOut" }}
            />
          ))}
        </span>
      </Satellite>

      <Satellite delay={1.7} float={10} className="top-[12%] -right-16 w-44">
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-xs font-semibold">
            <span className="flex size-6 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <AudioLinesIcon className="size-3.5" />
            </span>
            {t("hero.satVoiceTitle")}
          </span>
          <span className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/70" />
            <span className="relative size-2 rounded-full bg-emerald-500" />
          </span>
        </span>
        <span className="mt-2 flex items-center justify-between">
          <Waveform />
          <span className="text-[10px] text-muted-foreground">{t("hero.satVoiceText")}</span>
        </span>
      </Satellite>

      <Satellite delay={1.9} float={7} className="-bottom-24 -left-8">
        <span className="flex items-center gap-3">
          <span className="flex flex-col">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <GaugeIcon className="size-3 text-primary" />
              {t("hero.satSpeedTitle")}
            </span>
            <TokenRate />
          </span>
          <Sparkline />
        </span>
      </Satellite>

      <Satellite delay={2.1} float={6} className="-top-20 right-0">
        <span className="flex items-center gap-2.5">
          <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            {t("hero.satModelTitle")}
          </span>
          <ModelCycler />
        </span>
      </Satellite>

    </>
  );
}

export function HeroSatellitesLite() {
  const t = useT();

  return (
    <>
      <Satellite delay={0.5} float={6} className="-top-16 right-3">
        <span className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <AudioLinesIcon className="size-3.5" />
          </span>
          <span className="text-xs font-semibold">{t("hero.satVoiceTitle")}</span>
          <Waveform />
        </span>
      </Satellite>

      <Satellite delay={0.7} float={5} className="-bottom-12 left-3">
        <span className="flex items-center gap-2.5">
          <GaugeIcon className="size-3.5 text-primary" />
          <TokenRate />
        </span>
      </Satellite>
    </>
  );
}
