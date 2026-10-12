"use client";

import { useQuery } from "@tanstack/react-query";

import type { TtsModelList } from "@/lib/chat/types";

export function useTtsModels() {
  return useQuery({
    queryKey: ["tts", "models"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/tts/models", {
        cache: "no-store",
        signal,
      });
      return (await response.json()) as TtsModelList;
    },
    staleTime: 3 * 60_000,
    retry: false,
  });
}
