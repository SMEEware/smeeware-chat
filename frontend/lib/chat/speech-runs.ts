"use client";

import { create } from "zustand";

/**
 * Alle vorgelesenen Audios -- jedes ein Tab in der Sprechanzeige.
 *
 * Frueher hielt der Speicher genau ein Vorlesen; ein neues loeste das alte
 * ab und liess es verschwinden. Jetzt bleibt jedes liegen: der Nutzer soll
 * zwischen ihnen wechseln, sie einzeln schliessen oder pausieren koennen.
 *
 * Wie bei den Bildlaeufen kommt das ueber den Ereignis-Strom herein, nicht
 * ueber den Chat-Stream: die Audiodatei ist das Nebenprodukt eines
 * Werkzeugs, keine Nachricht. Sie gehoert deshalb hierher, neben den
 * Verlauf -- von der Anzeige abgeholt, nicht gespeichert.
 */
export type Sprechlauf = {
  run: string;
  phase: "start" | "done" | "error";
  /** Adresse der fertigen Audiodatei. Erst bei "done" gesetzt. */
  url?: string;
  /** "elevenlabs" | "free" -- wer gesprochen hat. */
  provider?: string;
  /** Der gesprochene Text -- vollstaendig, zum Aufklappen und Mitlesen. */
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
  /** Alle offenen Tabs, aeltester zuerst. */
  laeufe: Sprechlauf[];
  /** Welcher Tab gerade offen ist. */
  aktiv: string | null;
  /** Wohin der Nutzer das Fenster gezogen hat -- null = Vorgabeplatz. */
  position: Pos | null;

  melde: (ereignis: Sprechereignis) => void;
  /** Einen Tab schliessen. */
  entferne: (run: string) => void;
  /** Das ganze Fenster schliessen. */
  leere: () => void;
  /** Zu einem Tab wechseln. */
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
      // Ein neues oder aktualisiertes Vorlesen holt den Fokus -- so spielt
      // die frische Audio, waehrend die alten Tabs stehen bleiben.
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
