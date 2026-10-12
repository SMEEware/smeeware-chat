"use client";

import * as React from "react";
import { motion, type Variants } from "motion/react";

import { useT } from "@/context/i18n-provider";
import { useHeroMotion } from "@/components/site/hero-parts/context";

const GLYPHS = "!<>-_\\/[]{}=+*^?#01ΔΣ";

function useScramble(text: string, run: boolean, delayMs: number) {
  const [output, setOutput] = React.useState(text);

  React.useEffect(() => {
    if (!run) return;
    let frame = 0;
    const begin = performance.now() + delayMs;
    const duration = 1200;
    const tick = (now: number) => {
      const progress = Math.max(0, (now - begin) / duration);
      const revealed = Math.floor(progress * text.length);
      let next = "";
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === " " || i < revealed) next += char;
        else if (now < begin) next += " ";
        else next += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      setOutput(next);
      if (revealed < text.length) frame = requestAnimationFrame(tick);
      else setOutput(text);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, run, delayMs]);

  return run ? output : text;
}

const letter: Variants = {
  hidden: { opacity: 0, y: "0.7em", rotateX: -95, filter: "blur(12px)" },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    rotateX: 0,
    filter: "blur(0px)",
    transition: { type: "spring", damping: 13, stiffness: 150, delay: 0.25 + i * 0.04 },
  }),
};

export function HeroHeadline() {
  const t = useT();
  const { mode } = useHeroMotion();
  const lead = t("hero.titleLead");
  const accent = t("hero.titleAccent");
  const full = mode === "full";
  const animated = mode !== "static";
  const scrambled = useScramble(accent, animated, 250 + lead.length * 40);

  let index = 0;
  const words = lead.split(" ").map((word) => ({
    word,
    letters: Array.from(word).map((char) => ({ char, i: index++ })),
  }));

  return (
    <h1 className="mt-6 font-heading text-[2.6rem] leading-[1.02] font-semibold tracking-tighter min-[400px]:text-5xl sm:text-6xl lg:mt-7 lg:text-[4.5rem] lg:leading-[0.95]">
      <span className="sr-only">
        {lead} {accent}
      </span>

      <span
        aria-hidden
        className="block font-display font-extrabold tracking-[-0.035em] [font-variation-settings:'opsz'_96] [perspective:900px]"
      >
        {words.map(({ word, letters }, w) => (
          <React.Fragment key={`${word}-${w}`}>
            {w > 0 ? " " : null}
            <span className="inline-block whitespace-nowrap">
              {letters.map(({ char, i }) => (
                <motion.span
                  key={i}
                  custom={i}
                  variants={letter}
                  initial={animated ? "hidden" : false}
                  animate="show"
                  whileHover={
                    full
                      ? {
                          y: -14,
                          rotateZ: i % 2 ? 4 : -4,
                          color: "var(--primary)",
                          transition: { type: "spring", stiffness: 420, damping: 12 },
                        }
                      : undefined
                  }
                  className="inline-block origin-bottom will-change-transform"
                >
                  {char}
                </motion.span>
              ))}
            </span>
          </React.Fragment>
        ))}
      </span>

      <motion.span
        aria-hidden
        initial={false}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative mt-1 block pb-2 text-balance"
      >
        <span className="invisible">{accent}</span>
        <span className="hero-accent absolute inset-0">{scrambled}</span>
        {full ? (
          <span className="hero-accent hero-accent-glow pointer-events-none absolute inset-0 blur-2xl">
            {scrambled}
          </span>
        ) : null}
      </motion.span>
    </h1>
  );
}
