"use client";

import { useQuery } from "@tanstack/react-query";

export type FsEntry = { name: string; path: string; hidden: boolean };

export type FsListing = {
  path: string;
  parent: string | null;
  home: string;
  separator: string;
  entries: FsEntry[];
};

export function useFsListing(
  path: string | null,
  enabled: boolean,
  showHidden = false,
) {
  return useQuery<FsListing>({
    queryKey: ["fs", path ?? "@home", showHidden],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (path) params.set("path", path);
      if (showHidden) params.set("all", "1");
      const query = params.toString();
      const res = await fetch(`/api/fs${query ? `?${query}` : ""}`, {
        signal,
        cache: "no-store",
      });
      if (!res.ok) {
        let statusMessage = `HTTP ${res.status}`;
        try {
          statusMessage = (await res.json())?.error?.message ?? statusMessage;
        } catch {
        }
        throw new Error(statusMessage);
      }
      return (await res.json()) as FsListing;
    },
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}
