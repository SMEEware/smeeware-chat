"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type Konto = {
  configured: boolean;
  username: string | null;
  has_avatar: boolean;
  authenticated: boolean;
};

export const accountKey = ["account"] as const;

export function useAccount() {
  return useQuery<Konto>({
    queryKey: accountKey,
    queryFn: async ({ signal }) => {
      const antwort = await fetch("/api/auth", { signal, cache: "no-store" });
      if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
      return (await antwort.json()) as Konto;
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useSetAvatar() {
  const client = useQueryClient();

  return useMutation<void, Error, File>({
    mutationFn: async (datei) => {
      const form = new FormData();
      form.append("file", datei, datei.name);

      const antwort = await fetch("/api/account/avatar", {
        method: "PUT",
        body: form,
      });

      if (!antwort.ok) {
        let meldung = `HTTP ${antwort.status}`;
        try {
          const nutzlast = await antwort.json();
          meldung = nutzlast?.error?.message ?? meldung;
        } catch {
        }
        throw new Error(meldung);
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: accountKey }),
  });
}

export function useDeleteAccount() {
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const antwort = await fetch("/api/account", { method: "DELETE" });
      if (antwort.ok) return;

      let meldung = `HTTP ${antwort.status}`;
      try {
        const nutzlast = await antwort.json();
        meldung = nutzlast?.error?.message ?? meldung;
      } catch {
      }
      throw new Error(meldung);
    },
  });
}

export function useUpdateAccount() {
  const client = useQueryClient();

  return useMutation<
    void,
    Error,
    { username?: string; current_password?: string; new_password?: string }
  >({
    mutationFn: async (eingabe) => {
      const antwort = await fetch("/api/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eingabe),
      });
      if (antwort.ok) return;

      let meldung = `HTTP ${antwort.status}`;
      try {
        const nutzlast = await antwort.json();
        meldung = nutzlast?.error?.message ?? meldung;
      } catch {
      }
      throw new Error(meldung);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: accountKey }),
  });
}
