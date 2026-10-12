"use client";

import { create } from "zustand";

export type ImageRun = {
  run: string;
  phase: "start" | "partial" | "done" | "error";
  url?: string;
  alt?: string;
  prompt?: string;
  index?: number;
  references?: number;
  startedAt: number;
};

export type ImageEvent = {
  type: "image";
  phase: ImageRun["phase"];
  run: string;
  url?: string;
  alt?: string;
  prompt?: string;
  index?: number;
  references?: number;
};

type RunStore = {
  runs: Record<string, ImageRun>;
  latest: string | null;
  report: (event: ImageEvent) => void;
  forget: (run: string) => void;
};

export const useImageRuns = create<RunStore>((set) => ({
  runs: {},
  latest: null,

  report: (event) =>
    set((state) => {
      const previous = state.runs[event.run];
      const run: ImageRun = {
        run: event.run,
        phase: event.phase,
        url: event.url ?? previous?.url,
        alt: event.alt ?? previous?.alt,
        prompt: event.prompt ?? previous?.prompt,
        index: event.index ?? previous?.index,
        references: event.references ?? previous?.references,
        startedAt: previous?.startedAt ?? Date.now(),
      };
      return {
        runs: { ...state.runs, [event.run]: run },
        latest: event.phase === "start" ? event.run : state.latest,
      };
    }),

  forget: (run) =>
    set((state) => {
      const rest = Object.fromEntries(
        Object.entries(state.runs).filter(([id]) => id !== run),
      );
      return {
        runs: rest,
        latest: state.latest === run ? null : state.latest,
      };
    }),
}));

export function useCurrentImageRun(active: boolean): ImageRun | null {
  return useImageRuns((state) => {
    if (!active) return null;
    const latest = state.latest;
    return latest ? (state.runs[latest] ?? null) : null;
  });
}
