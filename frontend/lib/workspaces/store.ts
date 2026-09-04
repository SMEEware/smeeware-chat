"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Workspace = {
  id: string;
  name: string;
  pfad: string;
  notiz?: string;
  angelegt: string;
};

type WorkspaceStore = {
  workspaces: Workspace[];
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
          aktivId: z.aktivId === id ? null : z.aktivId,
        })),

      aktivSetzen: (id) => {
        const aktuell = get().aktivId;
        set({ aktivId: aktuell === id ? null : id });
      },
    }),
    { name: "smeeware:workspaces" },
  ),
);

export function aktiverWorkspace(store: WorkspaceStore): Workspace | null {
  if (!store.aktivId) return null;
  return store.workspaces.find((w) => w.id === store.aktivId) ?? null;
}

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
