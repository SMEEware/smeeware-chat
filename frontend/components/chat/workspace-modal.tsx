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
import { useT } from "@/context/i18n-provider";

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function WorkspaceModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const workspaces = useWorkspaces((z) => z.workspaces);
  const activeId = useWorkspaces((z) => z.activeId);
  const add = useWorkspaces((z) => z.add);
  const update = useWorkspaces((z) => z.update);
  const remove = useWorkspaces((z) => z.remove);
  const setActive = useWorkspaces((z) => z.setActive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 font-heading tracking-tight">
            <FolderGit2Icon className="size-4 text-primary" />
            {t("workspace.title")}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {t("workspace.intro")}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
          {workspaces.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-[13px] text-muted-foreground/70">
              {t("workspace.empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {workspaces.map((ws) => (
                <WorkspaceRow
                  key={ws.id}
                  workspace={ws}
                  active={ws.id === activeId}
                  onActivate={() => setActive(ws.id)}
                  onSave={(part) => update(ws.id, part)}
                  onRemove={() => remove(ws.id)}
                />
              ))}
            </ul>
          )}

          <WorkspaceForm onCreate={add} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkspaceRow({
  workspace,
  active,
  onActivate,
  onSave,
  onRemove,
}: {
  workspace: Workspace;
  active: boolean;
  onActivate: () => void;
  onSave: (part: Partial<Pick<Workspace, "name" | "path" | "note">>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(workspace.name);
  const [path, setPath] = React.useState(workspace.path);
  const [note, setNote] = React.useState(workspace.note ?? "");
  const [browsing, setBrowsing] = React.useState(false);

  if (editing) {
    return (
      <li className="rounded-xl border border-border/70 p-3">
        {browsing ? (
          <DirectoryBrowser
            startPath={path || null}
            onCancel={() => setBrowsing(false)}
            onPick={(p) => {
              setPath(p);
              setBrowsing(false);
            }}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("workspace.editNamePlaceholder")}
              className="h-8 text-sm"
            />
            <div className="flex gap-2">
              <Input
                value={path}
                onChange={(e) => setPath(e.target.value)}
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
                {t("workspace.browse")}
              </Button>
            </div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("workspace.editNotesPlaceholder")}
              className="min-h-16 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                {t("workspace.cancel")}
              </Button>
              <Button
                size="xs"
                onClick={() => {
                  onSave({ name, path, note });
                  setEditing(false);
                }}
              >
                {t("workspace.save")}
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
        active
          ? "border-primary/40 bg-primary/[0.04]"
          : "border-border/70 hover:bg-muted/40",
      )}
    >
      <button
        type="button"
        onClick={onActivate}
        aria-label={active ? t("workspace.deactivate") : t("workspace.makeActive")}
        title={active ? t("workspace.activeClickOff") : t("workspace.makeActive")}
        className={cn(
          "mt-0.5 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors",
          active
            ? "bg-primary/15 text-primary"
            : "bg-muted text-muted-foreground hover:text-foreground",
        )}
      >
        {active ? (
          <CheckIcon className="size-4" />
        ) : (
          <FolderGit2Icon className="size-4" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{workspace.name}</span>
          {active ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              active
            </span>
          ) : null}
        </div>
        {workspace.path ? (
          <p className="truncate font-mono text-[11px] text-muted-foreground/70">
            {workspace.path}
          </p>
        ) : null}
        {workspace.note ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/80">
            {workspace.note}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("workspace.editWorkspace")}
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setEditing(true)}
        >
          <PencilLineIcon className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("workspace.deleteWorkspace")}
          className="text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

function WorkspaceForm({
  onCreate,
}: {
  onCreate: (input: { name: string; path: string; note?: string }) => string;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [browsing, setBrowsing] = React.useState(false);
  const [name, setName] = React.useState("");
  const [path, setPath] = React.useState("");
  const [note, setNote] = React.useState("");

  const reset = () => {
    setName("");
    setPath("");
    setNote("");
    setBrowsing(false);
    setOpen(false);
  };

  const canSave = name.trim().length > 0 || path.trim().length > 0;

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="mt-3 w-full cursor-pointer border-dashed"
        onClick={() => setOpen(true)}
      >
        <PlusIcon className="size-4" />
        {t("workspace.addWorkspace")}
      </Button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-medium">{t("workspace.newWorkspace")}</p>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("workspace.cancel")}
          className="text-muted-foreground"
          onClick={reset}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      {browsing ? (
        <DirectoryBrowser
          startPath={path || null}
          onCancel={() => setBrowsing(false)}
          onPick={(p) => {
            setPath(p);
            if (!name.trim()) setName(basename(p));
            setBrowsing(false);
          }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">{t("workspace.nameLabel")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("workspace.newNamePlaceholder")}
              className="h-8 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">{t("workspace.pathLabel")}</Label>
            <div className="flex gap-2">
              <Input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/absolute/path/to/project"
                className="h-8 flex-1 font-mono text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 cursor-pointer"
                onClick={() => setBrowsing(true)}
                title={t("workspace.browseTitle")}
              >
                <FolderIcon className="size-4" />
                {t("workspace.browse")}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground/70">
              Browse the agent&apos;s host, or paste an absolute path yourself.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">{t("workspace.notesLabel")}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("workspace.newNotesPlaceholder")}
              className="min-h-16 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button size="xs" variant="ghost" onClick={reset}>
              {t("workspace.cancel")}
            </Button>
            <Button
              size="xs"
              disabled={!canSave}
              onClick={() => {
                onCreate({ name, path, note });
                reset();
              }}
            >
              {t("workspace.add")}
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
  const t = useT();
  const [path, setPath] = React.useState<string | null>(startPath);
  const [hidden, setHidden] = React.useState(false);
  const { data, isLoading, isFetching, error } = useFsListing(
    path,
    true,
    hidden,
  );

  const current = data?.path ?? "";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("workspace.home")}
          title={t("workspace.homeTitle")}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => setPath(null)}
        >
          <HouseIcon className="size-4" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("workspace.upOneLevel")}
          title={t("workspace.upOneLevel")}
          disabled={!data?.parent}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => data?.parent && setPath(data.parent)}
        >
          <CornerLeftUpIcon className="size-4" />
        </Button>
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg bg-muted/60 px-2.5 py-1.5">
          <p
            dir="rtl"
            className="truncate text-left font-mono text-[11px] text-muted-foreground"
            title={current}
          >
            {current || "…"}
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
            {t("workspace.reading")}
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-[12px] text-destructive">
            <AlertTriangleIcon className="size-4" />
            {error instanceof Error ? error.message : t("workspace.readError")}
          </div>
        ) : data && data.entries.length > 0 ? (
          <ul>
            {data.entries.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  onClick={() => setPath(entry.path)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted/70"
                >
                  <FolderIcon
                    className={cn(
                      "size-4 shrink-0",
                      entry.hidden
                        ? "text-muted-foreground/40"
                        : "text-muted-foreground/80",
                    )}
                  />
                  <span
                    className={cn(
                      "truncate",
                      entry.hidden && "text-muted-foreground/70",
                    )}
                  >
                    {entry.name}
                  </span>
                  <ChevronRightIcon className="ms-auto size-3.5 shrink-0 text-muted-foreground/40" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground/60">
            {t("workspace.noSubfolders")}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground/80 select-none">
          <input
            type="checkbox"
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
            className="size-3 accent-primary"
          />
          {t("workspace.showHidden")}
        </label>
        <div className="flex gap-2">
          <Button size="xs" variant="ghost" onClick={onCancel}>
            {t("workspace.cancel")}
          </Button>
          <Button
            size="xs"
            disabled={!current}
            onClick={() => current && onPick(current)}
          >
            <CheckIcon className="size-3.5" />
            {t("workspace.useThisFolder")}
          </Button>
        </div>
      </div>
    </div>
  );
}
