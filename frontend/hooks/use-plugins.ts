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
      const antwort = await fetch("/api/plugins", { signal, cache: "no-store" });
      if (!antwort.ok) throw new Error(await fehlertext(antwort));
      return (await antwort.json()) as PluginList;
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
      const antwort = await fetch(`/api/plugins/${encodeURIComponent(slug)}`, {
        method: installed ? "POST" : "DELETE",
      });
      if (!antwort.ok) throw new Error(await fehlertext(antwort));
    },

    onMutate: async ({ slug, installed }) => {
      await client.cancelQueries({ queryKey: pluginKey });
      const vorher = client.getQueryData<PluginList>(pluginKey);
      client.setQueryData<PluginList>(pluginKey, (liste) =>
        liste
          ? {
              ...liste,
              installed_count: liste.installed_count + (installed ? 1 : -1),
              plugins: liste.plugins.map((p) =>
                p.slug === slug ? { ...p, installed } : p,
              ),
            }
          : liste,
      );
      return { vorher } as never;
    },

    onError: (_fehler, _variablen, context) => {
      const vorher = (context as { vorher?: PluginList } | undefined)?.vorher;
      if (vorher) client.setQueryData(pluginKey, vorher);
    },

    onSettled: () => client.invalidateQueries({ queryKey: pluginKey }),
  });
}

async function fehlertext(antwort: Response): Promise<string> {
  try {
    const nutzlast = await antwort.json();
    return nutzlast?.error?.message ?? `HTTP ${antwort.status}`;
  } catch {
    return `HTTP ${antwort.status}`;
  }
}
