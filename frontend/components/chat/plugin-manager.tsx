"use client";

import * as React from "react";
import {
  ActivityIcon,
  CheckIcon,
  ChevronRightIcon,
  DatabaseIcon,
  EyeIcon,
  FileTextIcon,
  GlobeIcon,
  GraduationCapIcon,
  ImageIcon,
  Loader2Icon,
  LockIcon,
  MapPinIcon,
  PlugIcon,
  PuzzleIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TerminalIcon,
  Volume2Icon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePlugins,
  useSetPluginInstalled,
  type Plugin,
  type PluginCategory,
} from "@/hooks/use-plugins";
import { cn } from "@/lib/utils";

const SYMBOLE: Record<string, LucideIcon> = {
  Search: SearchIcon,
  Sparkles: SparklesIcon,
  Globe: GlobeIcon,
  FileText: FileTextIcon,
  Image: ImageIcon,
  Eye: EyeIcon,
  Volume2: Volume2Icon,
  Database: DatabaseIcon,
  GraduationCap: GraduationCapIcon,
  Terminal: TerminalIcon,
  Activity: ActivityIcon,
  MapPin: MapPinIcon,
  ShieldCheck: ShieldCheckIcon,
  Plug: PlugIcon,
  Puzzle: PuzzleIcon,
};

const REIHENFOLGE: PluginCategory[] = [
  "search",
  "web",
  "media",
  "files",
  "skills",
  "system",
  "security",
];

