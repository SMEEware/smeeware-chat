"use client";

import { useQuery } from "@tanstack/react-query";

import { FALLBACK_MODELS } from "@/lib/chat/models";
import type { ModelList } from "@/lib/chat/types";

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
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
