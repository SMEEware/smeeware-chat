"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRightIcon,
  ArrowUpIcon,
  BrainIcon,
  CheckIcon,
  CpuIcon,
  LockIcon,
  MicIcon,
  PaperclipIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DottedGlowBackground } from "@/components/ui/dotted-glow-background";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

const chips = [
  { icon: ZapIcon, label: "Streaming" },
  { icon: CpuIcon, label: "Local or hosted" },
  { icon: LockIcon, label: "Encrypted at rest" },
];

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden border-b">
      <HeroBackdrop />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-16 px-6 py-20 md:py-24 lg:grid-cols-2 lg:gap-12 lg:py-28">
        <HeroCopy />
        <HeroPreview />
      </div>
    </section>
  );
}

function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="hero-grid absolute inset-0 opacity-60 dark:opacity-40" />

      <DottedGlowBackground
        className="absolute inset-0 mask-radial-to-85% mask-radial-at-center"
        opacity={0.09}
        gap={11}
        radius={1.5}
        colorLightVar="--color-neutral-500"
        glowColorLightVar="--color-foreground"
        colorDarkVar="--color-neutral-500"
        glowColorDarkVar="--color-primary"
        backgroundOpacity={0}
        speedMin={0.25}
        speedMax={1.4}
      />

      <div className="hero-aurora absolute -top-48 left-1/3 size-[36rem] rounded-full bg-black/10 blur-[130px] dark:bg-primary/35" />
      <div className="hero-aurora-slow absolute top-1/4 -right-32 size-[30rem] rounded-full bg-black/6 blur-[130px] dark:bg-primary/25" />

      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}

function HeroCopy() {
  return (
    <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
      <Link
        href="/docs/changelog"
        className="group inline-flex items-center gap-2 rounded-full border bg-card/70 py-1 pr-3 pl-2.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-70" />
          <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
        </span>
        Version 0.3.0 — streaming, tools, local models
        <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
      </Link>

      <h1 className="mt-7 font-heading text-5xl font-semibold tracking-tighter text-balance md:text-6xl lg:text-[4.25rem] lg:leading-[0.95]">
        SMEEware Chat
        <span className="hero-accent mt-1 block pb-2">runs where you do.</span>
      </h1>

      <p className="mt-6 max-w-lg text-lg leading-relaxed text-pretty text-muted-foreground">
        Reasoning, tool calls and the answer stream in as they happen — with
        your files, your voice and the model you picked. Nothing leaves this
        machine unless you send it.
      </p>

      <div className="mt-9 flex flex-col gap-3 sm:flex-row">
        <div className="relative isolate">
          <span
            aria-hidden
            className="absolute -inset-2 -z-10 rounded-full bg-primary/35 blur-xl"
          />
          <Button
            size="lg"
            className="w-full shadow-lg shadow-primary/25 sm:w-auto"
            nativeButton={false}
            render={
              <Link href="/chat">
                Start chatting
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            }
          />
        </div>

        <Button
          size="lg"
          variant="outline"
          className="bg-card/70 backdrop-blur-sm"
          nativeButton={false}
          render={<Link href="/docs/getting-started">Read the docs</Link>}
        />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className="inline-flex items-center gap-1.5 rounded-full border bg-card/60 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm"
          >
            <chip.icon className="size-3 text-primary" />
            {chip.label}
          </span>
        ))}
      </div>

      <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
        Or search directly with <Kbd>⌘</Kbd>
        <Kbd>K</Kbd> in the docs
      </p>
    </div>
  );
}

const ANSWER =
  "Everything stayed here: the model ran on your machine, the tools read your files, and the answer streamed straight back.";

const STEP_DELAYS = [520, 1000, 1150, 950, 0, 500];

