"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type PluginCategory =
  | "search"
  | "web"
  | "media"
  | "files"
  | "skills"
  | "system"
  | "security";

export type Plugin = {
  slug: string;
  title: string;
  category: PluginCategory;
  category_label: string;
  summary: string;
  description: string;
  icon: string;
  tools: string[];
  available_tools: string[];
  requires: string[];
  missing_requirements: string[];
  available: boolean;
  installed: boolean;
};

export type PluginList = {
  count: number;
  installed_count: number;
  plugins: Plugin[];
};

export const pluginKey = ["plugins"] as const;

export function usePlugins(enabled = true) {
  return useQuery<PluginList>({
    queryKey: pluginKey,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/plugins", { signal, cache: "no-store" });
      if (!response.ok) throw new Error(await errorText(response));
      return (await response.json()) as PluginList;
    },
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function useSetPluginInstalled() {
  const client = useQueryClient();

  return useMutation<void, Error, { slug: string; installed: boolean }>({
    mutationFn: async ({ slug, installed }) => {
      const response = await fetch(`/api/plugins/${encodeURIComponent(slug)}`, {
        method: installed ? "POST" : "DELETE",
      });
      if (!response.ok) throw new Error(await errorText(response));
    },

    onMutate: async ({ slug, installed }) => {
      await client.cancelQueries({ queryKey: pluginKey });
      const previous = client.getQueryData<PluginList>(pluginKey);
      client.setQueryData<PluginList>(pluginKey, (list) =>
        list
          ? {
              ...list,
              installed_count: list.installed_count + (installed ? 1 : -1),
              plugins: list.plugins.map((p) =>
                p.slug === slug ? { ...p, installed } : p,
              ),
            }
          : list,
      );
      return { previous } as never;
    },

    onError: (_error, _variables, context) => {
      const previous = (context as { previous?: PluginList } | undefined)?.previous;
      if (previous) client.setQueryData(pluginKey, previous);
    },

    onSettled: () => client.invalidateQueries({ queryKey: pluginKey }),
  });
}

async function errorText(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.error?.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
