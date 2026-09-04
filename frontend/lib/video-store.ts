"use client";

import { create } from "zustand";

import type { VideoQuelle } from "@/lib/video-source";

type Zustand = {
  video: VideoQuelle | null;
  position: { x: number; y: number } | null;

  verkleinern: (video: VideoQuelle) => void;
  schliessen: () => void;
  setPosition: (position: { x: number; y: number }) => void;
};

export const useVideoFenster = create<Zustand>((set) => ({
  video: null,
  position: null,

  verkleinern: (video) => set({ video, position: null }),
  schliessen: () => set({ video: null }),
  setPosition: (position) => set({ position }),
}));
