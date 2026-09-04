"use client";

import { create } from "zustand";

export type Sprechlauf = {
  run: string;
  phase: "start" | "done" | "error";
  url?: string;
  provider?: string;
  text?: string;
  startedAt: number;
};

export type Sprechereignis = {
  type: "speech";
  phase: Sprechlauf["phase"];
  run: string;
  url?: string;
  provider?: string;
  text?: string;
};

type Pos = { x: number; y: number };

type Speicher = {
  laeufe: Sprechlauf[];
  aktiv: string | null;
  position: Pos | null;

  melde: (ereignis: Sprechereignis) => void;
  entferne: (run: string) => void;
  leere: () => void;
  waehle: (run: string) => void;
  setPosition: (position: Pos) => void;
};

export const useSprechlauf = create<Speicher>((set) => ({
  laeufe: [],
  aktiv: null,
  position: null,

  melde: (ereignis) =>
    set((zustand) => {
      const index = zustand.laeufe.findIndex((l) => l.run === ereignis.run);
      const vorher = index >= 0 ? zustand.laeufe[index] : null;
      const eintrag: Sprechlauf = {
        run: ereignis.run,
        phase: ereignis.phase,
        url: ereignis.url ?? vorher?.url,
        provider: ereignis.provider ?? vorher?.provider,
        text: ereignis.text ?? vorher?.text,
        startedAt: vorher?.startedAt ?? Date.now(),
      };
      const laeufe =
        index >= 0
          ? zustand.laeufe.map((l, i) => (i === index ? eintrag : l))
          : [...zustand.laeufe, eintrag];
      return { laeufe, aktiv: ereignis.run };
    }),

  entferne: (run) =>
    set((zustand) => {
      const laeufe = zustand.laeufe.filter((l) => l.run !== run);
      const aktiv =
        zustand.aktiv === run
          ? (laeufe.at(-1)?.run ?? null)
          : zustand.aktiv;
      return { laeufe, aktiv };
    }),

  leere: () => set({ laeufe: [], aktiv: null }),

  waehle: (run) => set({ aktiv: run }),

  setPosition: (position) => set({ position }),
}));