function HeroPreview() {
  const reduced = useReducedMotion();
  const [step, setStep] = React.useState(0);
  const [typed, setTyped] = React.useState(0);

  const shownStep = reduced ? 4 : step;
  const shownTyped = reduced ? ANSWER.length : typed;

  React.useEffect(() => {
    if (reduced) return;

    if (step === 4) {
      if (typed < ANSWER.length) {
        const id = setTimeout(() => setTyped((n) => n + 2), 22);
        return () => clearTimeout(id);
      }
      const id = setTimeout(() => setStep(5), 2800);
      return () => clearTimeout(id);
    }

    const id = setTimeout(() => {
      if (step === 5) {
        setTyped(0);
        setStep(0);
      } else {
        setStep((s) => s + 1);
      }
    }, STEP_DELAYS[step]);
    return () => clearTimeout(id);
  }, [step, typed, reduced]);

  const typing = shownStep === 4 && shownTyped < ANSWER.length;

  return (
    <motion.div
      aria-hidden
      initial={reduced ? false : { opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="relative isolate w-full"
    >
      <div className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-primary/20 blur-3xl dark:bg-primary/25" />

      <div className="overflow-hidden rounded-3xl border bg-card/80 shadow-2xl shadow-black/10 ring-1 ring-black/5 backdrop-blur-xl dark:shadow-black/40 dark:ring-white/10">
        <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="size-2 rounded-full bg-muted-foreground/25" />
            <span className="size-2 rounded-full bg-muted-foreground/25" />
            <span className="size-2 rounded-full bg-muted-foreground/25" />
          </div>
          <span className="ml-1 font-mono text-xs text-muted-foreground">
            deepseek-v4-flash
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            local
          </span>
        </div>

        <div className="flex h-[19rem] flex-col justify-end gap-3 px-4 py-4 sm:h-[20rem]">
          <PreviewItem show={shownStep >= 1} className="self-end">
            <div className="w-fit max-w-[85%] rounded-3xl border bg-background px-4 py-3 text-sm leading-relaxed shadow-sm">
              Does any of this leave my machine?
            </div>
          </PreviewItem>

          <PreviewItem show={shownStep >= 2}>
            <div className="flex items-center gap-2 text-xs font-medium">
              <BrainIcon className="size-3.5 shrink-0 text-muted-foreground" />
              {shownStep === 2 ? (
                <span className="hero-shimmer">thinking</span>
              ) : (
                <span className="text-muted-foreground">Thought for 1.2s</span>
              )}
            </div>
          </PreviewItem>

          <PreviewItem show={shownStep >= 3}>
            <div
              className={cn(
                "flex w-fit max-w-full items-center gap-2 rounded-2xl border bg-muted/40 px-3 py-2",
                shownStep === 3 && "animate-pulse",
              )}
            >
              <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="font-mono text-xs font-medium">read_file</span>
              <span className="truncate font-mono text-xs text-muted-foreground/70">
                path=notes.md
              </span>
              {shownStep >= 4 ? (
                <CheckIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              )}
            </div>
          </PreviewItem>

          <PreviewItem show={shownStep >= 4}>
            <p className="max-w-[92%] text-sm leading-relaxed">
              {ANSWER.slice(0, shownTyped)}
              {typing ? (
                <span className="hero-caret ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-primary" />
              ) : null}
            </p>
          </PreviewItem>
        </div>

        <div className="border-t bg-muted/20 p-3">
          <div className="flex items-center gap-2 rounded-full border bg-background/70 py-1.5 pr-1.5 pl-3">
            <PaperclipIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-sm text-muted-foreground/70">
              Ask anything…
            </span>
            <MicIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ArrowUpIcon className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function PreviewItem({
  show,
  className,
  children,
}: {
  show: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={false}
      animate={
        show
          ? { opacity: 1, y: 0, filter: "blur(0px)" }
          : { opacity: 0, y: 10, filter: "blur(4px)" }
      }
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn("flex flex-col gap-2", className)}
    >
      {children}
    </motion.div>
  );
}
