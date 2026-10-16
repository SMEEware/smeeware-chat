"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type ModelOverride = {
  model: string | null;
  setModel: (id: string | null) => void;
  reasoningEfforts: Record<string, string>;
  setReasoningEffort: (modelId: string, effort: string) => void;
};

function storedPreferences(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(
    ([id, effort]) => id.length > 0 && typeof effort === "string" && effort.trim().length > 0,
  ));
}

export const useModelOverride = create<ModelOverride>()(
  persist(
    (set) => ({
      model: null,
      setModel: (model) => set({ model }),
      reasoningEfforts: {},
      setReasoningEffort: (modelId, effort) => {
        if (!modelId || !effort.trim()) return;
        set((state) => ({
          reasoningEfforts: { ...state.reasoningEfforts, [modelId]: effort },
        }));
      },
    }),
    {
      name: "smeeware:reasoning",
      partialize: (state) => ({ reasoningEfforts: state.reasoningEfforts }),
      merge: (persisted, current) => ({
        ...current,
        reasoningEfforts: storedPreferences(
          (persisted as { reasoningEfforts?: unknown } | undefined)?.reasoningEfforts,
        ),
      }),
    },
  ),
);
