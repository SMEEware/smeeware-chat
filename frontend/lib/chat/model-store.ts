"use client";

import { create } from "zustand";

/**
 * Das gewaehlte Antwort-Modell -- geteilt zwischen Composer und Palette.
 *
 * Frueher lag die Wahl als lokaler Zustand im Chat-Panel; die Palette kam
 * so nicht heran. Jetzt liegt sie hier, damit beide Seiten dasselbe Modell
 * setzen und lesen. ``null`` heisst: nimm das Default des Backends.
 *
 * Bewusst NICHT gespeichert: eine gemerkte id koennte nach einem Wechsel
 * im Backend ins Leere zeigen. Sie ueberlebt den Wechsel zwischen Chats
 * (Modul-Zustand), faellt beim Neuladen aber auf das Default zurueck.
 */
type ModelOverride = {
  model: string | null;
  setModel: (id: string | null) => void;
};

export const useModelOverride = create<ModelOverride>((set) => ({
  model: null,
  setModel: (model) => set({ model }),
}));
