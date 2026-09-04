"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Workspaces -- der Kontext, auf dem gearbeitet wird.
 *
 * Ein Workspace haelt fest, WO etwas liegt (ein Projektpfad, ein Ordner)
 * und ein paar Notizen dazu. Der aktive Workspace wird jedem Turn als
 * Kontext beigelegt, damit das Modell weiss, worum es geht -- welches
 * Projekt, welcher Pfad, welche Vorgaben.
 *
 * Bewusst im Browser gespeichert und nicht am Konto: das ist eine Vorliebe
 * fuer diesen Rechner, so wie die uebrigen Einstellungen. Und bewusst im
 * Frontend gehalten -- das Backend bleibt davon unberuehrt; der Kontext
 * reist als Text mit der Nachricht, kein neuer Endpunkt noetig.
 *
 * Der Pfad zeigt auf ein Verzeichnis auf dem Rechner des Backends -- dort,
 * wo die Werkzeuge des Agenten laufen. Gewaehlt wird er ueber den
 * Verzeichnis-Browser, der genau diesen Host liest; lokal ist das der eigene
 * Rechner, im Betrieb der Host des Agenten.
 */
export type Workspace = {
  id: string;
  /** Anzeigename -- kurz, so wie er in der Liste steht. */
  name: string;
  /** Pfad oder Adresse des Kontexts. Frei eingetragen. */
  pfad: string;
  /** Freie Notizen: worum geht es, welche Vorgaben gelten. */
  notiz?: string;
  /** ISO-Zeitpunkt des Anlegens -- nur zur Anzeige. */
  angelegt: string;
};

type WorkspaceStore = {
  workspaces: Workspace[];
  /** id des aktiven Workspace -- null heisst: keiner, kein Kontext mitreisen. */
  aktivId: string | null;

  hinzufuegen: (eingabe: {
    name: string;
    pfad: string;
    notiz?: string;
  }) => string;
  aktualisieren: (
    id: string,
    teil: Partial<Pick<Workspace, "name" | "pfad" | "notiz">>,
  ) => void;
  entfernen: (id: string) => void;
  aktivSetzen: (id: string | null) => void;
};

const neueId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ws-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const useWorkspaces = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaces: [],
      aktivId: null,

      hinzufuegen: ({ name, pfad, notiz }) => {
        const id = neueId();
        const workspace: Workspace = {
          id,
          name: name.trim() || pfad.trim() || "Untitled",
          pfad: pfad.trim(),
          notiz: notiz?.trim() || undefined,
          angelegt: new Date().toISOString(),
        };
        set((z) => ({
          workspaces: [...z.workspaces, workspace],
          // Der erste angelegte wird gleich aktiv -- sonst legt man einen an
          // und nichts passiert, bis man ihn noch einmal anfasst.
          aktivId: z.aktivId ?? id,
        }));
        return id;
      },

      aktualisieren: (id, teil) =>
        set((z) => ({
          workspaces: z.workspaces.map((w) =>
            w.id === id
              ? {
                  ...w,
                  ...teil,
                  name: teil.name !== undefined ? teil.name.trim() : w.name,
                  pfad: teil.pfad !== undefined ? teil.pfad.trim() : w.pfad,
                  notiz:
                    teil.notiz !== undefined
                      ? teil.notiz.trim() || undefined
                      : w.notiz,
                }
              : w,
          ),
        })),

      entfernen: (id) =>
        set((z) => ({
          workspaces: z.workspaces.filter((w) => w.id !== id),
          // War der entfernte aktiv, faellt der Kontext auf "keiner" zurueck.
          aktivId: z.aktivId === id ? null : z.aktivId,
        })),

      aktivSetzen: (id) => {
        // Ein zweiter Klick auf den aktiven schaltet ihn ab -- ein Weg,
        // ganz ohne Kontext weiterzuarbeiten, ohne ihn zu loeschen.
        const aktuell = get().aktivId;
        set({ aktivId: aktuell === id ? null : id });
      },
    }),
    { name: "smeeware:workspaces" },
  ),
);

/** Der aktive Workspace als Objekt -- oder null. */
export function aktiverWorkspace(store: WorkspaceStore): Workspace | null {
  if (!store.aktivId) return null;
  return store.workspaces.find((w) => w.id === store.aktivId) ?? null;
}

/**
 * Der Kontextblock, der dem Modell beigelegt wird.
 *
 * Landet auf der Leitung an der letzten Nutzernachricht -- nicht im
 * gespeicherten Verlauf, so wie der Anhang-Block. So sieht das Modell immer
 * den GERADE aktiven Workspace, auch wenn man mitten im Chat wechselt.
 */
export function workspaceBlock(workspace: Workspace | null): string {
  if (!workspace) return "";
  const zeilen = [
    "[active workspace]",
    `Name: ${workspace.name}`,
  ];
  if (workspace.pfad) zeilen.push(`Path: ${workspace.pfad}`);
  if (workspace.notiz) zeilen.push(`Notes: ${workspace.notiz}`);
  zeilen.push(
    "Treat this as the working context for the request -- the project or " +
      "folder the user is asking about. When a tool needs a path and none " +
      "is given, use the path above.",
  );
  return zeilen.join("\n");
}
