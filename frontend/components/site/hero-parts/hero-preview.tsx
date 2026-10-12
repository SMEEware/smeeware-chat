"use client";

import * as React from "react";
import { motion, useInView, useScroll, useTransform } from "motion/react";
import {
  ArrowUpIcon,
  BrainIcon,
  CheckIcon,
  MicIcon,
  PaperclipIcon,
  WrenchIcon,
} from "lucide-react";

import { useT } from "@/context/i18n-provider";
import { useHeroMotion } from "@/components/site/hero-parts/context";
import { HeroSatellites, HeroSatellitesLite } from "@/components/site/hero-parts/hero-satellites";
import { cn } from "@/lib/utils";

const STEP_DELAYS = [700, 1000, 1150, 950, 0, 500];
const FRESH = 6;

export function HeroPreview() {
  const t = useT();
  const { mode, scroll } = useHeroMotion();
  const full = mode === "full";
  const lite = mode === "lite";
  const animated = mode !== "static";
  const answer = t("hero.previewAnswer");
  const box = React.useRef<HTMLDivElement>(null);
  const visible = useInView(box, { amount: 0.35 });

  const { scrollYProgress: reveal } = useScroll({
    target: box,
    offset: ["start end", "start 0.3"],
  });
  const revealRotate = useTransform(reveal, [0, 1], [52, 0]);
  const revealScale = useTransform(reveal, [0, 1], [0.78, 1]);
  const revealY = useTransform(reveal, [0, 1], [90, 0]);
  const revealOpacity = useTransform(reveal, [0, 0.55], [0.15, 1]);

  const [step, setStep] = React.useState(0);
  const [typed, setTyped] = React.useState(0);
  const shownStep = animated ? step : 4;
  const shownTyped = animated ? typed : answer.length;

  React.useEffect(() => {
    if (!animated) return;
    if (step === 0 && !visible) return;
    if (step === 4) {
      if (typed < answer.length) {
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
  }, [step, typed, animated, visible, answer.length]);

  const typing = shownStep === 4 && shownTyped < answer.length;
  const busy = shownStep === 2 || shownStep === 3 || typing;

  const rotateX = useTransform(scroll, [0, 1], [0, 32]);
  const scale = useTransform(scroll, [0, 1], [1, 0.8]);
  const lift = useTransform(scroll, [0, 1], [0, -40]);

  const settled = answer.slice(0, Math.max(0, shownTyped - FRESH));
  const fresh = typing
    ? answer.slice(Math.max(0, shownTyped - FRESH), shownTyped)
    : "";
  const text = typing ? settled : answer.slice(0, shownTyped);

  return (
    <div ref={box} aria-hidden className="relative w-full min-w-0">
      <motion.div
        initial={
          !animated || lite
            ? false
            : {
                opacity: 0,
                y: 180,
                rotateX: 48,
                rotateZ: -6,
                scale: 0.78,
                filter: "blur(20px)",
              }
        }
        animate={
          lite
            ? undefined
            : {
                opacity: 1,
                y: 0,
                rotateX: 0,
                rotateZ: 0,
                scale: 1,
                filter: "blur(0px)",
              }
        }
        transition={{
          default: { type: "spring", stiffness: 60, damping: 15, delay: 0.7 },
          opacity: { duration: 0.6, delay: 0.7 },
          filter: { duration: 1, delay: 0.7 },
        }}
        style={
          lite
            ? {
                rotateX: revealRotate,
                scale: revealScale,
                y: revealY,
                opacity: revealOpacity,
                transformPerspective: 1100,
                transformOrigin: "50% 100%",
              }
            : { transformPerspective: 1600 }
        }
        className="relative isolate w-full min-w-0"
      >
        <motion.div
          style={
            full
              ? {
                  rotateX,
                  scale,
                  y: lift,
                  transformPerspective: 1400,
                  transformStyle: "preserve-3d",
                }
              : undefined
          }
          className="relative"
        >
          <motion.div
            className="absolute -inset-10 -z-10 rounded-[3rem] bg-primary/25 blur-3xl dark:bg-primary/30"
            animate={
              animated
                ? {
                    opacity: busy ? [0.55, 1, 0.55] : 0.55,
                    scale: busy ? [1, 1.06, 1] : 1,
                  }
                : undefined
            }
            transition={{
              duration: 1.6,
              repeat: busy ? Infinity : 0,
              ease: "easeInOut",
            }}
          />

          <div className="relative rounded-3xl">
            {animated ? (
              <span aria-hidden className="hero-beam z-10 rounded-3xl" />
            ) : null}

            <div className="relative overflow-hidden rounded-3xl border bg-card/95 shadow-2xl shadow-black/10 ring-1 ring-black/5 dark:shadow-black/50 dark:ring-white/10">
              <div className="relative flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
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
                  {t("hero.previewLocal")}
                </span>
                {animated && busy ? (
                  <span className="absolute inset-x-0 -bottom-px h-px overflow-hidden">
                    <span className="hero-scan block h-full w-1/2 bg-gradient-to-r from-transparent via-primary to-transparent" />
                  </span>
                ) : null}
              </div>

              <div className="flex h-[19rem] flex-col justify-end gap-3 px-4 py-4 sm:h-[20rem]">
                <PreviewItem show={shownStep >= 1} className="items-end">
                  <div className="w-fit max-w-[85%] rounded-3xl border bg-background px-4 py-3 text-sm leading-relaxed shadow-sm">
                    {t("hero.previewQuestion")}
                  </div>
                </PreviewItem>

                <PreviewItem show={shownStep >= 2}>
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <BrainIcon
                      className={cn(
                        "size-3.5 shrink-0",
                        shownStep === 2
                          ? "animate-pulse text-primary"
                          : "text-muted-foreground",
                      )}
                    />
                    {shownStep === 2 ? (
                      <span className="hero-shimmer">
                        {t("hero.previewThinking")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {t("hero.previewThought")}
                      </span>
                    )}
                  </div>
                </PreviewItem>

                <PreviewItem show={shownStep >= 3}>
                  <div
                    className={cn(
                      "flex w-fit max-w-full items-center gap-2 rounded-2xl border bg-muted/40 px-3 py-2 transition-colors duration-500",
                      shownStep === 3 && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-mono text-xs font-medium">
                      read_file
                    </span>
                    <span className="truncate font-mono text-xs text-muted-foreground/70">
                      path=notes.md
                    </span>
                    {shownStep >= 4 ? (
                      <motion.span
                        initial={{ scale: 0, rotate: -90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 14,
                        }}
                      >
                        <CheckIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      </motion.span>
                    ) : (
                      <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
                    )}
                  </div>
                </PreviewItem>

                <PreviewItem show={shownStep >= 4}>
                  <p className="max-w-[92%] text-sm leading-relaxed">
                    {text}
                    {fresh ? (
                      <span className="text-primary [text-shadow:0_0_12px_var(--primary)]">
                        {fresh}
                      </span>
                    ) : null}
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
                    {t("hero.previewPlaceholder")}
                  </span>
                  <MicIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40">
                    <ArrowUpIcon className="size-4" />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {full ? <HeroSatellites /> : lite ? <HeroSatellitesLite /> : null}
        </motion.div>
      </motion.div>
    </div>
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
          ? { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
          : { opacity: 0, y: 12, scale: 0.98, filter: "blur(6px)" }
      }
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className={cn("flex flex-col gap-2", className)}
    >
      {children}
    </motion.div>
  );
}
