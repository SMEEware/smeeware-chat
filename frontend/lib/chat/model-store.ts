"use client";

import { create } from "zustand";

type ModelOverride = {
  model: string | null;
  setModel: (id: string | null) => void;
};

export const useModelOverride = create<ModelOverride>((set) => ({
  model: null,
  setModel: (model) => set({ model }),
}));
