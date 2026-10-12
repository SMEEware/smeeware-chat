"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Workspace = {
  id: string;
  name: string;
  path: string;
  note?: string;
  createdAt: string;
};

type WorkspaceStore = {
  workspaces: Workspace[];
  activeId: string | null;

  add: (input: {
    name: string;
    path: string;
    note?: string;
  }) => string;
  update: (
    id: string,
    part: Partial<Pick<Workspace, "name" | "path" | "note">>,
  ) => void;
  remove: (id: string) => void;
  setActive: (id: string | null) => void;
};

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ws-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const useWorkspaces = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeId: null,

      add: ({ name, path, note }) => {
        const id = newId();
        const workspace: Workspace = {
          id,
          name: name.trim() || path.trim() || "Untitled",
          path: path.trim(),
          note: note?.trim() || undefined,
          createdAt: new Date().toISOString(),
        };
        set((z) => ({
          workspaces: [...z.workspaces, workspace],
          activeId: z.activeId ?? id,
        }));
        return id;
      },

      update: (id, part) =>
        set((z) => ({
          workspaces: z.workspaces.map((w) =>
            w.id === id
              ? {
                  ...w,
                  ...part,
                  name: part.name !== undefined ? part.name.trim() : w.name,
                  path: part.path !== undefined ? part.path.trim() : w.path,
                  note:
                    part.note !== undefined
                      ? part.note.trim() || undefined
                      : w.note,
                }
              : w,
          ),
        })),

      remove: (id) =>
        set((z) => ({
          workspaces: z.workspaces.filter((w) => w.id !== id),
          activeId: z.activeId === id ? null : z.activeId,
        })),

      setActive: (id) => {
        const current = get().activeId;
        set({ activeId: current === id ? null : id });
      },
    }),
    { name: "smeeware:workspaces" },
  ),
);

export function selectActiveWorkspace(store: WorkspaceStore): Workspace | null {
  if (!store.activeId) return null;
  return store.workspaces.find((w) => w.id === store.activeId) ?? null;
}

export function workspaceBlock(workspace: Workspace | null): string {
  if (!workspace) return "";
  const lines = [
    "[active workspace]",
    `Name: ${workspace.name}`,
  ];
  if (workspace.path) lines.push(`Path: ${workspace.path}`);
  if (workspace.note) lines.push(`Notes: ${workspace.note}`);
  lines.push(
    "Treat this as the working context for the request -- the project or " +
      "folder the user is asking about. When a tool needs a path and none " +
      "is given, use the path above.",
  );
  return lines.join("\n");
}
