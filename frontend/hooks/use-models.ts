"use client";

import { useQuery } from "@tanstack/react-query";

import { FALLBACK_MODELS } from "@/lib/chat/models";
import type { ModelList } from "@/lib/chat/types";

/**
 * Holt die waehlbaren Modelle von /api/models. Die Ausweichliste liegt als
 * placeholderData bereit, damit die Auswahl sofort bedienbar ist und
 * lautlos ersetzt wird, sobald die echte Liste eintrifft.
 */
export function useModels() {
  return useQuery({
    queryKey: ["chat", "models"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/models", {
        cache: "no-store",
        signal,
      });
      return (await response.json()) as ModelList;
    },
    placeholderData: FALLBACK_MODELS,
    // Aendert sich selten -- einmal pro Sitzung reicht.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
