"use client";

import { create } from "zustand";

export type Bildlauf = {
  run: string;
  phase: "start" | "partial" | "done" | "error";
  url?: string;
  alt?: string;
  prompt?: string;
  index?: number;
  references?: number;
  startedAt: number;
};

export type Bildereignis = {
  type: "image";
  phase: Bildlauf["phase"];
  run: string;
  url?: string;
  alt?: string;
  prompt?: string;
  index?: number;
  references?: number;
};

type Speicher = {
  laeufe: Record<string, Bildlauf>;
  neueste: string | null;
  melde: (ereignis: Bildereignis) => void;
  vergiss: (run: string) => void;
};

export const useBildlaeufe = create<Speicher>((set) => ({
  laeufe: {},
  neueste: null,

  melde: (ereignis) =>
    set((zustand) => {
      const vorher = zustand.laeufe[ereignis.run];
      const lauf: Bildlauf = {
        run: ereignis.run,
        phase: ereignis.phase,
        url: ereignis.url ?? vorher?.url,
        alt: ereignis.alt ?? vorher?.alt,
        prompt: ereignis.prompt ?? vorher?.prompt,
        index: ereignis.index ?? vorher?.index,
        references: ereignis.references ?? vorher?.references,
        startedAt: vorher?.startedAt ?? Date.now(),
      };
      return {
        laeufe: { ...zustand.laeufe, [ereignis.run]: lauf },
        neueste: ereignis.phase === "start" ? ereignis.run : zustand.neueste,
      };
    }),

  vergiss: (run) =>
    set((zustand) => {
      const rest = Object.fromEntries(
        Object.entries(zustand.laeufe).filter(([id]) => id !== run),
      );
      return {
        laeufe: rest,
        neueste: zustand.neueste === run ? null : zustand.neueste,
      };
    }),
}));

export function useAktuellerBildlauf(aktiv: boolean): Bildlauf | null {
  return useBildlaeufe((zustand) => {
    if (!aktiv) return null;
    const neueste = zustand.neueste;
    return neueste ? (zustand.laeufe[neueste] ?? null) : null;
  });
}
