"use client";

import { create } from "zustand";

/**
 * Der Zustand einer laufenden Bilderzeugung.
 *
 * Warum ein eigener Speicher und nicht der Verlauf: die Zwischenstaende
 * kommen ueber den Ereignis-Strom herein, nicht ueber den Chat-Stream. Sie
 * gehoeren keiner Nachricht -- sie gehoeren einem laufenden Werkzeug. Sie
 * in den Verlauf zu schreiben hiesse, ihn dreimal je Bild zu speichern.
 *
 * Deshalb liegen sie hier daneben, kurzlebig, und werden von der
 * Werkzeugzeile abgeholt, solange sie laeuft. Ist das Bild fertig, steht
 * es ohnehin in der Antwort des Modells -- dann braucht es diesen Speicher
 * nicht mehr.
 */
export type Bildlauf = {
  run: string;
  phase: "start" | "partial" | "done" | "error";
  /** Adresse des zuletzt gemeldeten Standes. Bei "start" noch keine. */
  url?: string;
  alt?: string;
  prompt?: string;
  /** Der wievielte Zwischenstand -- fuer die Fortschrittsanzeige. */
  index?: number;
  /** Wie viele Vorlagen der Lauf benutzt. 0 = frei erfunden. */
  references?: number;
  startedAt: number;
};

/** Was das Backend ueber den Bus schickt. */
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
  /** Nach run-id. Ein Turn kann mehrere Bilder erzeugen. */
  laeufe: Record<string, Bildlauf>;
  /** Die zuletzt begonnene -- die Werkzeugzeile fragt danach. */
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
        // Bei "start" kommt noch keine Adresse mit. Die alte zu behalten
        // waere hier falsch, bei "done" dagegen richtig: die Meldung
        // traegt dann die endgueltige.
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

/**
 * Der Lauf, den eine laufende ``generate_image``-Zeile zeigen soll.
 *
 * Die Werkzeugzeile kennt ihre ``call_id``, das Ereignis seine ``run``-id --
 * und die beiden wissen nichts voneinander: der Bus laeuft am Chat-Stream
 * vorbei. Verbunden werden sie ueber die Zeit, und das genuegt hier: es
 * laeuft immer nur ein Bild gleichzeitig, weil das Modell erst das
 * Ergebnis abwartet, bevor es das naechste anfordert.
 */
export function useAktuellerBildlauf(aktiv: boolean): Bildlauf | null {
  return useBildlaeufe((zustand) => {
    if (!aktiv) return null;
    const neueste = zustand.neueste;
    return neueste ? (zustand.laeufe[neueste] ?? null) : null;
  });
}
