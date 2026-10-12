"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type Account = {
  configured: boolean;
  username: string | null;
  has_avatar: boolean;
  authenticated: boolean;
};

export const accountKey = ["account"] as const;

export function useAccount() {
  return useQuery<Account>({
    queryKey: accountKey,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/auth", { signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as Account;
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useSetAvatar() {
  const client = useQueryClient();

  return useMutation<void, Error, File>({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append("file", file, file.name);

      const response = await fetch("/api/account/avatar", {
        method: "PUT",
        body: form,
      });

      if (!response.ok) {
        let statusMessage = `HTTP ${response.status}`;
        try {
          const payload = await response.json();
          statusMessage = payload?.error?.message ?? statusMessage;
        } catch {
        }
        throw new Error(statusMessage);
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: accountKey }),
  });
}

export function useClearAvatar() {
  const client = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const response = await fetch("/api/account/avatar", { method: "DELETE" });
      if (response.ok) return;

      let statusMessage = `HTTP ${response.status}`;
      try {
        const payload = await response.json();
        statusMessage = payload?.error?.message ?? statusMessage;
      } catch {
        statusMessage = `HTTP ${response.status}`;
      }
      throw new Error(statusMessage);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: accountKey }),
  });
}

export function useDeleteAccount() {
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (response.ok) return;

      let statusMessage = `HTTP ${response.status}`;
      try {
        const payload = await response.json();
        statusMessage = payload?.error?.message ?? statusMessage;
      } catch {
      }
      throw new Error(statusMessage);
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
    mutationFn: async (input) => {
      const response = await fetch("/api/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (response.ok) return;

      let statusMessage = `HTTP ${response.status}`;
      try {
        const payload = await response.json();
        statusMessage = payload?.error?.message ?? statusMessage;
      } catch {
      }
      throw new Error(statusMessage);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: accountKey }),
  });
}
