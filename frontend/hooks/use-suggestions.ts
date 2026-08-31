"use client";

import { useQuery } from "@tanstack/react-query";

import { FALLBACK_SUGGESTIONS } from "@/lib/chat/suggestions";
import { useSettings } from "@/lib/settings/store";

/**
 * Holt die drei Startvorschlaege, die das Modell selbst waehlt. Waehrend
 * die Anfrage laeuft, liefert der Hook bewusst nichts -- die Startseite
 * zeigt solange eine Ladeanimation statt alter Standardtexte.
 *
 * Der gewaehlte System-Prompt faerbt die Vorschlaege: eine andere Persona
 * schlaegt andere Themen vor. Er steckt im Schluessel, damit ein Wechsel
 * frische Vorschlaege laedt statt der zwischengespeicherten alten.
 */
export function useSuggestions(enabled: boolean) {
  const prompt = useSettings((zustand) => zustand.prompt);

  return useQuery({
    queryKey: ["chat", "suggestions", prompt],
    queryFn: async ({ signal }) => {
      const ziel = prompt
        ? `/api/suggestions?prompt=${encodeURIComponent(prompt)}`
        : "/api/suggestions";
      const response = await fetch(ziel, {
        cache: "no-store",
        signal,
      });
      const data = (await response.json()) as { suggestions: string[] };
      return data.suggestions?.length
        ? data.suggestions
        : [...FALLBACK_SUGGESTIONS];
    },
    enabled,
    // Einmal pro Sitzung reicht -- kein erneutes Laden bei Fokuswechsel.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
