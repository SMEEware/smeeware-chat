"use client";

import { useQuery } from "@tanstack/react-query";

/** Ein Unterordner auf dem Host des Agenten. */
export type FsEntry = { name: string; path: string; hidden: boolean };

/** Was der Browser pro Verzeichnis bekommt. */
export type FsListing = {
  path: string;
  parent: string | null;
  home: string;
  separator: string;
  entries: FsEntry[];
};

/**
 * Ein Verzeichnis auf dem Rechner des Backends lesen.
 *
 * ``null`` als Pfad bedeutet "das Arbeitsverzeichnis des Agenten" -- das
 * Backend waehlt den Startpunkt. Besuchte Ordner bleiben kurz im Cache, damit
 * das Zurueckspringen nicht flackert.
 */
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
        let meldung = `HTTP ${res.status}`;
        try {
          meldung = (await res.json())?.error?.message ?? meldung;
        } catch {
          // Kein JSON -- der Status muss reichen.
        }
        throw new Error(meldung);
      }
      return (await res.json()) as FsListing;
    },
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}
