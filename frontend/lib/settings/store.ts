"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type Einstellungen = {
  thinking: boolean;
  tools: boolean;
  prompt: string | null;
  notifications: boolean;
  transcribeModel: string | null;
  ttsModel: string | null;
  voiceId: string;
  tourGesehen: boolean;
  /** Die Stimme des Telefonats. null = die Vorgabe des Backends. */
  callVoice: string | null;
  /**
   * Im Telefonat per Reden unterbrechen. Pro Geraet: ohne Echo-Unterdrueckung
   * hoert sich die Stimme sonst selbst -- dann schaltet das Telefonat das
   * hier von allein ab (Unterbrechen per Tipp bleibt).
   */
  callBargeIn: boolean;

  setThinking: (wert: boolean) => void;
  setTools: (wert: boolean) => void;
  setPrompt: (wert: string | null) => void;
  setNotifications: (wert: boolean) => void;
  setTranscribeModel: (wert: string | null) => void;
  setTtsModel: (wert: string | null) => void;
  setVoiceId: (wert: string) => void;
  setTourGesehen: (wert: boolean) => void;
  setCallVoice: (wert: string | null) => void;
  setCallBargeIn: (wert: boolean) => void;
};

export const useSettings = create<Einstellungen>()(
  persist(
    (set) => ({
      thinking: true,
      tools: true,
      prompt: null,
      notifications: true,
      transcribeModel: null,
      ttsModel: null,
      voiceId: "",
      tourGesehen: true,
      callVoice: null,
      callBargeIn: true,

      setThinking: (thinking) => set({ thinking }),
      setTools: (tools) => set({ tools }),
      setPrompt: (prompt) => set({ prompt }),
      setNotifications: (notifications) => set({ notifications }),
      setTranscribeModel: (transcribeModel) => set({ transcribeModel }),
      setTtsModel: (ttsModel) => set({ ttsModel }),
      setVoiceId: (voiceId) => set({ voiceId }),
      setTourGesehen: (tourGesehen) => set({ tourGesehen }),
      setCallVoice: (callVoice) => set({ callVoice }),
      setCallBargeIn: (callBargeIn) => set({ callBargeIn }),
    }),
    { name: "smeeware:settings" },
  ),
);

export function promptLabel(name: string): string {
  return name
    .split(/[-_]/)
    .map((teil) => teil.charAt(0).toUpperCase() + teil.slice(1))
    .join(" ");
}
