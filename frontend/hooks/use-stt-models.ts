"use client";

import { useQuery } from "@tanstack/react-query";

import type { SttModelList } from "@/lib/chat/types";

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
