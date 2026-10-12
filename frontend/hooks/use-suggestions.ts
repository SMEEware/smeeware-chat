"use client";

import { useQuery } from "@tanstack/react-query";

import { FALLBACK_SUGGESTIONS } from "@/lib/chat/suggestions";
import { useSettings } from "@/lib/settings/store";

export function useSuggestions(enabled: boolean) {
  const prompt = useSettings((state) => state.prompt);

  return useQuery({
    queryKey: ["chat", "suggestions", prompt],
    queryFn: async ({ signal }) => {
      const target = prompt
        ? `/api/suggestions?prompt=${encodeURIComponent(prompt)}`
        : "/api/suggestions";
      const response = await fetch(target, {
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
