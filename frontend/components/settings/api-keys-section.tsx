"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
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

/**
 * Die API-Schluessel -- anlegen, umbenennen, widerrufen.
 *
 * Der ganze Abschnitt dreht sich um eine Tatsache: der Klartext eines
 * Schluessels ist genau einmal zu sehen, im Moment des Anlegens. Danach
 * liegt im Backend nur sein Hash. Deshalb ist das Anlegen kein stiller
 * Listeneintrag, sondern ein eigener Schritt mit einer Warnung und einem
 * grossen Kopierknopf -- wer jetzt nicht kopiert, braucht einen neuen.
 */
export function ApiKeysSection() {
  const liste = useApiKeys();
  const { anlegen, umbenennen, loeschen } = useApiKeyActions();

  const [neuOffen, setNeuOffen] = React.useState(false);
  const [neuNonce, setNeuNonce] = React.useState(0);
  const [frisch, setFrisch] = React.useState<ApiKeyCreated | null>(null);

  // Jedes Oeffnen setzt die Dialog-Instanz neu auf (key = nonce): das
  // Formular startet leer, ohne dass ein Effekt Felder zuruecksetzen muss.
  const oeffneNeu = () => {
    setNeuNonce((n) => n + 1);
    setNeuOffen(true);
  };

  const keys = liste.data?.keys ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <SectionHeader
          titel="API keys"
          text="Put your backend online. A key lets a request in from outside — send it as a bearer token."
        />
        <button
          type="button"
          onClick={oeffneNeu}
          className="ms-auto flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-medium text-primary-foreground shadow-sm shadow-primary/25 transition-all hover:brightness-110 active:scale-95"
        >
          <PlusIcon className="size-3.5" />
          New key
        </button>
      </div>

      <UsageHint />

      {liste.isLoading ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground/60">
          Loading…
        </p>
      ) : liste.isError ? (
        <p className="py-6 text-center text-[13px] text-destructive">
          {liste.error.message}
        </p>
      ) : keys.length === 0 ? (
        <LeerZustand onNew={oeffneNeu} />
      ) : (
        <ul className="flex flex-col gap-2">
          {keys.map((k) => (
            <KeyRow
              key={k.id}
              schluessel={k}
              onRename={(name) => umbenennen.mutate({ id: k.id, name })}
              onDelete={() => loeschen.mutate(k.id)}
            />
          ))}
        </ul>
      )}

      <NeuerSchluesselDialog
        key={neuNonce}
        offen={neuOffen}
        onOpenChange={setNeuOffen}
        anlegen={anlegen.mutateAsync}
        laeuft={anlegen.isPending}
        onErzeugt={(k) => {
          setNeuOffen(false);
          setFrisch(k);
        }}
      />

      <GeheimnisDialog
        schluessel={frisch}
        onClose={() => setFrisch(null)}
      />
    </div>
  );
}

