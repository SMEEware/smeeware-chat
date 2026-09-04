"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type PromptSummary = {
  name: string;
  title: string;
  length: number;
};

type PromptListe = {
  count: number;
  default: string;
  prompts: PromptSummary[];
};

export function usePrompts() {
  return useQuery<PromptListe>({
    queryKey: ["prompts"],
    queryFn: async ({ signal }) => {
      const antwort = await fetch("/api/prompts", { signal, cache: "no-store" });
      if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
      return (await antwort.json()) as PromptListe;
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function usePromptText(name: string | null) {
  return useQuery<{ text: string }>({
    queryKey: ["prompts", "text", name],
    queryFn: async ({ signal }) => {
      const antwort = await fetch(`/api/prompts/${encodeURIComponent(name!)}`, {
        signal,
        cache: "no-store",
      });
      if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
      return (await antwort.json()) as { text: string };
    },
    enabled: Boolean(name),
    staleTime: 0,
    retry: false,
  });
}

async function pruefen(antwort: Response): Promise<void> {
  if (antwort.ok) return;
  let meldung = `HTTP ${antwort.status}`;
  try {
    const nutzlast = await antwort.json();
    meldung = nutzlast?.error?.message ?? meldung;
  } catch {
  }
  throw new Error(meldung);
}

export function usePromptActions() {
  const client = useQueryClient();
  const neu = () => client.invalidateQueries({ queryKey: ["prompts"] });

  const speichern = useMutation<void, Error, { name: string; text: string }>({
    mutationFn: async (eingabe) => {
      const antwort = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eingabe),
      });
      await pruefen(antwort);
    },
    onSuccess: neu,
  });

  const loeschen = useMutation<void, Error, string>({
    mutationFn: async (name) => {
      const antwort = await fetch(
        `/api/prompts/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      await pruefen(antwort);
    },
    onSuccess: neu,
  });

  return { speichern, loeschen };
}
