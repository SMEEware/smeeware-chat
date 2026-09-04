"use client";

import { useQuery } from "@tanstack/react-query";

import { FALLBACK_SUGGESTIONS } from "@/lib/chat/suggestions";
import { useSettings } from "@/lib/settings/store";

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
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