/** Kurz erklaeren, wie ein Schluessel benutzt wird -- mit kopierbarem cURL. */
function UsageHint() {
  const beispiel = `curl -N https://your-host/api/v1/chat/stream \\
  -H "Authorization: Bearer sk_smee_…" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Hello!"}]}'`;

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
          <h3 className="text-sm font-medium">Going online</h3>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Keys are checked only when the backend runs with{" "}
            <code className="rounded bg-muted/70 px-1 py-px font-mono text-[11px]">
              REQUIRE_API_KEY=true
            </code>
            . Locally, nothing changes — your own chat keeps working through its
            session.
          </p>
          <div className="relative mt-1 overflow-x-auto rounded-lg bg-muted/50 p-3">
            <pre className="font-mono text-[11px] leading-relaxed text-foreground/80">
              {beispiel}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeerZustand({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <KeyRoundIcon className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">No keys yet</p>
        <p className="max-w-xs text-[12px] leading-relaxed text-muted-foreground/60">
          Create one to authenticate requests once your backend is reachable
          from the outside.
        </p>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="mt-1 flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium text-primary ring-1 ring-primary/30 transition-colors ring-inset hover:bg-primary/10"
      >
        <PlusIcon className="size-3.5" />
        Create your first key
      </button>
    </div>
  );
}

function KeyRow({
  schluessel,
  onRename,
  onDelete,
}: {
  schluessel: ApiKey;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [umbenennen, setUmbenennen] = React.useState(false);
  const [entwurf, setEntwurf] = React.useState(schluessel.name);
  const [bestaetigen, setBestaetigen] = React.useState(false);

  const speichern = () => {
    const sauber = entwurf.trim();
    setUmbenennen(false);
    if (sauber && sauber !== schluessel.name) onRename(sauber);
    else setEntwurf(schluessel.name);
  };

  return (
    <li className="group/key relative flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3 transition-colors hover:border-border">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
        <KeyRoundIcon className="size-4" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {umbenennen ? (
          <input
            autoFocus
            value={entwurf}
            onChange={(e) => setEntwurf(e.target.value)}
            onBlur={speichern}
            onKeyDown={(e) => {
              if (e.key === "Enter") speichern();
              if (e.key === "Escape") {
                setEntwurf(schluessel.name);
                setUmbenennen(false);
              }
            }}
            className="h-7 w-full max-w-56 rounded-md bg-background px-2 text-[13px] font-medium outline-none ring-1 ring-primary/40 ring-inset"
          />
        ) : (
          <span className="truncate text-[13px] font-medium">
            {schluessel.name}
          </span>
        )}
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
          <code className="font-mono text-muted-foreground/80">
            {schluessel.prefix}…
          </code>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{zeit(schluessel.last_used_at)}</span>
        </span>
      </div>

      {bestaetigen ? (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-destructive">
            Revoke?
          </span>
          <button
            type="button"
            onClick={() => setBestaetigen(false)}
            className="h-7 cursor-pointer rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="h-7 cursor-pointer rounded-md bg-destructive px-2 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Revoke
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/key:opacity-100 focus-within:opacity-100 max-md:opacity-100">
          <button
            type="button"
            onClick={() => {
              setEntwurf(schluessel.name);
              setUmbenennen(true);
            }}
            aria-label="Rename key"
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-primary/10 hover:text-primary"
          >
            <PencilLineIcon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setBestaetigen(true)}
            aria-label="Revoke key"
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}

/** "used 3h ago" oder, wenn nie benutzt, ein ruhiges "never used". */
function zeit(iso: string | null): string {
  if (!iso) return "never used";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `used ${formatDistanceToNow(d, { addSuffix: true })}`;
}

function NeuerSchluesselDialog({
  offen,
  onOpenChange,
  anlegen,
  laeuft,
  onErzeugt,
}: {
  offen: boolean;
  onOpenChange: (o: boolean) => void;
  anlegen: (name: string) => Promise<ApiKeyCreated>;
  laeuft: boolean;
  onErzeugt: (k: ApiKeyCreated) => void;
}) {
  const [name, setName] = React.useState("");
  const [fehler, setFehler] = React.useState<string | null>(null);

  const absenden = async (event: React.FormEvent) => {
    event.preventDefault();
    setFehler(null);
    try {
      const k = await anlegen(name.trim());
      onErzeugt(k);
    } catch (ausnahme) {
      setFehler(ausnahme instanceof Error ? ausnahme.message : "Failed.");
    }
  };

  return (
    <Dialog open={offen} onOpenChange={onOpenChange}>
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
              New API key
            </DialogTitle>
            <DialogDescription className="text-[12px] text-muted-foreground/60">
              Give it a name so you can tell your keys apart later.
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={absenden} className="relative flex flex-col gap-3 px-5 pt-1 pb-5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="e.g. Laptop, CI, production"
            className="h-10 rounded-lg bg-muted/40 px-3 text-[13px] outline-none transition-shadow placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-inset"
          />
          {fehler ? (
            <p className="text-[12px] text-destructive">{fehler}</p>
          ) : null}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 cursor-pointer rounded-lg px-3 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || laeuft}
              className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
            >
              {laeuft ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
              Create key
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Der eine Moment, in dem der Klartext sichtbar ist. */
function GeheimnisDialog({
  schluessel,
  onClose,
}: {
  schluessel: ApiKeyCreated | null;
  onClose: () => void;
}) {
  const [kopiert, setKopiert] = React.useState(false);

  React.useEffect(() => {
    if (!kopiert) return;
    const t = setTimeout(() => setKopiert(false), 1800);
    return () => clearTimeout(t);
  }, [kopiert]);

  return (
    <Dialog
      open={schluessel !== null}
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
              {schluessel?.name} is ready
            </DialogTitle>
            <DialogDescription className="text-[12px] text-muted-foreground/60">
              Copy it now — this is the only time it is shown.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="relative flex flex-col gap-3 px-5 pt-1 pb-5">
          <div className="flex items-stretch gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-muted/60 px-3 py-2.5 font-mono text-[12px] leading-relaxed break-all text-foreground/90">
              {schluessel?.secret}
            </code>
            <button
              type="button"
              onClick={() => {
                if (schluessel)
                  navigator.clipboard
                    .writeText(schluessel.secret)
                    .then(() => setKopiert(true));
              }}
              aria-label="Copy key"
              className={cn(
                "flex w-11 shrink-0 items-center justify-center rounded-lg text-[12px] font-medium transition-colors",
                kopiert
                  ? "bg-emerald-500/15 text-emerald-500"
                  : "bg-primary text-primary-foreground hover:brightness-110",
              )}
            >
              {kopiert ? (
                <CheckIcon className="size-4" />
              ) : (
                <CopyIcon className="size-4" />
              )}
            </button>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Store it somewhere safe. We only keep a hash — if you lose it,
              revoke this key and make a new one.
            </span>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 cursor-pointer rounded-lg bg-muted/60 px-4 text-[12px] font-medium transition-colors hover:bg-muted"
            >
              Done
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
