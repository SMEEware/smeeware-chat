"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CheckIcon,
  CpuIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  Loader2Icon,
  LockIcon,
  RotateCcwIcon,
  UserIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LOGIN_CHIME_FLAG } from "@/components/chat/login-chime";
import { HeroBackdrop } from "@/components/site/hero";
import { ThemeToggle } from "@/components/theme-toggle";
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

const vertrauen = [
  { icon: LockIcon, label: "Encrypted at rest" },
  { icon: KeyRoundIcon, label: "Key lives in memory" },
  { icon: CpuIcon, label: "Runs on your machine" },
];

export default function LoginPage() {
  return (
    <React.Suspense fallback={<Geruest />}>
      <Anmeldeformular />
    </React.Suspense>
  );
}

/**
 * Die Buehne der Anmeldung -- derselbe Hintergrund wie der Hero der
 * Landingpage, dieselbe Glaskarte mit Fensterleiste wie seine Vorschau. Wer
 * von der Startseite kommt, landet so im selben Raum statt auf einer
 * nackten Formularseite.
 */
function Rahmen({
  pille,
  children,
}: {
  pille: React.ReactNode;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();

  return (
    <main className="relative isolate flex min-h-svh flex-col overflow-hidden">
      <HeroBackdrop />

      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/assets/img/icon.svg"
            alt="Smeeware"
            width={28}
            height={28}
            className="size-7"
          />
          <span className="font-heading font-semibold tracking-tight">
            SMEEware Chat
          </span>
        </Link>
        <ThemeToggle />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-4 pt-4 pb-16 sm:px-6">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative isolate w-full max-w-[26rem]"
        >
          <div
            aria-hidden
            className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-primary/15 blur-3xl dark:bg-primary/20"
          />

          <div className="overflow-hidden rounded-3xl border bg-card/80 shadow-2xl shadow-black/10 ring-1 ring-black/5 backdrop-blur-xl dark:shadow-black/40 dark:ring-white/10">
            {/* Die Fensterleiste der Hero-Vorschau -- hier traegt sie den
                Stand: gesperrt, eingerichtet wird, oder noch unbekannt. */}
            <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
              <div aria-hidden className="flex gap-1.5">
                <span className="size-2 rounded-full bg-muted-foreground/25" />
                <span className="size-2 rounded-full bg-muted-foreground/25" />
                <span className="size-2 rounded-full bg-muted-foreground/25" />
              </div>
              <span className="ml-1 font-mono text-xs text-muted-foreground">
                smeeware · sign in
              </span>
              <span className="ml-auto">{pille}</span>
            </div>

            {children}
          </div>
        </motion.div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {vertrauen.map((eintrag) => (
            <span
              key={eintrag.label}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card/60 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm"
            >
              <eintrag.icon className="size-3 text-primary" />
              {eintrag.label}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}

function Pille({
  ton,
  children,
}: {
  ton: "bereit" | "neu" | "wartet" | "aus";
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground">
      <span
        className={cn(
          "size-1.5 rounded-full",
          ton === "bereit" && "bg-emerald-500",
          ton === "neu" && "bg-primary",
          ton === "wartet" && "animate-pulse bg-muted-foreground/50",
          ton === "aus" && "bg-destructive",
        )}
      />
      {children}
    </span>
  );
}

function Geruest() {
  return (
    <Rahmen pille={<Pille ton="wartet">checking</Pille>}>
      <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-2 sm:px-8">
        <div className="size-16 animate-pulse rounded-full bg-muted/60" />
        <div className="h-7 w-44 animate-pulse rounded-lg bg-muted/60" />
        <div className="h-4 w-56 animate-pulse rounded-md bg-muted/40" />
      </div>
      <div className="flex flex-col gap-3 px-6 pt-6 pb-8 sm:px-8">
        <div className="h-11 animate-pulse rounded-xl bg-muted/40" />
        <div className="h-11 animate-pulse rounded-xl bg-muted/40" />
        <div className="mt-2 h-11 animate-pulse rounded-xl bg-muted/60" />
      </div>
    </Rahmen>
  );
}

function Anmeldeformular() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const weiter = sicheresZiel(params.get("next"));

  const [status, setStatus] = React.useState<Status | null>(null);
  // Das Backend hat nicht geantwortet -- ein eigener Zustand, damit eine
  // Fehlerantwort nicht als "noch nicht eingerichtet" gelesen wird.
  const [offline, setOffline] = React.useState(false);
  const [versuch, setVersuch] = React.useState(0);
  const [username, setUsername] = React.useState("");
  const [passwort, setPasswort] = React.useState("");
  const [wiederholung, setWiederholung] = React.useState("");
  const [sichtbar, setSichtbar] = React.useState(false);
  const [feststell, setFeststell] = React.useState(false);
  const [laeuft, setLaeuft] = React.useState(false);
  const [fehler, setFehler] = React.useState<string | null>(null);

  React.useEffect(() => {
    let abgebrochen = false;
    void (async () => {
      try {
        const antwort = await fetch("/api/auth", { cache: "no-store" });
        // Eine 502 traegt einen Fehler-Body, keinen Status. Ungeprueft
        // gelesen waere ``configured`` undefined -- und die Seite boete an,
        // ein Konto anzulegen, das es laengst gibt.
        if (!antwort.ok) throw new Error("unreachable");
        const daten = (await antwort.json()) as Status;
        if (abgebrochen) return;
        setOffline(false);
        setFehler(null);
        setStatus(daten);
        if (daten.username) setUsername(daten.username);
        if (daten.authenticated) router.replace(weiter);
      } catch {
        if (abgebrochen) return;
        setStatus(null);
        setOffline(true);
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [router, weiter, versuch]);

  // Sobald das Backend geantwortet hat, steht der Cursor dort, wo es
  // weitergeht: ist der Name schon bekannt, gleich im Passwort. Erst jetzt
  // und nicht per autoFocus -- vorher sind die Felder noch gesperrt.
  const nameRef = React.useRef<HTMLInputElement>(null);
  const passwortRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!status || status.authenticated) return;
    (status.username ? passwortRef : nameRef).current?.focus();
  }, [status]);

  const einrichten = status !== null && !status.configured;
  const staerke = einrichten ? passwortStaerke(passwort) : null;
  const passtZusammen = wiederholung.length > 0 && wiederholung === passwort;
  const passtNicht =
    wiederholung.length > 0 && !passwort.startsWith(wiederholung);

  // Die Feststelltaste verraet sich nur an Tastenereignissen -- also an
  // jedem Druck im Passwortfeld nachsehen, nicht einmalig.
  const pruefeFeststell = (event: React.KeyboardEvent<HTMLInputElement>) =>
    setFeststell(event.getModifierState("CapsLock"));

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

  const gesperrt = status === null || laeuft;
  const kannSenden =
    !gesperrt &&
    username.length > 0 &&
    passwort.length > 0 &&
    (!einrichten || wiederholung.length > 0);

  const pille = offline ? (
    <Pille ton="aus">offline</Pille>
  ) : status === null ? (
    <Pille ton="wartet">checking</Pille>
  ) : einrichten ? (
    <Pille ton="neu">first run</Pille>
  ) : (
    <Pille ton="bereit">locked</Pille>
  );

  return (
    <Rahmen pille={pille}>
      <div className="flex flex-col items-center px-6 pt-8 text-center sm:px-8">
        <span className="relative isolate">
          <span
            aria-hidden
            className="absolute -inset-3 -z-10 rounded-full bg-primary/25 blur-xl"
          />
          <Image
            src="/assets/img/clip.gif"
            height={125}
            width={125}
            alt="SMEEware"
            unoptimized
            className="size-16 rounded-full bg-background/70 object-contain p-1.5 ring-1 ring-border/70"
          />
        </span>

        <h1 className="mt-5 font-heading text-3xl font-semibold tracking-tight">
          {offline ? (
            <>
              Backend <span className="hero-accent">offline</span>
            </>
          ) : einrichten ? (
            <>
              Set up <span className="hero-accent">SMEEware</span>
            </>
          ) : (
            <>
              Welcome <span className="hero-accent">back</span>
            </>
          )}
        </h1>
        <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-pretty text-muted-foreground">
          {offline
            ? "Start the backend and try again — your chats stay locked until it answers."
            : status === null
              ? "Checking in with the backend…"
              : einrichten
                ? "Choose a password. Your chats are encrypted with it — there is no way to recover them without it."
                : "Your chats are locked until you sign in."}
        </p>
      </div>

      <form
        onSubmit={absenden}
        className="flex flex-col gap-3 px-6 pt-6 pb-8 sm:px-8"
      >
        <Feld
          icon={<UserIcon className="size-4" />}
          value={username}
          onChange={setUsername}
          ref={nameRef}
          placeholder="Username"
          aria-label="Username"
          autoComplete="username"
          disabled={gesperrt}
        />

        <Feld
          icon={<LockIcon className="size-4" />}
          value={passwort}
          onChange={setPasswort}
          ref={passwortRef}
          placeholder="Password"
          aria-label="Password"
          type={sichtbar ? "text" : "password"}
          autoComplete={einrichten ? "new-password" : "current-password"}
          disabled={gesperrt}
          onKeyDown={pruefeFeststell}
          onKeyUp={pruefeFeststell}
          onBlur={() => setFeststell(false)}
          trailing={
            <button
              type="button"
              onClick={() => setSichtbar((s) => !s)}
              aria-label={sichtbar ? "Hide password" : "Show password"}
              aria-pressed={sichtbar}
              tabIndex={-1}
              className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              {sichtbar ? (
                <EyeOffIcon className="size-4" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </button>
          }
        />

        {staerke && passwort.length > 0 ? (
          <StaerkeAnzeige staerke={staerke} />
        ) : null}

        {einrichten ? (
          <Feld
            icon={<KeyRoundIcon className="size-4" />}
            value={wiederholung}
            onChange={setWiederholung}
            placeholder="Repeat password"
            aria-label="Repeat password"
            aria-invalid={passtNicht || undefined}
            type={sichtbar ? "text" : "password"}
            autoComplete="new-password"
            disabled={laeuft}
            onKeyDown={pruefeFeststell}
            onKeyUp={pruefeFeststell}
            onBlur={() => setFeststell(false)}
            warnt={passtNicht}
            trailing={
              passtZusammen ? (
                <CheckIcon
                  aria-label="Passwords match"
                  className="mr-1.5 size-4 text-emerald-600 dark:text-emerald-400"
                />
              ) : null
            }
          />
        ) : null}

        {offline ? (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-[12px] text-destructive ring-1 ring-destructive/20 ring-inset animate-in fade-in slide-in-from-top-1 duration-200"
          >
            <AlertCircleIcon className="size-3.5 shrink-0" />
            <span className="flex-1">The backend is not reachable.</span>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-7 cursor-pointer gap-1 rounded-lg px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                setOffline(false);
                setVersuch((n) => n + 1);
              }}
            >
              <RotateCcwIcon className="size-3.5" />
              Retry
            </Button>
          </div>
        ) : null}

        {feststell ? (
          <p className="flex items-center gap-1.5 px-1 text-[11px] text-amber-600 dark:text-amber-400">
            <KeyRoundIcon className="size-3" />
            Caps Lock is on
          </p>
        ) : null}

        {fehler ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-[12px] leading-relaxed text-destructive ring-1 ring-destructive/20 ring-inset animate-in fade-in slide-in-from-top-1 duration-200"
          >
            <AlertCircleIcon className="mt-px size-3.5 shrink-0" />
            {fehler}
          </p>
        ) : null}

        {/* Derselbe Schein wie am "Start chatting" im Hero -- aber nur, wenn
            der Knopf auch etwas tun kann. Ein gluehender, gesperrter Knopf
            verspraeche etwas, das er nicht haelt. */}
        <div className="relative isolate mt-2">
          <span
            aria-hidden
            className={cn(
              "absolute -inset-1.5 -z-10 rounded-2xl bg-primary/35 blur-xl transition-opacity duration-300",
              kannSenden ? "opacity-100" : "opacity-0",
            )}
          />
          <Button
            type="submit"
            size="lg"
            disabled={!kannSenden}
            className="group h-11 w-full cursor-pointer rounded-xl shadow-lg shadow-primary/25"
          >
            {laeuft ? (
              <Loader2Icon className="animate-spin" data-icon="inline-start" />
            ) : null}
            {einrichten ? "Create account" : "Sign in"}
            {laeuft ? null : (
              <ArrowRightIcon
                data-icon="inline-end"
                className="transition-transform group-hover:translate-x-0.5"
              />
            )}
          </Button>
        </div>

        {einrichten ? (
          <p className="mt-1 px-1 text-center text-[11px] leading-relaxed text-muted-foreground/70">
            The password is never stored — only a hash of it. A forgotten
            password means the chats are gone for good.
          </p>
        ) : null}
      </form>
    </Rahmen>
  );
}

type Staerke = { stufe: 0 | 1 | 2 | 3; label: string };

/**
 * Grob, aber ehrlich: Laenge zaehlt am meisten, Vielfalt hilft. Kein
 * Anspruch, ein Passwort-Pruefer zu sein -- nur ein Hinweis, bevor man sich
 * an etwas bindet, das sich nicht zuruecksetzen laesst.
 */
function passwortStaerke(passwort: string): Staerke {
  let punkte = 0;
  if (passwort.length >= 8) punkte += 1;
  if (passwort.length >= 12) punkte += 1;
  if (passwort.length >= 16) punkte += 1;
  if (/[a-z]/.test(passwort) && /[A-Z]/.test(passwort)) punkte += 1;
  if (/\d/.test(passwort)) punkte += 1;
  if (/[^A-Za-z0-9]/.test(passwort)) punkte += 1;

  if (passwort.length < 8) return { stufe: 0, label: "Too short" };
  if (punkte <= 2) return { stufe: 1, label: "Weak" };
  if (punkte <= 4) return { stufe: 2, label: "Good" };
  return { stufe: 3, label: "Strong" };
}

function StaerkeAnzeige({ staerke }: { staerke: Staerke }) {
  const farbe =
    staerke.stufe <= 1
      ? "bg-destructive"
      : staerke.stufe === 2
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className="flex items-center gap-2 px-1" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2].map((segment) => (
          <span
            key={segment}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              segment < Math.max(staerke.stufe, 1) ? farbe : "bg-muted",
            )}
          />
        ))}
      </div>
      <span className="w-16 text-right text-[11px] text-muted-foreground">
        {staerke.label}
      </span>
    </div>
  );
}

function Feld({
  icon,
  value,
  onChange,
  trailing,
  warnt,
  ...props
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (wert: string) => void;
  trailing?: React.ReactNode;
  warnt?: boolean;
} & Omit<React.ComponentProps<"input">, "onChange" | "value">) {
  return (
    <label
      className={cn(
        "group flex h-11 items-center gap-2.5 rounded-xl bg-background/60 pr-1.5 pl-3.5 ring-1 ring-border/70 transition-[box-shadow,background-color] ring-inset",
        "focus-within:bg-background focus-within:shadow-[0_0_0_4px] focus-within:shadow-primary/10 focus-within:ring-primary/50",
        warnt && "ring-destructive/50 focus-within:ring-destructive/60",
        props.disabled && "opacity-60",
      )}
    >
      <span className="text-muted-foreground/60 transition-colors group-focus-within:text-primary">
        {icon}
      </span>
      <input
        {...props}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
      />
      {trailing}
    </label>
  );
}
