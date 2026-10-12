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
import { useT } from "@/context/i18n-provider";
import type { TranslateFn } from "@/lib/i18n/translate";

function safeTarget(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/chat";
  if (raw === "/login" || raw.startsWith("/login?")) return "/chat";
  return raw;
}

type Status = {
  configured: boolean;
  username: string | null;
  authenticated: boolean;
};

export default function LoginPage() {
  return (
    <React.Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </React.Suspense>
  );
}

function LoginFrame({
  pill,
  children,
}: {
  pill: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useT();
  const reduced = useReducedMotion();
  const trust = [
    { icon: LockIcon, label: t("login.trustEncrypted") },
    { icon: KeyRoundIcon, label: t("login.trustKeyMemory") },
    { icon: CpuIcon, label: t("login.trustLocal") },
  ];

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
            {t("login.brand")}
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
            <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
              <div aria-hidden className="flex gap-1.5">
                <span className="size-2 rounded-full bg-muted-foreground/25" />
                <span className="size-2 rounded-full bg-muted-foreground/25" />
                <span className="size-2 rounded-full bg-muted-foreground/25" />
              </div>
              <span className="ml-1 font-mono text-xs text-muted-foreground">
                {t("login.terminalTitle")}
              </span>
              <span className="ml-auto">{pill}</span>
            </div>

            {children}
          </div>
        </motion.div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {trust.map((entry) => (
            <span
              key={entry.label}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card/60 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm"
            >
              <entry.icon className="size-3 text-primary" />
              {entry.label}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "ready" | "new" | "waiting" | "off";
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground">
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "ready" && "bg-emerald-500",
          tone === "new" && "bg-primary",
          tone === "waiting" && "animate-pulse bg-muted-foreground/50",
          tone === "off" && "bg-destructive",
        )}
      />
      {children}
    </span>
  );
}

function PillChecking() {
  const t = useT();
  return <Pill tone="waiting">{t("login.pillChecking")}</Pill>;
}

function LoginSkeleton() {
  return (
    <LoginFrame pill={<PillChecking />}>
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
    </LoginFrame>
  );
}

function LoginForm() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const relay = safeTarget(params.get("next"));

  const [status, setStatus] = React.useState<Status | null>(null);
  const [offline, setOffline] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [passwordRepeat, setPasswordRepeat] = React.useState("");
  const [visible, setVisible] = React.useState(false);
  const [capsLock, setCapsLock] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let aborted = false;
    void (async () => {
      try {
        const response = await fetch("/api/auth", { cache: "no-store" });
        if (!response.ok) throw new Error("unreachable");
        const data = (await response.json()) as Status;
        if (aborted) return;
        setOffline(false);
        setError(null);
        setStatus(data);
        if (data.username) setUsername(data.username);
        if (data.authenticated) router.replace(relay);
      } catch {
        if (aborted) return;
        setStatus(null);
        setOffline(true);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [router, relay, attempt]);

  const nameRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!status || status.authenticated) return;
    (status.username ? passwordRef : nameRef).current?.focus();
  }, [status]);

  const setUp = status !== null && !status.configured;
  const strength = setUp ? passwordStrength(password, t) : null;
  const matches = passwordRepeat.length > 0 && passwordRepeat === password;
  const mismatch =
    passwordRepeat.length > 0 && !password.startsWith(passwordRepeat);

  const checkCapsLock = (event: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(event.getModifierState("CapsLock"));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (setUp && password !== passwordRepeat) {
      setError(t("login.passwordsNoMatch"));
      return;
    }
    if (setUp && password.length < 8) {
      setError(t("login.minChars"));
      return;
    }

    setRunning(true);
    try {
      const response = await fetch(
        `/api/auth${setUp ? "?mode=setup" : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        },
      );

      if (!response.ok) {
        let statusMessage = `HTTP ${response.status}`;
        try {
          const payload = await response.json();
          statusMessage = payload?.error?.message ?? statusMessage;
        } catch {}
        throw new Error(statusMessage);
      }

      if (setUp) useSettings.getState().setTourSeen(false);

      queryClient.clear();

      try {
        sessionStorage.setItem(LOGIN_CHIME_FLAG, "1");
      } catch {}

      window.location.assign(relay);
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.signInFailed"));
      setPassword("");
      setPasswordRepeat("");
    } finally {
      setRunning(false);
    }
  };

  const locked = status === null || running;
  const canSubmit =
    !locked &&
    username.length > 0 &&
    password.length > 0 &&
    (!setUp || passwordRepeat.length > 0);

  const pill = offline ? (
    <Pill tone="off">{t("login.pillOffline")}</Pill>
  ) : status === null ? (
    <Pill tone="waiting">{t("login.pillChecking")}</Pill>
  ) : setUp ? (
    <Pill tone="new">{t("login.pillFirstRun")}</Pill>
  ) : (
    <Pill tone="ready">{t("login.pillLocked")}</Pill>
  );

  return (
    <LoginFrame pill={pill}>
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
              {t("login.titleOfflineLead")}{" "}
              <span className="hero-accent">{t("login.titleOfflineAccent")}</span>
            </>
          ) : setUp ? (
            <>
              {t("login.titleSetupLead")}{" "}
              <span className="hero-accent">{t("login.titleSetupAccent")}</span>
            </>
          ) : (
            <>
              {t("login.titleBackLead")}{" "}
              <span className="hero-accent">{t("login.titleBackAccent")}</span>
            </>
          )}
        </h1>
        <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-pretty text-muted-foreground">
          {offline
            ? t("login.subtitleOffline")
            : status === null
              ? t("login.subtitleChecking")
              : setUp
                ? t("login.subtitleSetup")
                : t("login.subtitleLocked")}
        </p>
      </div>

      <form
        onSubmit={submit}
        className="flex flex-col gap-3 px-6 pt-6 pb-8 sm:px-8"
      >
        <InputField
          icon={<UserIcon className="size-4" />}
          value={username}
          onChange={setUsername}
          ref={nameRef}
          placeholder={t("login.username")}
          aria-label={t("login.username")}
          autoComplete="username"
          disabled={locked}
        />

        <InputField
          icon={<LockIcon className="size-4" />}
          value={password}
          onChange={setPassword}
          ref={passwordRef}
          placeholder={t("login.password")}
          aria-label={t("login.password")}
          type={visible ? "text" : "password"}
          autoComplete={setUp ? "new-password" : "current-password"}
          disabled={locked}
          onKeyDown={checkCapsLock}
          onKeyUp={checkCapsLock}
          onBlur={() => setCapsLock(false)}
          trailing={
            <button
              type="button"
              onClick={() => setVisible((s) => !s)}
              aria-label={visible ? t("login.hidePassword") : t("login.showPassword")}
              aria-pressed={visible}
              tabIndex={-1}
              className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              {visible ? (
                <EyeOffIcon className="size-4" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </button>
          }
        />

        {strength && password.length > 0 ? (
          <StrengthMeter strength={strength} />
        ) : null}

        {setUp ? (
          <InputField
            icon={<KeyRoundIcon className="size-4" />}
            value={passwordRepeat}
            onChange={setPasswordRepeat}
            placeholder={t("login.repeatPassword")}
            aria-label={t("login.repeatPassword")}
            aria-invalid={mismatch || undefined}
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            disabled={running}
            onKeyDown={checkCapsLock}
            onKeyUp={checkCapsLock}
            onBlur={() => setCapsLock(false)}
            invalid={mismatch}
            trailing={
              matches ? (
                <CheckIcon
                  aria-label={t("login.passwordsMatch")}
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
            <span className="flex-1">{t("login.backendUnreachable")}</span>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-7 cursor-pointer gap-1 rounded-lg px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                setOffline(false);
                setAttempt((n) => n + 1);
              }}
            >
              <RotateCcwIcon className="size-3.5" />
              {t("login.retry")}
            </Button>
          </div>
        ) : null}

        {capsLock ? (
          <p className="flex items-center gap-1.5 px-1 text-[11px] text-amber-600 dark:text-amber-400">
            <KeyRoundIcon className="size-3" />
            {t("login.capsLock")}
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-[12px] leading-relaxed text-destructive ring-1 ring-destructive/20 ring-inset animate-in fade-in slide-in-from-top-1 duration-200"
          >
            <AlertCircleIcon className="mt-px size-3.5 shrink-0" />
            {error}
          </p>
        ) : null}

        <div className="relative isolate mt-2">
          <span
            aria-hidden
            className={cn(
              "absolute -inset-1.5 -z-10 rounded-2xl bg-primary/35 blur-xl transition-opacity duration-300",
              canSubmit ? "opacity-100" : "opacity-0",
            )}
          />
          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit}
            className="group h-11 w-full cursor-pointer rounded-xl shadow-lg shadow-primary/25"
          >
            {running ? (
              <Loader2Icon className="animate-spin" data-icon="inline-start" />
            ) : null}
            {setUp ? t("login.createAccount") : t("login.signIn")}
            {running ? null : (
              <ArrowRightIcon
                data-icon="inline-end"
                className="transition-transform group-hover:translate-x-0.5"
              />
            )}
          </Button>
        </div>

        {setUp ? (
          <p className="mt-1 px-1 text-center text-[11px] leading-relaxed text-muted-foreground/70">
            {t("login.setupNote")}
          </p>
        ) : null}
      </form>
    </LoginFrame>
  );
}

type Strength = { level: 0 | 1 | 2 | 3; label: string };

function passwordStrength(password: string, t: TranslateFn): Strength {
  let dots = 0;
  if (password.length >= 8) dots += 1;
  if (password.length >= 12) dots += 1;
  if (password.length >= 16) dots += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) dots += 1;
  if (/\d/.test(password)) dots += 1;
  if (/[^A-Za-z0-9]/.test(password)) dots += 1;

  if (password.length < 8) return { level: 0, label: t("login.strengthTooShort") };
  if (dots <= 2) return { level: 1, label: t("login.strengthWeak") };
  if (dots <= 4) return { level: 2, label: t("login.strengthGood") };
  return { level: 3, label: t("login.strengthStrong") };
}

function StrengthMeter({ strength }: { strength: Strength }) {
  const color =
    strength.level <= 1
      ? "bg-destructive"
      : strength.level === 2
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
              segment < Math.max(strength.level, 1) ? color : "bg-muted",
            )}
          />
        ))}
      </div>
      <span className="w-16 text-right text-[11px] text-muted-foreground">
        {strength.label}
      </span>
    </div>
  );
}

function InputField({
  icon,
  value,
  onChange,
  trailing,
  invalid,
  ...props
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  trailing?: React.ReactNode;
  invalid?: boolean;
} & Omit<React.ComponentProps<"input">, "onChange" | "value">) {
  return (
    <label
      className={cn(
        "group flex h-11 items-center gap-2.5 rounded-xl bg-background/60 pr-1.5 pl-3.5 ring-1 ring-border/70 transition-[box-shadow,background-color] ring-inset",
        "focus-within:bg-background focus-within:shadow-[0_0_0_4px] focus-within:shadow-primary/10 focus-within:ring-primary/50",
        invalid && "ring-destructive/50 focus-within:ring-destructive/60",
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