export function PluginManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (offen: boolean) => void;
}) {
  const { data, isPending, isError, error } = usePlugins(open);
  const schalten = useSetPluginInstalled();

  const [suche, setSuche] = React.useState("");
  const [kategorie, setKategorie] = React.useState<PluginCategory | "all">("all");
  const [offen, setOffen] = React.useState<string | null>(null);

  const alle = React.useMemo(() => data?.plugins ?? [], [data]);

  const kategorien = React.useMemo(() => {
    const zaehler = new Map<string, number>();
    for (const plugin of alle) {
      zaehler.set(plugin.category, (zaehler.get(plugin.category) ?? 0) + 1);
    }
    return REIHENFOLGE.filter((id) => zaehler.has(id)).map((id) => ({
      id,
      label: alle.find((p) => p.category === id)?.category_label ?? id,
      anzahl: zaehler.get(id) ?? 0,
    }));
  }, [alle]);

  const sichtbar = React.useMemo(() => {
    const nadel = suche.trim().toLowerCase();
    return alle.filter((plugin) => {
      if (kategorie !== "all" && plugin.category !== kategorie) return false;
      if (!nadel) return true;
      return (
        plugin.title.toLowerCase().includes(nadel) ||
        plugin.slug.includes(nadel) ||
        plugin.summary.toLowerCase().includes(nadel) ||
        plugin.tools.some((werkzeug) => werkzeug.includes(nadel))
      );
    });
  }, [alle, kategorie, suche]);

  const umschalten = (plugin: Plugin) => {
    schalten.mutate(
      { slug: plugin.slug, installed: !plugin.installed },
      {
        onSuccess: () =>
          toast.success(
            plugin.installed
              ? `${plugin.title} uninstalled.`
              : `${plugin.title} installed.`,
          ),
        onError: (fehler) => toast.error(fehler.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="space-y-1 border-b border-border/60 px-5 py-4">
          <DialogTitle className="font-heading text-lg">Plugins</DialogTitle>
          <DialogDescription className="text-xs">
            {data
              ? `${data.installed_count} of ${data.count} installed — only installed plugins reach the model.`
              : "Choose which tools the model can use."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col sm:h-[30rem] sm:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 p-2 sm:w-44 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-r sm:border-b-0">
            <Rail
              aktiv={kategorie === "all"}
              label="All"
              anzahl={alle.length}
              onClick={() => setKategorie("all")}
            />
            {kategorien.map((eintrag) => (
              <Rail
                key={eintrag.id}
                aktiv={kategorie === eintrag.id}
                label={eintrag.label}
                anzahl={eintrag.anzahl}
                onClick={() => setKategorie(eintrag.id)}
              />
            ))}
          </nav>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-border/60 p-2">
              <div className="relative">
                <SearchIcon className="absolute inset-s-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  value={suche}
                  onChange={(event) => setSuche(event.target.value)}
                  placeholder="Search plugins and tools…"
                  className="h-8 w-full rounded-lg bg-muted/50 ps-8 pe-2 text-[13px] outline-none placeholder:text-muted-foreground/50 focus:bg-muted"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {isPending ? (
                <div className="flex flex-col gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              ) : isError ? (
                <p className="px-3 py-8 text-center text-sm text-destructive">
                  {error?.message ?? "Plugins could not be loaded."}
                </p>
              ) : sichtbar.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Nothing matches “{suche}”.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {sichtbar.map((plugin) => (
                    <Karte
                      key={plugin.slug}
                      plugin={plugin}
                      offen={offen === plugin.slug}
                      laeuft={
                        schalten.isPending &&
                        schalten.variables?.slug === plugin.slug
                      }
                      onToggleDetails={() =>
                        setOffen((vorher) =>
                          vorher === plugin.slug ? null : plugin.slug,
                        )
                      }
                      onInstall={() => umschalten(plugin)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Rail({
  aktiv,
  label,
  anzahl,
  onClick,
}: {
  aktiv: boolean;
  label: string;
  anzahl: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
        aktiv
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {label}
      <span className="ms-auto text-[11px] text-muted-foreground/50">
        {anzahl}
      </span>
    </button>
  );
}

function Karte({
  plugin,
  offen,
  laeuft,
  onToggleDetails,
  onInstall,
}: {
  plugin: Plugin;
  offen: boolean;
  laeuft: boolean;
  onToggleDetails: () => void;
  onInstall: () => void;
}) {
  const Symbol = SYMBOLE[plugin.icon] ?? PuzzleIcon;
  const gesperrt = !plugin.available;

  return (
    <li
      className={cn(
        "rounded-xl border border-border/60 transition-colors",
        plugin.installed && "border-primary/30 bg-primary/[0.03]",
        gesperrt && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
            plugin.installed
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {gesperrt ? (
            <LockIcon className="size-4" />
          ) : (
            <Symbol className="size-4" />
          )}
        </span>

        <button
          type="button"
          onClick={onToggleDetails}
          className="min-w-0 flex-1 cursor-pointer text-start"
        >
          <span className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium">
              {plugin.title}
            </span>
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {plugin.category_label}
            </span>
            <ChevronRightIcon
              className={cn(
                "size-3 shrink-0 text-muted-foreground/40 transition-transform",
                offen && "rotate-90",
              )}
            />
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {gesperrt
              ? `Needs ${plugin.missing_requirements.join(", ") || "tools that are not loaded"}`
              : plugin.summary}
          </span>
        </button>

        <Button
          size="sm"
          variant={plugin.installed ? "outline" : "default"}
          disabled={gesperrt || laeuft}
          onClick={onInstall}
          className="h-7 shrink-0 gap-1 px-2.5 text-xs"
        >
          {laeuft ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : plugin.installed ? (
            <CheckIcon className="size-3" />
          ) : null}
          {plugin.installed ? "Installed" : "Install"}
        </Button>
      </div>

      {offen ? (
        <div className="border-t border-border/50 px-3 py-2.5 ps-14">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {plugin.description}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {plugin.tools.map((werkzeug) => (
              <code
                key={werkzeug}
                className={cn(
                  "rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]",
                  plugin.available_tools.includes(werkzeug)
                    ? "text-muted-foreground"
                    : "text-muted-foreground/40 line-through",
                )}
              >
                {werkzeug}
              </code>
            ))}
          </div>
          {plugin.requires.length > 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground/60">
              Requires {plugin.requires.join(", ")} in the backend environment.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
