"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { enUS as enDateLocale, de as deDateLocale } from "date-fns/locale";
import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  PencilLineIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useApiKeyActions,
  useApiKeys,
  type ApiKey,
  type ApiKeyCreated,
} from "@/hooks/use-api-keys";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/settings/section-parts";
import { useLocale, useT } from "@/context/i18n-provider";
import type { Locale } from "@/lib/i18n/config";

export function ApiKeysSection() {
  const t = useT();
  const list = useApiKeys();
  const { create, rename, pendingDelete } = useApiKeyActions();

  const [newOpen, setNewOpen] = React.useState(false);
  const [newNonce, setNewNonce] = React.useState(0);
  const [freshKey, setFreshKey] = React.useState<ApiKeyCreated | null>(null);

  const openNew = () => {
    setNewNonce((n) => n + 1);
    setNewOpen(true);
  };

  const keys = list.data?.keys ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <SectionHeader
          title={t("settings.keys.title")}
          text={t("settings.keys.text")}
        />
        <button
          type="button"
          onClick={openNew}
          className="ms-auto flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-medium text-primary-foreground shadow-sm shadow-primary/25 transition-all hover:brightness-110 active:scale-95"
        >
          <PlusIcon className="size-3.5" />
          {t("settings.keys.newKey")}
        </button>
      </div>

      <UsageHint />

      {list.isLoading ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground/60">
          {t("common.loading")}
        </p>
      ) : list.isError ? (
        <p className="py-6 text-center text-[13px] text-destructive">
          {list.error.message}
        </p>
      ) : keys.length === 0 ? (
        <EmptyState onNew={openNew} />
      ) : (
        <ul className="flex flex-col gap-2">
          {keys.map((k) => (
            <KeyRow
              key={k.id}
              apiKey={k}
              onRename={(name) => rename.mutate({ id: k.id, name })}
              onDelete={() => pendingDelete.mutate(k.id)}
            />
          ))}
        </ul>
      )}

      <NewKeyDialog
        key={newNonce}
        open={newOpen}
        onOpenChange={setNewOpen}
        create={create.mutateAsync}
        running={create.isPending}
        onCreated={(k) => {
          setNewOpen(false);
          setFreshKey(k);
        }}
      />

      <SecretDialog
        apiKey={freshKey}
        onClose={() => setFreshKey(null)}
      />
    </div>
  );
}

function UsageHint() {
  const t = useT();
  const example = `curl -N https://your-host/api/v1/chat/stream \\
  -H "Authorization: Bearer sk_smee_…" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Hello!"}]}'`;
  const [before, after] = t("settings.keys.goingOnlineText").split("{code}");

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-5">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-8 size-28 rounded-full bg-primary/20 opacity-40 blur-3xl"
      />
      <div className="relative flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheckIcon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="text-sm font-medium">{t("settings.keys.goingOnline")}</h3>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {before}
            <code className="rounded bg-muted/70 px-1 py-px font-mono text-[11px]">
              REQUIRE_API_KEY=true
            </code>
            {after}
          </p>
          <div className="relative mt-1 overflow-x-auto rounded-lg bg-muted/50 p-3">
            <pre className="font-mono text-[11px] leading-relaxed text-foreground/80">
              {example}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <KeyRoundIcon className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t("settings.keys.noKeys")}</p>
        <p className="max-w-xs text-[12px] leading-relaxed text-muted-foreground/60">
          {t("settings.keys.noKeysText")}
        </p>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="mt-1 flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium text-primary ring-1 ring-primary/30 transition-colors ring-inset hover:bg-primary/10"
      >
        <PlusIcon className="size-3.5" />
        {t("settings.keys.createFirst")}
      </button>
    </div>
  );
}

function KeyRow({
  apiKey,
  onRename,
  onDelete,
}: {
  apiKey: ApiKey;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const dateLocale = useLocale();
  const [rename, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState(apiKey.name);
  const [confirm, setConfirm] = React.useState(false);

  const save = () => {
    const clean = draft.trim();
    setRenaming(false);
    if (clean && clean !== apiKey.name) onRename(clean);
    else setDraft(apiKey.name);
  };

  return (
    <li className="group/key relative flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3 transition-colors hover:border-border">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
        <KeyRoundIcon className="size-4" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {rename ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setDraft(apiKey.name);
                setRenaming(false);
              }
            }}
            className="h-7 w-full max-w-56 rounded-md bg-background px-2 text-[13px] font-medium outline-none ring-1 ring-primary/40 ring-inset"
          />
        ) : (
          <span className="truncate text-[13px] font-medium">
            {apiKey.name}
          </span>
        )}
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
          <code className="font-mono text-muted-foreground/80">
            {apiKey.prefix}…
          </code>
          <span aria-hidden>·</span>
          <span className="tabular-nums">
            {time(apiKey.last_used_at, t, dateLocale)}
          </span>
        </span>
      </div>

      {confirm ? (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-destructive">
            {t("settings.keys.revokeQ")}
          </span>
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="h-7 cursor-pointer rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("settings.keys.cancel")}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="h-7 cursor-pointer rounded-md bg-destructive px-2 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
          >
            {t("settings.keys.revoke")}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/key:opacity-100 focus-within:opacity-100 max-md:opacity-100">
          <button
            type="button"
            onClick={() => {
              setDraft(apiKey.name);
              setRenaming(true);
            }}
            aria-label={t("settings.keys.renameKey")}
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-primary/10 hover:text-primary"
          >
            <PencilLineIcon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setConfirm(true)}
            aria-label={t("settings.keys.revokeKey")}
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}

