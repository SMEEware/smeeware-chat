"use client";

import * as React from "react";
import { useReducedMotion, type MotionValue } from "motion/react";

export type HeroMode = "full" | "lite" | "static";

export type HeroMotion = {
  mode: HeroMode;
  scroll: MotionValue<number>;
};

export const HeroMotionContext = React.createContext<HeroMotion | null>(null);

export function useHeroMotion(): HeroMotion {
  const value = React.useContext(HeroMotionContext);
  if (!value) throw new Error("useHeroMotion must be used inside <Hero>");
  return value;
}

const DESKTOP = "(min-width: 1024px) and (pointer: fine)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useHeroMode(): HeroMode {
  const reduced = useReducedMotion();
  const desktop = React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
  if (reduced) return "static";
  return desktop ? "full" : "lite";
}
