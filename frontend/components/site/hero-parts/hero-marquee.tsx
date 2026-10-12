"use client";

import * as React from "react";
import {
  motion,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "motion/react";
import {
  AudioLinesIcon,
  BrainCircuitIcon,
  BugIcon,
  GlobeIcon,
  HardDriveIcon,
  MicIcon,
  PlugIcon,
  SearchIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react";

import { useT, useTList } from "@/context/i18n-provider";
import { useHeroMotion } from "@/components/site/hero-parts/context";
import { cn } from "@/lib/utils";

const INTEGRATIONS = [
  { icon: BrainCircuitIcon, label: "DeepSeek" },
  { icon: SparklesIcon, label: "OpenAI" },
  { icon: HardDriveIcon, label: "Ollama" },
  { icon: MicIcon, label: "whisper.cpp" },
  { icon: AudioLinesIcon, label: "ElevenLabs" },
  { icon: SearchIcon, label: "Brave Search" },
  { icon: GlobeIcon, label: "SerpApi" },
  { icon: PlugIcon, label: "MCP" },
  { icon: WandSparklesIcon, label: "Agent Skills" },
  { icon: BugIcon, label: "HackerOne" },
];

const COPIES = 4;
const MAX_BOOST = 3.2;

function wrap(min: number, max: number, value: number) {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
}

function MarqueeRow({
  speed,
  direction,
  lean,
  children,
}: {
  speed: number;
  direction: 1 | -1;
  lean: number;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { margin: "120px 0px" });
  const offset = useMotionValue(0);
  const boost = useMotionValue(0);
  const x = useTransform(offset, (v) => `${wrap(-100 / COPIES, 0, v)}%`);
  const skewX = useTransform(boost, (b) => -direction * b * lean);

  const { scrollY } = useScroll();
  const { scrollYProgress: leaving } = useScroll({
    target: ref,
    offset: ["start 45%", "end 8%"],
  });
  const lastDown = React.useRef(-Infinity);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? latest;
    if (latest > previous) lastDown.current = performance.now();
  });

  useAnimationFrame((_, delta) => {
    if (!visible) return;
    const seconds = Math.min(delta, 64) / 1000;
    const scrollingDown = performance.now() - lastDown.current < 260;
    const target = scrollingDown ? MAX_BOOST * Math.pow(leaving.get(), 0.85) : 0;
    const current = boost.get();
    const rate = target > current ? 9 : 2.4;
    const next = current + (target - current) * (1 - Math.exp(-rate * seconds));
    boost.set(next < 0.001 ? 0 : next);
    offset.set(offset.get() + direction * speed * seconds * (1 + next));
  });

  return (
    <div ref={ref} className="hero-marquee-mask overflow-hidden">
      <motion.div style={{ x, skewX }} className="flex w-max will-change-transform">
        {Array.from({ length: COPIES }, (_, copy) => (
          <div key={copy} aria-hidden={copy > 0} className="flex shrink-0">
            {children}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

function IntegrationChips() {
  return (
    <>
      {INTEGRATIONS.map((item) => (
        <span
          key={item.label}
          className="mr-3 inline-flex shrink-0 items-center gap-2 rounded-full border bg-card/75 px-3.5 py-1.5 text-xs font-medium text-muted-foreground"
        >
          <item.icon className="size-3.5 text-primary" />
          {item.label}
        </span>
      ))}
    </>
  );
}

function KineticWords({ words }: { words: string[] }) {
  return (
    <>
      {words.map((word, i) => (
        <span key={word} className="flex shrink-0 items-center">
          <span
            className={cn(
              "px-5 font-display text-5xl font-extrabold tracking-[-0.035em] whitespace-nowrap [font-variation-settings:'opsz'_96] sm:text-6xl lg:text-7xl",
              i % 2 ? "hero-outline-text" : "text-foreground/90",
            )}
          >
            {word}
          </span>
          <span className="text-2xl text-primary sm:text-3xl">✦</span>
        </span>
      ))}
    </>
  );
}

export function HeroMarquee() {
  const t = useT();
  const tList = useTList();
  const words = tList("hero.kinetic");
  const { mode } = useHeroMotion();

  if (mode === "static") {
    return (
      <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-2 px-6">
        <IntegrationChips />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <span className="text-center text-[11px] font-medium tracking-[0.18em] text-muted-foreground/60 uppercase">
        {t("hero.worksWith")}
      </span>
      <MarqueeRow speed={2.2} direction={-1} lean={0.9}>
        <IntegrationChips />
      </MarqueeRow>
      <MarqueeRow speed={1.4} direction={1} lean={1.8}>
        <KineticWords words={words} />
      </MarqueeRow>
    </div>
  );
}