function time(
  iso: string | null,
  t: ReturnType<typeof useT>,
  locale: Locale,
): string {
  if (!iso) return t("settings.keys.neverUsed");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ago = formatDistanceToNow(d, {
    addSuffix: true,
    locale: locale === "de" ? deDateLocale : enDateLocale,
  });
  return t("settings.keys.usedAgo", { ago });
}

function NewKeyDialog({
  open,
  onOpenChange,
  create,
  running,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  create: (name: string) => Promise<ApiKeyCreated>;
  running: boolean;
  onCreated: (k: ApiKeyCreated) => void;
}) {
  const t = useT();
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const k = await create(name.trim());
      onCreated(k);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden rounded-2xl bg-background/95 p-0 ring-1 ring-border/70 backdrop-blur-xl ring-inset sm:max-w-md">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 size-56 -translate-x-1/2 rounded-full bg-primary/20 opacity-40 blur-3xl"
        />
        <DialogHeader className="relative flex-row items-start gap-3 space-y-0 px-5 pt-5 pb-4">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <KeyRoundIcon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <DialogTitle className="font-heading text-[15px] font-semibold tracking-tight">
              {t("settings.keys.newKeyTitle")}
            </DialogTitle>
            <DialogDescription className="text-[12px] text-muted-foreground/60">
              {t("settings.keys.newKeyDesc")}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="relative flex flex-col gap-3 px-5 pt-1 pb-5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={t("settings.keys.newKeyPlaceholder")}
            className="h-10 rounded-lg bg-muted/40 px-3 text-[13px] outline-none transition-shadow placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-inset"
          />
          {error ? (
            <p className="text-[12px] text-destructive">{error}</p>
          ) : null}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 cursor-pointer rounded-lg px-3 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("settings.keys.cancel")}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || running}
              className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
            >
              {running ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
              {t("settings.keys.createKey")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SecretDialog({
  apiKey,
  onClose,
}: {
  apiKey: ApiKeyCreated | null;
  onClose: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <Dialog
      open={apiKey !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="gap-0 overflow-hidden rounded-2xl bg-background/95 p-0 ring-1 ring-border/70 backdrop-blur-xl ring-inset sm:max-w-md">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 size-56 -translate-x-1/2 rounded-full bg-emerald-500/20 opacity-50 blur-3xl"
        />
        <DialogHeader className="relative flex-row items-start gap-3 space-y-0 px-5 pt-5 pb-4">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
            <CheckIcon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <DialogTitle className="font-heading text-[15px] font-semibold tracking-tight">
              {t("settings.keys.readyTitle", { name: apiKey?.name ?? "" })}
            </DialogTitle>
            <DialogDescription className="text-[12px] text-muted-foreground/60">
              {t("settings.keys.readyDesc")}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="relative flex flex-col gap-3 px-5 pt-1 pb-5">
          <div className="flex items-stretch gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-muted/60 px-3 py-2.5 font-mono text-[12px] leading-relaxed break-all text-foreground/90">
              {apiKey?.secret}
            </code>
            <button
              type="button"
              onClick={() => {
                if (apiKey)
                  navigator.clipboard
                    .writeText(apiKey.secret)
                    .then(() => setCopied(true));
              }}
              aria-label={t("settings.keys.copyKey")}
              className={cn(
                "flex w-11 shrink-0 items-center justify-center rounded-lg text-[12px] font-medium transition-colors",
                copied
                  ? "bg-emerald-500/15 text-emerald-500"
                  : "bg-primary text-primary-foreground hover:brightness-110",
              )}
            >
              {copied ? (
                <CheckIcon className="size-4" />
              ) : (
                <CopyIcon className="size-4" />
              )}
            </button>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>{t("settings.keys.storeWarning")}</span>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 cursor-pointer rounded-lg bg-muted/60 px-4 text-[12px] font-medium transition-colors hover:bg-muted"
            >
              {t("settings.keys.done")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
