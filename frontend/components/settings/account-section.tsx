"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ImageIcon,
  Loader2Icon,
  LogOutIcon,
  Trash2Icon,
  UserIcon,
} from "lucide-react";

import {
  useAccount,
  useDeleteAccount,
  useSetAvatar,
  useUpdateAccount,
} from "@/hooks/use-account";
import { cn } from "@/lib/utils";
import { SectionCard, SectionHeader } from "@/components/settings/section-parts";

/**
 * Das Konto -- Bild, Name, Passwort, Abmelden, Loeschen.
 *
 * Frueher ein Reiter im Chat-Dialog. Hierher gezogen, weil es nichts mit dem
 * Chat zu tun hat: was man am Konto tut, tut man selten und woanders als
 * beim Tippen einer Frage.
 */
export function AccountSection() {
  const router = useRouter();
  const konto = useAccount();
  const avatar = useSetAvatar();
  const aendern = useUpdateAccount();

  const bildRef = React.useRef<HTMLInputElement>(null);
  const [nameEntwurf, setName] = React.useState<string | null>(null);
  const [alt, setAlt] = React.useState("");
  const [neu, setNeu] = React.useState("");
  const [wiederholung, setWiederholung] = React.useState("");
  const [fehler, setFehler] = React.useState<string | null>(null);
  const [erfolg, setErfolg] = React.useState<string | null>(null);
  const [abmelden, setAbmelden] = React.useState(false);

  const benutzer = konto.data?.username ?? "";
  // Abgeleitet: solange niemand getippt hat, zeigt das Feld den Namen aus
  // dem Konto -- ohne Effekt, der ihn hineinkopiert.
  const name = nameEntwurf ?? benutzer;

  const melde = (text: string) => {
    setErfolg(text);
    setFehler(null);
    setTimeout(() => setErfolg(null), 4000);
  };

  const nameSpeichern = async (event: React.FormEvent) => {
    event.preventDefault();
    setFehler(null);
    try {
      await aendern.mutateAsync({ username: name.trim() });
      setName(null);
      melde("Name changed.");
    } catch (ausnahme) {
      setFehler(ausnahme instanceof Error ? ausnahme.message : "Failed.");
    }
  };

  const passwortSpeichern = async (event: React.FormEvent) => {
    event.preventDefault();
    setFehler(null);

    if (neu !== wiederholung) {
      setFehler("The two new passwords do not match.");
      return;
    }
    if (neu.length < 8) {
      setFehler("Use at least 8 characters.");
      return;
    }

    try {
      await aendern.mutateAsync({ current_password: alt, new_password: neu });
      setAlt("");
      setNeu("");
      setWiederholung("");
      melde("Password changed. Your chats stay readable.");
    } catch (ausnahme) {
      setFehler(ausnahme instanceof Error ? ausnahme.message : "Failed.");
    }
  };

  const ausloggen = async () => {
    setAbmelden(true);
    await fetch("/api/auth", { method: "DELETE" });
    router.replace("/login");
  };

  const entfernen = useDeleteAccount();
  const [bestaetigen, setBestaetigen] = React.useState(false);

  const kontoLoeschen = async () => {
    setFehler(null);
    try {
      await entfernen.mutateAsync();
      router.replace("/login");
    } catch (ausnahme) {
      setFehler(ausnahme instanceof Error ? ausnahme.message : "Failed.");
      setBestaetigen(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        titel="Account"
        text="Your profile, sign-in, and the switch that ends it all."
      />

      {/* -- Bild und Abmelden -------------------------------------- */}
      <SectionCard className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => bildRef.current?.click()}
          disabled={avatar.isPending}
          className="group relative size-16 shrink-0 cursor-pointer overflow-hidden rounded-full ring-1 ring-border/70 transition-colors ring-inset hover:ring-primary/45 disabled:opacity-50"
          aria-label="Change profile picture"
        >
          {konto.data?.has_avatar ? (
            <Image
              key={konto.dataUpdatedAt}
              src={`/api/account/avatar?v=${konto.dataUpdatedAt}`}
              alt=""
              height={64}
              width={64}
              unoptimized
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center bg-primary/10 text-primary/70">
              <UserIcon className="size-6" />
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 transition-opacity group-hover:opacity-100">
            {avatar.isPending ? (
              <Loader2Icon className="size-4 animate-spin text-primary" />
            ) : (
              <ImageIcon className="size-4 text-foreground" />
            )}
          </span>
        </button>

        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{benutzer}</span>
          <span className="text-[12px] text-muted-foreground/60">
            Click the picture to change it
          </span>
        </div>

        <button
          type="button"
          onClick={ausloggen}
          disabled={abmelden}
          className="ms-auto flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] text-muted-foreground/70 ring-1 ring-border/70 transition-colors ring-inset hover:text-destructive hover:ring-destructive/40 disabled:opacity-50"
        >
          <LogOutIcon className="size-3.5" />
          Sign out
        </button>

        <input
          ref={bildRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const datei = event.target.files?.[0];
            event.target.value = "";
            if (datei) avatar.mutate(datei);
          }}
        />
      </SectionCard>

      {/* -- Name ---------------------------------------------------- */}
      <SectionCard>
        <form onSubmit={nameSpeichern} className="flex flex-col gap-3">
          <h3 className="text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase">
            Username
          </h3>
          <div className="flex gap-2">
            <Feld
              value={name}
              onChange={setName}
              placeholder="Username"
              className="flex-1"
            />
            <Knopf
              disabled={!name.trim() || name.trim() === benutzer}
              laeuft={aendern.isPending}
            />
          </div>
        </form>
      </SectionCard>

      {/* -- Passwort ------------------------------------------------ */}
      <SectionCard>
        <form onSubmit={passwortSpeichern} className="flex flex-col gap-3">
          <h3 className="text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase">
            Password
          </h3>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Feld
              value={alt}
              onChange={setAlt}
              type="password"
              autoComplete="current-password"
              placeholder="Current password"
              className="col-span-2"
            />
            <span aria-hidden />

            <Feld
              value={neu}
              onChange={setNeu}
              type="password"
              autoComplete="new-password"
              placeholder="New password"
            />
            <Feld
              value={wiederholung}
              onChange={setWiederholung}
              type="password"
              autoComplete="new-password"
              placeholder="Repeat"
            />
            <Knopf
              disabled={!alt || !neu || !wiederholung}
              laeuft={aendern.isPending}
            />
          </div>
        </form>
      </SectionCard>

      {fehler || erfolg ? (
        <p
          className={cn(
            "-mt-2 text-[12px]",
            fehler ? "text-destructive" : "text-emerald-500",
          )}
        >
          {fehler ?? erfolg}
        </p>
      ) : null}

      {/* -- Gefahrenzone ------------------------------------------- */}
      <div className="relative overflow-hidden rounded-2xl border border-destructive/25 bg-destructive/[0.04] p-5">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-10 -right-8 size-28 rounded-full bg-destructive/25 opacity-40 blur-3xl"
        />
        <div className="relative flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <Trash2Icon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="text-sm font-medium text-foreground">
              Delete account
            </h3>
            <p className="text-[12px] leading-relaxed text-muted-foreground/60">
              Erases your account, every chat, all notifications, uploads, and
              API keys, and signs you out. Your skills stay. There is no undo —
              you set up a fresh account afterwards.
            </p>
          </div>
        </div>

        <div className="relative mt-4">
          {bestaetigen ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium text-destructive">
                Delete everything for good?
              </span>
              <div className="ms-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBestaetigen(false)}
                  disabled={entfernen.isPending}
                  className="h-8 cursor-pointer rounded-lg px-3 text-[12px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={kontoLoeschen}
                  disabled={entfernen.isPending}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-destructive px-3 text-[12px] font-medium text-white shadow-sm shadow-destructive/30 transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
                >
                  {entfernen.isPending ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2Icon className="size-3.5" />
                  )}
                  Delete everything
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setBestaetigen(true)}
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium text-destructive ring-1 ring-destructive/30 transition-colors ring-inset hover:bg-destructive/10 hover:ring-destructive/45"
            >
              <Trash2Icon className="size-3.5" />
              Delete account
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Feld({
  value,
  onChange,
  className,
  ...props
}: {
  value: string;
  onChange: (wert: string) => void;
} & Omit<React.ComponentProps<"input">, "onChange" | "value">) {
  return (
    <input
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-9 min-w-0 shrink-0 rounded-lg bg-muted/40 px-3 text-[13px] outline-none transition-shadow placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-inset",
        className,
      )}
    />
  );
}

function Knopf({ disabled, laeuft }: { disabled: boolean; laeuft: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled || laeuft}
      className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium text-foreground/80 ring-1 ring-border/70 transition-colors ring-inset hover:text-primary hover:ring-primary/45 disabled:pointer-events-none disabled:opacity-40"
    >
      {laeuft ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
      Save
    </button>
  );
}
