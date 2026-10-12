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
import { useT } from "@/context/i18n-provider";

const PLUGIN_ICONS: Record<string, LucideIcon> = {
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

const CATEGORY_ORDER: PluginCategory[] = [
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
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const { data, isPending, isError, error } = usePlugins(open);
  const setInstalled = useSetPluginInstalled();

  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<PluginCategory | "all">("all");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const all = React.useMemo(() => data?.plugins ?? [], [data]);

  const categories = React.useMemo(() => {
    const counter = new Map<string, number>();
    for (const plugin of all) {
      counter.set(plugin.category, (counter.get(plugin.category) ?? 0) + 1);
    }
    return CATEGORY_ORDER.filter((id) => counter.has(id)).map((id) => ({
      id,
      label: all.find((p) => p.category === id)?.category_label ?? id,
      count: counter.get(id) ?? 0,
    }));
  }, [all]);

  const visible = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((plugin) => {
      if (category !== "all" && plugin.category !== category) return false;
      if (!needle) return true;
      return (
        plugin.title.toLowerCase().includes(needle) ||
        plugin.slug.includes(needle) ||
        plugin.summary.toLowerCase().includes(needle) ||
        plugin.tools.some((tool) => tool.includes(needle))
      );
    });
  }, [all, category, search]);

  const toggle = (plugin: Plugin) => {
    setInstalled.mutate(
      { slug: plugin.slug, installed: !plugin.installed },
      {
        onSuccess: () =>
          toast.success(
            plugin.installed
              ? `${plugin.title} uninstalled.`
              : `${plugin.title} installed.`,
          ),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(calc(100dvh-2rem),44rem)] flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-w-3xl">
        <DialogHeader className="space-y-1 border-b border-border/60 px-5 py-4">
          <DialogTitle className="font-heading text-lg">{t("plugins.title")}</DialogTitle>
          <DialogDescription className="text-xs">
            {data
              ? t("plugins.installedOf", { installed: data.installed_count, count: data.count })
              : t("plugins.choose")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col sm:h-[30rem] sm:flex-none sm:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 p-2 sm:w-44 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-r sm:border-b-0">
            <Rail
              active={category === "all"}
              label={t("plugins.all")}
              count={all.length}
              onClick={() => setCategory("all")}
            />
            {categories.map((entry) => (
              <Rail
                key={entry.id}
                active={category === entry.id}
                label={entry.label}
                count={entry.count}
                onClick={() => setCategory(entry.id)}
              />
            ))}
          </nav>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-border/60 p-2">
              <div className="relative">
                <SearchIcon className="absolute inset-s-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("plugins.search")}
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
                  {error?.message ?? t("plugins.loadError")}
                </p>
              ) : visible.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {t("plugins.nothingMatches", { query: search })}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {visible.map((plugin) => (
                    <PluginCard
                      key={plugin.slug}
                      plugin={plugin}
                      expanded={expandedId === plugin.slug}
                      running={
                        setInstalled.isPending &&
                        setInstalled.variables?.slug === plugin.slug
                      }
                      onToggleDetails={() =>
                        setExpandedId((previous) =>
                          previous === plugin.slug ? null : plugin.slug,
                        )
                      }
                      onInstall={() => toggle(plugin)}
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
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {label}
      <span className="ms-auto text-[11px] text-muted-foreground/50">
        {count}
      </span>
    </button>
  );
}

function PluginCard({
  plugin,
  expanded,
  running,
  onToggleDetails,
  onInstall,
}: {
  plugin: Plugin;
  expanded: boolean;
  running: boolean;
  onToggleDetails: () => void;
  onInstall: () => void;
}) {
  const t = useT();
  const Symbol = PLUGIN_ICONS[plugin.icon] ?? PuzzleIcon;
  const locked = !plugin.available;

  return (
    <li
      className={cn(
        "rounded-xl border border-border/60 transition-colors",
        plugin.installed && "border-primary/30 bg-primary/[0.03]",
        locked && "opacity-60",
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
          {locked ? (
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
            <span className="hidden shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
              {plugin.category_label}
            </span>
            <ChevronRightIcon
              className={cn(
                "size-3 shrink-0 text-muted-foreground/40 transition-transform",
                expanded && "rotate-90",
              )}
            />
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {locked
              ? t("plugins.needs", { requirements: plugin.missing_requirements.join(", ") || t("plugins.needsFallback") })
              : plugin.summary}
          </span>
        </button>

        <Button
          size="sm"
          variant={plugin.installed ? "outline" : "default"}
          disabled={locked || running}
          onClick={onInstall}
          className="h-7 shrink-0 gap-1 px-2.5 text-xs"
        >
          {running ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : plugin.installed ? (
            <CheckIcon className="size-3" />
          ) : null}
          {plugin.installed ? t("plugins.installed") : t("plugins.install")}
        </Button>
      </div>

      {expanded ? (
        <div className="border-t border-border/50 px-3 py-2.5 ps-14">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {plugin.description}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {plugin.tools.map((tool) => (
              <code
                key={tool}
                className={cn(
                  "rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]",
                  plugin.available_tools.includes(tool)
                    ? "text-muted-foreground"
                    : "text-muted-foreground/40 line-through",
                )}
              >
                {tool}
              </code>
            ))}
          </div>
          {plugin.requires.length > 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground/60">
              {t("plugins.requires", { requirements: plugin.requires.join(", ") })}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
