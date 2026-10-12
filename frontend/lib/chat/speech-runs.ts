"use client";

import { create } from "zustand";

export type SpeechRun = {
  run: string;
  phase: "start" | "done" | "error";
  url?: string;
  provider?: string;
  text?: string;
  startedAt: number;
};

export type SpeechEvent = {
  type: "speech";
  phase: SpeechRun["phase"];
  run: string;
  url?: string;
  provider?: string;
  text?: string;
};

type Pos = { x: number; y: number };

type RunStore = {
  runs: SpeechRun[];
  active: string | null;
  position: Pos | null;

  report: (event: SpeechEvent) => void;
  remove: (run: string) => void;
  empty: () => void;
  select: (run: string) => void;
  setPosition: (position: Pos) => void;
};

export const useSpeechRun = create<RunStore>((set) => ({
  runs: [],
  active: null,
  position: null,

  report: (event) =>
    set((state) => {
      const index = state.runs.findIndex((l) => l.run === event.run);
      const previous = index >= 0 ? state.runs[index] : null;
      const entry: SpeechRun = {
        run: event.run,
        phase: event.phase,
        url: event.url ?? previous?.url,
        provider: event.provider ?? previous?.provider,
        text: event.text ?? previous?.text,
        startedAt: previous?.startedAt ?? Date.now(),
      };
      const runs =
        index >= 0
          ? state.runs.map((l, i) => (i === index ? entry : l))
          : [...state.runs, entry];
      return { runs, active: event.run };
    }),

  remove: (run) =>
    set((state) => {
      const runs = state.runs.filter((l) => l.run !== run);
      const active =
        state.active === run
          ? (runs.at(-1)?.run ?? null)
          : state.active;
      return { runs, active };
    }),

  empty: () => set({ runs: [], active: null }),

  select: (run) => set({ active: run }),

  setPosition: (position) => set({ position }),
}));
