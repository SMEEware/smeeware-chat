"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRoundIcon, Loader2Icon, LockIcon, UserIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LOGIN_CHIME_FLAG } from "@/components/chat/login-chime";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings/store";

function sicheresZiel(roh: string | null): string {
  if (!roh || !roh.startsWith("/") || roh.startsWith("//")) return "/chat";
  if (roh === "/login" || roh.startsWith("/login?")) return "/chat";
  return roh;
}

type Status = {
  configured: boolean;
  username: string | null;
  authenticated: boolean;
};

export default function LoginPage() {
  return (
    <React.Suspense fallback={<Geruest />}>
      <Anmeldeformular />
    </React.Suspense>
  );
}

function Geruest() {
  return (
    <main className="flex min-h-svh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image
            src="/assets/img/clip.gif"
            height={125}
            width={125}
            alt="SMEEware"
            className="h-22 w-auto"
          />
          <div className="h-5 w-40 animate-pulse rounded-md bg-muted/60" />
        </div>
        <div className="flex flex-col gap-2.5 rounded-2xl p-5 ring-1 ring-border/70 ring-inset">
          {[0, 1].map((zeile) => (
            <div
              key={zeile}
              className="h-10 animate-pulse rounded-lg bg-muted/40"
            />
          ))}
          <div className="mt-1 h-9 animate-pulse rounded-lg bg-muted/60" />
        </div>
      </div>
    </main>
  );
}

function Anmeldeformular() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const weiter = sicheresZiel(params.get("next"));

  const [status, setStatus] = React.useState<Status | null>(null);
  const [username, setUsername] = React.useState("");
  const [passwort, setPasswort] = React.useState("");
  const [wiederholung, setWiederholung] = React.useState("");
  const [laeuft, setLaeuft] = React.useState(false);
  const [fehler, setFehler] = React.useState<string | null>(null);

  React.useEffect(() => {
    let abgebrochen = false;
    void (async () => {
      try {
        const antwort = await fetch("/api/auth", { cache: "no-store" });
        const daten = (await antwort.json()) as Status;
        if (abgebrochen) return;
        setStatus(daten);
        if (daten.username) setUsername(daten.username);
        if (daten.authenticated) router.replace(weiter);
      } catch {
        if (!abgebrochen) setFehler("The backend is not reachable.");
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [router, weiter]);

  const einrichten = status !== null && !status.configured;

  const absenden = async (event: React.FormEvent) => {
    event.preventDefault();
    setFehler(null);

    if (einrichten && passwort !== wiederholung) {
      setFehler("The two passwords do not match.");
      return;
    }
    if (einrichten && passwort.length < 8) {
      setFehler("Use at least 8 characters.");
      return;
    }

    setLaeuft(true);
    try {
      const antwort = await fetch(
        `/api/auth${einrichten ? "?mode=setup" : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password: passwort }),
        },
      );

      if (!antwort.ok) {
        let meldung = `HTTP ${antwort.status}`;
        try {
          const nutzlast = await antwort.json();
          meldung = nutzlast?.error?.message ?? meldung;
        } catch {}
        throw new Error(meldung);
      }

      if (einrichten) useSettings.getState().setTourGesehen(false);

      queryClient.clear();

      try {
        sessionStorage.setItem(LOGIN_CHIME_FLAG, "1");
      } catch {}

      window.location.assign(weiter);
      return;
    } catch (ausnahme) {
      setFehler(
        ausnahme instanceof Error ? ausnahme.message : "Sign-in failed.",
      );
      setPasswort("");
      setWiederholung("");
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Image
            src="/assets/img/clip.gif"
            height={125}
            width={125}
            alt="SMEEware"
            className="h-22 w-auto"
          />
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight">
              {einrichten ? "Set up SMEEware" : "Welcome back"}
            </h1>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {status === null
                ? "…"
                : einrichten
                  ? "Choose a password. Your chats are encrypted with it — there is no way to recover them without it."
                  : "Your chats are locked until you sign in."}
            </p>
          </div>
        </div>

        <form
          onSubmit={absenden}
          className="flex flex-col gap-2.5 rounded-2xl p-5 ring-1 ring-border/70 ring-inset"
        >
          <Feld
            icon={<UserIcon className="size-3.5" />}
            value={username}
            onChange={setUsername}
            placeholder="Username"
            autoComplete="username"
            disabled={status === null || laeuft}
          />
          <Feld
            icon={<LockIcon className="size-3.5" />}
            value={passwort}
            onChange={setPasswort}
            placeholder="Password"
            type="password"
            autoComplete={einrichten ? "new-password" : "current-password"}
            disabled={status === null || laeuft}
          />
          {einrichten ? (
            <Feld
              icon={<KeyRoundIcon className="size-3.5" />}
              value={wiederholung}
              onChange={setWiederholung}
              placeholder="Repeat password"
              type="password"
              autoComplete="new-password"
              disabled={laeuft}
            />
          ) : null}

          {fehler ? (
            <p className="px-1 text-[11px] leading-relaxed text-destructive">
              {fehler}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={status === null || laeuft || !username || !passwort}
            className="mt-1 h-9 cursor-pointer rounded-lg"
          >
            {laeuft ? (
              <Loader2Icon className="animate-spin" data-icon="inline-start" />
            ) : null}
            {einrichten ? "Create account" : "Sign in"}
          </Button>
        </form>

        {einrichten ? (
          <p className="mt-4 px-1 text-[11px] leading-relaxed text-muted-foreground/60">
            The password is never stored — only a hash of it. Your chats are
            encrypted with a key derived from it, so a forgotten password means
            the chats are gone for good.
          </p>
        ) : null}
      </div>
    </main>
  );
}

function Feld({
  icon,
  value,
  onChange,
  ...props
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (wert: string) => void;
} & Omit<React.ComponentProps<"input">, "onChange" | "value">) {
  return (
    <label
      className={cn(
        "group flex h-10 items-center gap-2.5 rounded-lg px-3 ring-1 ring-border/70 transition-colors ring-inset",
        "focus-within:ring-primary/45",
      )}
    >
      <span className="text-muted-foreground/60 transition-colors group-focus-within:text-primary">
        {icon}
      </span>
      <input
        {...props}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/50 disabled:opacity-50"
      />
    </label>
  );
}
