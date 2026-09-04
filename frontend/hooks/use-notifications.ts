"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type Hinweis = {
  id: string;
  level: "info" | "success" | "warning" | "error";
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
};

type Liste = { count: number; unread: number; notifications: Hinweis[] };

export const hinweisKey = ["notifications"] as const;

export function useNotifications() {
  return useQuery<Liste>({
    queryKey: hinweisKey,
    queryFn: async ({ signal }) => {
      const antwort = await fetch("/api/notifications", {
        signal,
        cache: "no-store",
      });
      if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
      return (await antwort.json()) as Liste;
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useNotificationActions() {
  const client = useQueryClient();
  const neu = () => client.invalidateQueries({ queryKey: hinweisKey });

  const gelesen = useMutation({
    mutationFn: () => fetch("/api/notifications", { method: "POST" }),
    onSuccess: neu,
  });

  const loeschen = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/notifications/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: hinweisKey });
      const vorher = client.getQueryData<Liste>(hinweisKey);
      client.setQueryData<Liste>(hinweisKey, (liste) =>
        liste
          ? {
              ...liste,
              count: liste.count - 1,
              notifications: liste.notifications.filter((h) => h.id !== id),
            }
          : liste,
      );
      return { vorher };
    },
    onError: (_fehler, _id, context) => {
      if (context?.vorher) client.setQueryData(hinweisKey, context.vorher);
    },
    onSettled: neu,
  });

  const alleLoeschen = useMutation({
    mutationFn: () => fetch("/api/notifications", { method: "DELETE" }),
    onSuccess: neu,
  });

  return { gelesen, loeschen, alleLoeschen };
}
