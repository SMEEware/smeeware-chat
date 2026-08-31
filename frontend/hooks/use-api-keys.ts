"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** Ein Schluessel, wie ihn die Liste zeigt -- nie das Geheimnis selbst. */
export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
};

/** Die Antwort beim Anlegen -- als Einzige traegt sie den Klartext. */
export type ApiKeyCreated = ApiKey & { secret: string };

type Liste = { count: number; keys: ApiKey[] };

export const apiKeysKey = ["api-keys"] as const;

/** Die Fehlermeldung des Backends ziehen -- sonst bleibt nur der Status. */
async function fehlerAus(antwort: Response): Promise<string> {
  let meldung = `HTTP ${antwort.status}`;
  try {
    const nutzlast = await antwort.json();
    meldung = nutzlast?.error?.message ?? meldung;
  } catch {
    // Kein JSON -- der Status muss reichen.
  }
  return meldung;
}

/** Die Schluessel des Kontos. Erfordert eine Anmeldung -- sonst 401. */
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

  /**
   * Anlegen. Gibt den Klartext zurueck -- der Aufrufer zeigt ihn genau
   * einmal und kann ihn danach nicht mehr erfragen.
   */
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
    // Sofort aus der Liste nehmen -- das Ergebnis ist absehbar, und ein
    // Zucken nach dem Klick waere schlechter als ein seltener Rueckfall.
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
