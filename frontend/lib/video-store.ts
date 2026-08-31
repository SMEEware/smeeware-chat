"use client";

import { create } from "zustand";

import type { VideoQuelle } from "@/lib/video-source";

/**
 * Das eine schwebende Video.
 *
 * Bewusst genau eines: zwei Fenster, die sich im Chat ueberlagern, waeren
 * keine Bequemlichkeit mehr, sondern Unordnung. Wer ein zweites verkleinert,
 * ersetzt das erste.
 *
 * Ausserhalb des Komponentenbaums, weil das Fenster den Wechsel von einem
 * Chat zum naechsten ueberleben soll -- es haengt am Layout, der ausloesende
 * Player an einer Nachricht.
 */
type Zustand = {
  video: VideoQuelle | null;
  /** Wo das Fenster steht. null = noch nicht verschoben, also unten rechts. */
  position: { x: number; y: number } | null;

  verkleinern: (video: VideoQuelle) => void;
  schliessen: () => void;
  setPosition: (position: { x: number; y: number }) => void;
};

export const useVideoFenster = create<Zustand>((set) => ({
  video: null,
  position: null,

  // Position zuruecksetzen: ein neues Video faengt unten rechts an, statt
  // dort aufzutauchen, wo zufaellig das letzte stand.
  verkleinern: (video) => set({ video, position: null }),
  schliessen: () => set({ video: null }),
  setPosition: (position) => set({ position }),
}));
