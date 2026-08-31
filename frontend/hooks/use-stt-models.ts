"use client";

import { useQuery } from "@tanstack/react-query";

import type { SttModelList } from "@/lib/chat/types";

/**
 * Die waehlbaren Transkriptions-Modelle.
 *
 * Wie bei den Chat-Modellen: was wirklich geht, entscheidet das Backend
 * (Schluessel da? whisper.cpp installiert?), und die Antwort aendert sich
 * innerhalb einer Sitzung nicht.
 */
export function useSttModels() {
  return useQuery({
    queryKey: ["transcribe", "models"],
    queryFn: async ({ signal }) => {
      const antwort = await fetch("/api/transcribe/models", {
        cache: "no-store",
        signal,
      });
      return (await antwort.json()) as SttModelList;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
