"use client";

import { useQuery } from "@tanstack/react-query";

import type { TtsModelList } from "@/lib/chat/types";

/**
 * Die waehlbaren Sprach-Modelle fuers Vorlesen.
 *
 * Wie bei den Transkriptions-Modellen entscheidet das Backend, was wirklich
 * geht: mit ElevenLabs-Schluessel die ganze Gruppe, ohne nur die gratis
 * Stimme. Die Antwort aendert sich innerhalb einer Sitzung nicht.
 */
export function useTtsModels() {
  return useQuery({
    queryKey: ["tts", "models"],
    queryFn: async ({ signal }) => {
      const antwort = await fetch("/api/tts/models", {
        cache: "no-store",
        signal,
      });
      return (await antwort.json()) as TtsModelList;
    },
    // Nicht ewig zwischenspeichern wie die Transkriptions-Modelle: die
    // ElevenLabs-Gruppe haengt an einem Schluessel, der auch mitten in einer
    // Sitzung dazukommen kann (in die .env eingetragen, Backend neu
    // gestartet). Ein paar Minuten Frist, dann holt die Liste sich das neu --
    // sonst zeigte sie noch die schluessellose Auswahl von vorhin.
    staleTime: 3 * 60_000,
    retry: false,
  });
}
