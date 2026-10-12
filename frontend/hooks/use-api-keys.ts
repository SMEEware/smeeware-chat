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

type KeyList = { count: number; keys: ApiKey[] };

export const apiKeysKey = ["api-keys"] as const;

async function errorOf(response: Response): Promise<string> {
  let statusMessage = `HTTP ${response.status}`;
  try {
    const payload = await response.json();
    statusMessage = payload?.error?.message ?? statusMessage;
  } catch {
  }
  return statusMessage;
}

export function useApiKeys() {
  return useQuery<KeyList>({
    queryKey: apiKeysKey,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/keys", { signal, cache: "no-store" });
      if (!response.ok) throw new Error(await errorOf(response));
      return (await response.json()) as KeyList;
    },
    staleTime: 30_000,
    retry: false,
  });
}

export function useApiKeyActions() {
  const client = useQueryClient();
  const next = () => client.invalidateQueries({ queryKey: apiKeysKey });

  const create = useMutation<ApiKeyCreated, Error, string>({
    mutationFn: async (name) => {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error(await errorOf(response));
      return (await response.json()) as ApiKeyCreated;
    },
    onSuccess: next,
  });

  const rename = useMutation<void, Error, { id: string; name: string }>({
    mutationFn: async ({ id, name }) => {
      const response = await fetch(`/api/keys/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error(await errorOf(response));
    },
    onSuccess: next,
  });

  const pendingDelete = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const response = await fetch(`/api/keys/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await errorOf(response));
    },
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: apiKeysKey });
      const previous = client.getQueryData<KeyList>(apiKeysKey);
      client.setQueryData<KeyList>(apiKeysKey, (list) =>
        list
          ? {
              count: list.count - 1,
              keys: list.keys.filter((k) => k.id !== id),
            }
          : list,
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      const previous = (context as { previous?: KeyList } | undefined)?.previous;
      if (previous) client.setQueryData(apiKeysKey, previous);
    },
    onSettled: next,
  });

  return { create, rename, pendingDelete };
}
