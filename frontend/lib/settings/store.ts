"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type SettingsState = {
  thinking: boolean;
  tools: boolean;
  prompt: string | null;
  notifications: boolean;
  transcribeModel: string | null;
  ttsModel: string | null;
  voiceId: string;
  tourSeen: boolean;
  callVoice: string | null;
  callBargeIn: boolean;

  setThinking: (value: boolean) => void;
  setTools: (value: boolean) => void;
  setPrompt: (value: string | null) => void;
  setNotifications: (value: boolean) => void;
  setTranscribeModel: (value: string | null) => void;
  setTtsModel: (value: string | null) => void;
  setVoiceId: (value: string) => void;
  setTourSeen: (value: boolean) => void;
  setCallVoice: (value: string | null) => void;
  setCallBargeIn: (value: boolean) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      thinking: true,
      tools: true,
      prompt: null,
      notifications: true,
      transcribeModel: null,
      ttsModel: null,
      voiceId: "",
      tourSeen: true,
      callVoice: null,
      callBargeIn: true,

      setThinking: (thinking) => set({ thinking }),
      setTools: (tools) => set({ tools }),
      setPrompt: (prompt) => set({ prompt }),
      setNotifications: (notifications) => set({ notifications }),
      setTranscribeModel: (transcribeModel) => set({ transcribeModel }),
      setTtsModel: (ttsModel) => set({ ttsModel }),
      setVoiceId: (voiceId) => set({ voiceId }),
      setTourSeen: (tourSeen) => set({ tourSeen }),
      setCallVoice: (callVoice) => set({ callVoice }),
      setCallBargeIn: (callBargeIn) => set({ callBargeIn }),
    }),
    { name: "smeeware:settings" },
  ),
);

export function promptLabel(name: string): string {
  return name
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
