"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, type Variants } from "motion/react";
import { ArrowRightIcon, LockIcon } from "lucide-react";

import { DottedGlowBackground } from "@/components/ui/dotted-glow-background";
import { Kbd } from "@/components/ui/kbd";
import {
  HeroMotionContext,
  useHeroMode,
  useHeroMotion,
} from "@/components/site/hero-parts/context";
import { HeroActions } from "@/components/site/hero-parts/hero-actions";
import { HeroGrid } from "@/components/site/hero-parts/hero-grid";
import { HeroHeadline } from "@/components/site/hero-parts/hero-headline";
import { HeroMarquee } from "@/components/site/hero-parts/hero-marquee";
import { HeroPreview } from "@/components/site/hero-parts/hero-preview";
import { useT } from "@/context/i18n-provider";

export function Hero() {
  const mode = useHeroMode();
  const full = mode === "full";
  const ref = React.useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -160]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  const context = React.useMemo(
    () => ({ mode, scroll: scrollYProgress }),
    [mode, scrollYProgress],
  );

  return (
    <HeroMotionContext.Provider value={context}>
      <section
        ref={ref}
        id="hero"
        className="relative isolate flex flex-col overflow-hidden border-b lg:min-h-[calc(100svh-3.5rem)]"
      >
        <HeroBackdrop grid={<HeroGrid host={ref} interactive={mode !== "static"} />} />

        <div className="relative mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-20 px-5 pt-14 pb-12 sm:px-6 md:pt-20 lg:grid-cols-2 lg:gap-12 lg:pt-16">
          <motion.div style={full ? { y: copyY, opacity: copyOpacity } : undefined}>
            <HeroCopy />
          </motion.div>
          <HeroPreview />
        </div>

        <motion.div
          initial={mode === "static" ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: full ? 2.4 : 1.1 }}
          className="relative pt-2 pb-14"
        >
          <HeroMarquee />
        </motion.div>
      </section>
    </HeroMotionContext.Provider>
  );
}

export function HeroBackdrop({ grid }: { grid?: React.ReactNode }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {grid ?? (
        <>
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
        </>
      )}

      <div className="hero-aurora absolute -top-48 left-1/3 size-[36rem] rounded-full bg-black/10 blur-[130px] dark:bg-primary/35" />
      <div className="hero-aurora-slow absolute top-1/4 -right-32 size-[30rem] rounded-full bg-black/6 blur-[130px] dark:bg-primary/25" />

      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}

const rise: Variants = {
  hidden: { opacity: 0, y: 26, filter: "blur(10px)" },
  show: (delay: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] },
  }),
};

function HeroCopy() {
  const t = useT();
  const { mode } = useHeroMotion();
  const full = mode === "full";
  const initial = mode === "static" ? false : "hidden";
  const pace = full ? 1 : 0.7;
  const status = [
    {
      label: t("hero.chipStreaming"),
      indicator: (
        <span aria-hidden className="flex h-2.5 items-end gap-[2px]">
          {[0, 0.18, 0.36].map((delay) => (
            <span
              key={delay}
              className="status-eq h-full w-[2px] rounded-full bg-(--git-hot)"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </span>
      ),
    },
    {
      label: t("hero.chipLocalHosted"),
      indicator: (
        <span aria-hidden className="relative flex h-1.5 w-4 items-center rounded-full bg-(--git)/20">
          <span className="status-toggle size-1.5 rounded-full bg-(--git-hot) shadow-[0_0_6px_var(--git-glow)]" />
        </span>
      ),
    },
    {
      label: t("hero.chipEncrypted"),
      indicator: (
        <span aria-hidden className="relative flex size-3 items-center justify-center overflow-hidden">
          <LockIcon className="size-3 text-(--git-hot)" />
          <span className="status-scan absolute inset-x-0 top-0 h-px bg-white/80 shadow-[0_0_4px_rgb(255_255_255/0.8)]" />
        </span>
      ),
    },
  ];
  const words = t("hero.subtitle").split(" ");

  return (
    <div className="flex min-w-0 flex-col items-start text-left">
      <motion.div variants={rise} custom={0.05} initial={initial} animate="show">
        <Link
          href="/docs/chat/voice-call"
          className="hero-shine group inline-flex items-center gap-2.5 rounded-full border border-(--git)/25 bg-card/85 py-1 pr-3 pl-1 text-xs text-muted-foreground shadow-sm transition-colors hover:border-(--git)/50 hover:text-foreground"
        >
          <span className="relative inline-flex items-center gap-1.5 rounded-full bg-(--git) px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.14em] text-white uppercase shadow-[0_0_14px_var(--git-glow)]">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full motion-safe:animate-ping rounded-full bg-white opacity-70" />
              <span className="relative inline-flex size-1.5 rounded-full bg-white" />
            </span>
            {t("hero.badgeTag")}
          </span>
          {t("hero.badgeText")}
          <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </motion.div>

      <HeroHeadline />

      <p className="mt-5 max-w-lg text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg lg:mt-6">
        {words.map((word, i) => (
          <React.Fragment key={`${word}-${i}`}>
            <motion.span
              variants={rise}
              custom={(1.05 + i * 0.022) * pace}
              initial={initial}
              animate="show"
              className="inline-block"
            >
              {word}
            </motion.span>{" "}
          </React.Fragment>
        ))}
      </p>

      <motion.div
        variants={rise}
        custom={1.6 * pace}
        initial={initial}
        animate="show"
        className="mt-8 w-full sm:w-auto lg:mt-9"
      >
        <HeroActions />
      </motion.div>

      <motion.div
        variants={rise}
        custom={1.85 * pace}
        initial={initial}
        animate="show"
        className="mt-7 flex flex-wrap items-stretch gap-2 font-mono text-[10.5px] tracking-[0.14em] text-muted-foreground uppercase sm:gap-0 sm:rounded-full sm:border sm:border-(--git)/20 sm:bg-card/85 sm:shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] lg:mt-8"
      >
        {status.map((item) => (
          <span
            key={item.label}
            className="group/seg relative flex items-center gap-2 rounded-full border border-(--git)/20 bg-card/85 px-3 py-1.5 transition-colors duration-300 after:absolute after:inset-x-3 after:bottom-0 after:h-px after:origin-left after:scale-x-0 after:bg-linear-to-r after:from-transparent after:via-(--git) after:to-transparent after:transition-transform after:duration-500 hover:text-foreground hover:after:scale-x-100 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-3.5 sm:[&+&]:border-l sm:[&+&]:border-(--git)/15"
          >
            {item.indicator}
            <span className="whitespace-nowrap">{item.label}</span>
          </span>
        ))}
      </motion.div>

      <motion.p
        variants={rise}
        custom={2.2 * pace}
        initial={initial}
        animate="show"
        className="mt-5 hidden items-center gap-2 text-xs text-muted-foreground md:flex"
      >
        {t("hero.searchHintBefore")} <Kbd>⌘</Kbd>
        <Kbd>K</Kbd> {t("hero.searchHintAfter")}
      </motion.p>
    </div>
  );
}
