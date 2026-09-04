"use client";

import * as React from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronRightIcon,
  CornerLeftUpIcon,
  FolderGit2Icon,
  FolderIcon,
  HouseIcon,
  Loader2Icon,
  PencilLineIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useFsListing } from "@/hooks/use-fs";
import { useWorkspaces } from "@/lib/workspaces/store";
import type { Workspace } from "@/lib/workspaces/store";
import { cn } from "@/lib/utils";

function basename(pfad: string): string {
  const teile = pfad.split(/[\\/]/).filter(Boolean);
  return teile[teile.length - 1] ?? pfad;
}

export function WorkspaceModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const workspaces = useWorkspaces((z) => z.workspaces);
  const aktivId = useWorkspaces((z) => z.aktivId);
  const hinzufuegen = useWorkspaces((z) => z.hinzufuegen);
  const aktualisieren = useWorkspaces((z) => z.aktualisieren);
  const entfernen = useWorkspaces((z) => z.entfernen);
  const aktivSetzen = useWorkspaces((z) => z.aktivSetzen);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 font-heading tracking-tight">
            <FolderGit2Icon className="size-4 text-primary" />
            Workspaces
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            The active workspace travels with every message, so the model knows
            which project and path you mean — on the machine the agent runs on.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
          {workspaces.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-[13px] text-muted-foreground/70">
              No workspaces yet. Add one below to give the model a project to
              work from.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {workspaces.map((ws) => (
                <WorkspaceZeile
                  key={ws.id}
                  workspace={ws}
                  aktiv={ws.id === aktivId}
                  onAktiv={() => aktivSetzen(ws.id)}
                  onSpeichern={(teil) => aktualisieren(ws.id, teil)}
                  onEntfernen={() => entfernen(ws.id)}
                />
              ))}
            </ul>
          )}

          <WorkspaceFormular onAnlegen={hinzufuegen} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkspaceZeile({
  workspace,
  aktiv,
  onAktiv,
  onSpeichern,
  onEntfernen,
}: {
  workspace: Workspace;
  aktiv: boolean;
  onAktiv: () => void;
  onSpeichern: (teil: Partial<Pick<Workspace, "name" | "pfad" | "notiz">>) => void;
  onEntfernen: () => void;
}) {
  const [bearbeiten, setBearbeiten] = React.useState(false);
  const [name, setName] = React.useState(workspace.name);
  const [pfad, setPfad] = React.useState(workspace.pfad);
  const [notiz, setNotiz] = React.useState(workspace.notiz ?? "");
  const [browsing, setBrowsing] = React.useState(false);

  if (bearbeiten) {
    return (
      <li className="rounded-xl border border-border/70 p-3">
        {browsing ? (
          <DirectoryBrowser
            startPath={pfad || null}
            onCancel={() => setBrowsing(false)}
            onPick={(p) => {
              setPfad(p);
              setBrowsing(false);
            }}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="h-8 text-sm"
            />
            <div className="flex gap-2">
              <Input
                value={pfad}
                onChange={(e) => setPfad(e.target.value)}
                placeholder="/absolute/path/to/project"
                className="h-8 flex-1 font-mono text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 cursor-pointer"
                onClick={() => setBrowsing(true)}
              >
                <FolderIcon className="size-4" />
                Browse
              </Button>
            </div>
            <Textarea
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              placeholder="Notes the model should know…"
              className="min-h-16 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setBearbeiten(false)}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                onClick={() => {
                  onSpeichern({ name, pfad, notiz });
                  setBearbeiten(false);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <li
      className={cn(
        "group flex items-start gap-3 rounded-xl border p-3 transition-colors",
        aktiv
          ? "border-primary/40 bg-primary/[0.04]"
          : "border-border/70 hover:bg-muted/40",
      )}
    >
      <button
        type="button"
        onClick={onAktiv}
        aria-label={aktiv ? "Deactivate workspace" : "Make active"}
        title={aktiv ? "Active — click to turn off" : "Make active"}
        className={cn(
          "mt-0.5 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors",
          aktiv
            ? "bg-primary/15 text-primary"
            : "bg-muted text-muted-foreground hover:text-foreground",
        )}
      >
        {aktiv ? (
          <CheckIcon className="size-4" />
        ) : (
          <FolderGit2Icon className="size-4" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{workspace.name}</span>
          {aktiv ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              active
            </span>
          ) : null}
        </div>
        {workspace.pfad ? (
          <p className="truncate font-mono text-[11px] text-muted-foreground/70">
            {workspace.pfad}
          </p>
        ) : null}
        {workspace.notiz ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/80">
            {workspace.notiz}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Edit workspace"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setBearbeiten(true)}
        >
          <PencilLineIcon className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Delete workspace"
          className="text-muted-foreground hover:text-destructive"
          onClick={onEntfernen}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

function WorkspaceFormular({
  onAnlegen,
}: {
  onAnlegen: (eingabe: { name: string; pfad: string; notiz?: string }) => string;
}) {
  const [offen, setOffen] = React.useState(false);
  const [browsing, setBrowsing] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pfad, setPfad] = React.useState("");
  const [notiz, setNotiz] = React.useState("");

  const zuruecksetzen = () => {
    setName("");
    setPfad("");
    setNotiz("");
    setBrowsing(false);
    setOffen(false);
  };

  const kannSpeichern = name.trim().length > 0 || pfad.trim().length > 0;

  if (!offen) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="mt-3 w-full cursor-pointer border-dashed"
        onClick={() => setOffen(true)}
      >
        <PlusIcon className="size-4" />
        Add workspace
      </Button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-medium">New workspace</p>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Cancel"
          className="text-muted-foreground"
          onClick={zuruecksetzen}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      {browsing ? (
        <DirectoryBrowser
          startPath={pfad || null}
          onCancel={() => setBrowsing(false)}
          onPick={(p) => {
            setPfad(p);
            if (!name.trim()) setName(basename(p));
            setBrowsing(false);
          }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My project"
              className="h-8 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">Path</Label>
            <div className="flex gap-2">
              <Input
                value={pfad}
                onChange={(e) => setPfad(e.target.value)}
                placeholder="/absolute/path/to/project"
                className="h-8 flex-1 font-mono text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 cursor-pointer"
                onClick={() => setBrowsing(true)}
                title="Browse the folders on the machine the agent runs on"
              >
                <FolderIcon className="size-4" />
                Browse
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground/70">
              Browse the agent&apos;s host, or paste an absolute path yourself.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">Notes</Label>
            <Textarea
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              placeholder="What is this project? Conventions, goals, constraints…"
              className="min-h-16 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button size="xs" variant="ghost" onClick={zuruecksetzen}>
              Cancel
            </Button>
            <Button
              size="xs"
              disabled={!kannSpeichern}
              onClick={() => {
                onAnlegen({ name, pfad, notiz });
                zuruecksetzen();
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DirectoryBrowser({
  startPath,
  onPick,
  onCancel,
}: {
  startPath: string | null;
  onPick: (path: string) => void;
  onCancel: () => void;
}) {
  const [pfad, setPfad] = React.useState<string | null>(startPath);
  const [versteckt, setVersteckt] = React.useState(false);
  const { data, isLoading, isFetching, error } = useFsListing(
    pfad,
    true,
    versteckt,
  );

  const aktuell = data?.path ?? "";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Home"
          title="The agent's working directory"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => setPfad(null)}
        >
          <HouseIcon className="size-4" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Up one level"
          title="Up one level"
          disabled={!data?.parent}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => data?.parent && setPfad(data.parent)}
        >
          <CornerLeftUpIcon className="size-4" />
        </Button>
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg bg-muted/60 px-2.5 py-1.5">
          <p
            dir="rtl"
            className="truncate text-left font-mono text-[11px] text-muted-foreground"
            title={aktuell}
          >
            {aktuell || "…"}
          </p>
        </div>
        {isFetching ? (
          <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground/60" />
        ) : null}
      </div>

      <div className="h-52 overflow-y-auto rounded-lg border border-border/70 bg-background/50 p-1">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground/60">
            <Loader2Icon className="mr-2 size-4 animate-spin" />
            Reading…
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-[12px] text-destructive">
            <AlertTriangleIcon className="size-4" />
            {error instanceof Error ? error.message : "Couldn't read that folder."}
          </div>
        ) : data && data.entries.length > 0 ? (
          <ul>
            {data.entries.map((eintrag) => (
              <li key={eintrag.path}>
                <button
                  type="button"
                  onClick={() => setPfad(eintrag.path)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted/70"
                >
                  <FolderIcon
                    className={cn(
                      "size-4 shrink-0",
                      eintrag.hidden
                        ? "text-muted-foreground/40"
                        : "text-muted-foreground/80",
                    )}
                  />
                  <span
                    className={cn(
                      "truncate",
                      eintrag.hidden && "text-muted-foreground/70",
                    )}
                  >
                    {eintrag.name}
                  </span>
                  <ChevronRightIcon className="ms-auto size-3.5 shrink-0 text-muted-foreground/40" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground/60">
            No subfolders here.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground/80 select-none">
          <input
            type="checkbox"
            checked={versteckt}
            onChange={(e) => setVersteckt(e.target.checked)}
            className="size-3 accent-primary"
          />
          Show hidden
        </label>
        <div className="flex gap-2">
          <Button size="xs" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="xs"
            disabled={!aktuell}
            onClick={() => aktuell && onPick(aktuell)}
          >
            <CheckIcon className="size-3.5" />
            Use this folder
          </Button>
        </div>
      </div>
    </div>
  );
}
