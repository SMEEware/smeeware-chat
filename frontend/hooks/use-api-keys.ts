"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
};

export type ApiKeyCreated = ApiKey & { secret: string };

type Liste = { count: number; keys: ApiKey[] };

export const apiKeysKey = ["api-keys"] as const;

async function fehlerAus(antwort: Response): Promise<string> {
  let meldung = `HTTP ${antwort.status}`;
  try {
    const nutzlast = await antwort.json();
    meldung = nutzlast?.error?.message ?? meldung;
  } catch {
  }
  return meldung;
}

export function useApiKeys() {
  return useQuery<Liste>({
    queryKey: apiKeysKey,
    queryFn: async ({ signal }) => {
      const antwort = await fetch("/api/keys", { signal, cache: "no-store" });
      if (!antwort.ok) throw new Error(await fehlerAus(antwort));
      return (await antwort.json()) as Liste;
    },
    staleTime: 30_000,
    retry: false,
  });
}

export function useApiKeyActions() {
  const client = useQueryClient();
  const neu = () => client.invalidateQueries({ queryKey: apiKeysKey });

  const anlegen = useMutation<ApiKeyCreated, Error, string>({
    mutationFn: async (name) => {
      const antwort = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!antwort.ok) throw new Error(await fehlerAus(antwort));
      return (await antwort.json()) as ApiKeyCreated;
    },
    onSuccess: neu,
  });

  const umbenennen = useMutation<void, Error, { id: string; name: string }>({
    mutationFn: async ({ id, name }) => {
      const antwort = await fetch(`/api/keys/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!antwort.ok) throw new Error(await fehlerAus(antwort));
    },
    onSuccess: neu,
  });

  const loeschen = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const antwort = await fetch(`/api/keys/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!antwort.ok) throw new Error(await fehlerAus(antwort));
    },
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: apiKeysKey });
      const vorher = client.getQueryData<Liste>(apiKeysKey);
      client.setQueryData<Liste>(apiKeysKey, (liste) =>
        liste
          ? {
              count: liste.count - 1,
              keys: liste.keys.filter((k) => k.id !== id),
            }
          : liste,
      );
      return { vorher };
    },
    onError: (_fehler, _id, context) => {
      const vorher = (context as { vorher?: Liste } | undefined)?.vorher;
      if (vorher) client.setQueryData(apiKeysKey, vorher);
    },
    onSettled: neu,
  });

  return { anlegen, umbenennen, loeschen };
}
