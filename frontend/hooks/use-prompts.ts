"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type PromptSummary = {
  name: string;
  title: string;
  length: number;
};

type PromptList = {
  count: number;
  default: string;
  prompts: PromptSummary[];
};

export function usePrompts() {
  return useQuery<PromptList>({
    queryKey: ["prompts"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/prompts", { signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as PromptList;
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function usePromptText(name: string | null) {
  return useQuery<{ text: string }>({
    queryKey: ["prompts", "text", name],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/prompts/${encodeURIComponent(name!)}`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as { text: string };
    },
    enabled: Boolean(name),
    staleTime: 0,
    retry: false,
  });
}

async function verify(response: Response): Promise<void> {
  if (response.ok) return;
  let statusMessage = `HTTP ${response.status}`;
  try {
    const payload = await response.json();
    statusMessage = payload?.error?.message ?? statusMessage;
  } catch {
  }
  throw new Error(statusMessage);
}

export function usePromptActions() {
  const client = useQueryClient();
  const next = () => client.invalidateQueries({ queryKey: ["prompts"] });

  const save = useMutation<void, Error, { name: string; text: string }>({
    mutationFn: async (input) => {
      const response = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      await verify(response);
    },
    onSuccess: next,
  });

  const pendingDelete = useMutation<void, Error, string>({
    mutationFn: async (name) => {
      const response = await fetch(
        `/api/prompts/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      await verify(response);
    },
    onSuccess: next,
  });

  return { save, pendingDelete };
}
