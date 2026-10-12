"use client";

import { create } from "zustand";

import type { VideoSource } from "@/lib/video-source";

type State = {
  video: VideoSource | null;
  position: { x: number; y: number } | null;

  minimize: (video: VideoSource) => void;
  close: () => void;
  setPosition: (position: { x: number; y: number }) => void;
};

export const useVideoWindow = create<State>((set) => ({
  video: null,
  position: null,

  minimize: (video) => set({ video, position: null }),
  close: () => set({ video: null }),
  setPosition: (position) => set({ position }),
}));
