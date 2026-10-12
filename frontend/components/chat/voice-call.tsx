"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AudioLinesIcon,
  ChevronDownIcon,
  HandIcon,
  Loader2Icon,
  MicIcon,
  MicOffIcon,
  PhoneIcon,
  PhoneOffIcon,
  XIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useVoiceCall } from "@/hooks/use-voice-call";
import type { CallPhase } from "@/hooks/use-voice-call";
import type { ChatMessage } from "@/lib/chat/types";
import { useSettings } from "@/lib/settings/store";
import { cn } from "@/lib/utils";
import { useT } from "@/context/i18n-provider";
import type { TranslateFn } from "@/lib/i18n/translate";

type VoiceList = {
  default: string;
  voices: { id: string; name: string; description: string; language: string }[];
};

function phaseText(t: TranslateFn): Record<CallPhase, string> {
  return {
    ready: t("voiceCall.phaseReady"),
    connecting: t("voiceCall.phaseConnecting"),
    listening: t("voiceCall.phaseListening"),
    hearing: t("voiceCall.phaseHearing"),
    transcribing: t("voiceCall.phaseTranscribing"),
    thinking: t("voiceCall.phaseThinking"),
    speaking: t("voiceCall.phaseSpeaking"),
    error: t("voiceCall.phaseError"),
  };
}

export function VoiceCall({
  open,
  onClose,
  messages,
  isStreaming,
  send,
  stop,
}: {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  isStreaming: boolean;
  send: (text: string) => void;
  stop: () => void;
}) {
  if (!open) return null;
  return (
    <CallWindow
      onClose={onClose}
      messages={messages}
      isStreaming={isStreaming}
      send={send}
      stop={stop}
    />
  );
}

function CallWindow({
  onClose,
  messages,
  isStreaming,
  send,
  stop,
}: {
  onClose: () => void;
  messages: ChatMessage[];
  isStreaming: boolean;
  send: (text: string) => void;
  stop: () => void;
}) {
  const call = useVoiceCall({ messages, isStreaming, send, stop });
  const voice = useSettings((z) => z.callVoice);
  const setVoice = useSettings((z) => z.setCallVoice);
  const transcriber = useSettings((z) => z.transcribeModel);

  const voices = useQuery<VoiceList>({
    queryKey: ["voice", "voices"],
    queryFn: async () => (await (await fetch("/api/voice/voices")).json()) as VoiceList,
    staleTime: Infinity,
    retry: false,
  });

  const t = useT();
  const PHASE_TEXT = phaseText(t);
  const { hangUp } = call;
  const end = React.useCallback(() => {
    hangUp();
    onClose();
  }, [hangUp, onClose]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if ((event.target as Element | null)?.closest?.('[role="menu"]')) return;
      event.preventDefault();
      end();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [end]);

  React.useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  }, []);

  const running = call.phase !== "ready" && call.phase !== "error";
  const selected = voice ?? voices.data?.default ?? "";
  const selectedName =
    voices.data?.voices.find((v) => v.id === selected)?.name ?? t("voiceCall.voiceFallback");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("voiceCall.title")}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background/90 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl animate-in fade-in duration-300"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="hero-aurora absolute -top-40 left-1/4 size-[32rem] rounded-full bg-primary/15 blur-[120px] dark:bg-primary/25" />
        <div className="hero-aurora-slow absolute -right-24 bottom-0 size-[28rem] rounded-full bg-primary/10 blur-[120px] dark:bg-primary/20" />
      </div>

      <header className="flex items-center gap-3 px-4 py-4 sm:px-6">
        <span className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
          <AudioLinesIcon className="size-3.5 text-primary" />
          {t("voiceCall.title")}
        </span>

        {voices.data ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={t("voiceCall.voiceLabel", { name: selectedName })}
                  className="ms-auto inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border bg-card/60 ps-3 pe-2.5 text-xs font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-muted data-popup-open:bg-muted"
                />
              }
            >
              {selectedName}
              <ChevronDownIcon className="size-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t("voiceCall.voiceMenu")}</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={selected}
                  onValueChange={(value) =>
                    setVoice(value === voices.data.default ? null : String(value))
                  }
                >
                  {voices.data.voices.map((v) => (
                    <DropdownMenuRadioItem key={v.id} value={v.id}>
                      {v.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={call.bargeInAllowed}
                onCheckedChange={(value) => call.setBargeInAllowed(Boolean(value))}
              >
                {t("voiceCall.interruptByTalking")}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="ms-auto" />
        )}

        <button
          type="button"
          onClick={end}
          aria-label={t("voiceCall.closeCall")}
          className="flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-5" />
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
        <Orb
          phase={call.phase}
          muted={call.muted}
          levelRef={call.levelRef}
          onTap={
            call.phase === "speaking" || call.phase === "thinking"
              ? call.interrupt
              : undefined
          }
        />

        <div className="flex min-h-28 w-full max-w-xl flex-col items-center gap-3 text-center">
          <p
            aria-live="polite"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
          >
            {call.phase === "transcribing" || call.phase === "connecting" ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : null}
            {call.muted && running ? t("voiceCall.muted") : PHASE_TEXT[call.phase]}
          </p>

          {call.spokenText ? (
            <p className="text-lg leading-relaxed text-balance text-foreground md:text-xl animate-in fade-in duration-300">
              {call.spokenText}
            </p>
          ) : call.lastSaid ? (
            <p className="line-clamp-3 text-base leading-relaxed text-balance text-muted-foreground">
              <span className="text-foreground/60">{t("voiceCall.youPrefix")}</span> {call.lastSaid}
            </p>
          ) : call.phase === "ready" ? (
            <p className="max-w-sm text-sm leading-relaxed text-pretty text-muted-foreground/80">
              {t("voiceCall.readyBody")}
              {call.bargeInAllowed
                ? t("voiceCall.interruptHintTalk")
                : t("voiceCall.interruptHintTap")}
            </p>
          ) : null}

          {call.error ? (
            <p role="alert" className="text-sm text-destructive">
              {call.error}
            </p>
          ) : null}
          {call.echoNotice ? (
            <p className="max-w-sm text-[13px] leading-relaxed text-pretty text-muted-foreground">
              {t("voiceCall.echoNotice")}
            </p>
          ) : null}
          {!call.available && call.phase === "ready" ? (
            <p role="alert" className="max-w-sm text-sm text-destructive">
              {t("voiceCall.unavailablePrefix")}
              {call.reason ? ` — ${call.reason}` : ""}
              {t("voiceCall.unavailableSuffix")}
            </p>
          ) : null}
        </div>
      </main>

      <footer className="flex flex-col items-center gap-4 px-6 pb-10">
        <div className="flex items-center gap-5">
          {running ? (
            <>
              <RoundButton
                label={call.muted ? t("voiceCall.unmute") : t("voiceCall.mute")}
                onClick={() => call.setMuted(!call.muted)}
                active={call.muted}
              >
                {call.muted ? <MicOffIcon className="size-5" /> : <MicIcon className="size-5" />}
              </RoundButton>
              <button
                type="button"
                onClick={end}
                aria-label={t("voiceCall.endCall")}
                className="flex size-16 cursor-pointer items-center justify-center rounded-full bg-destructive text-white shadow-xl shadow-destructive/30 transition-transform hover:brightness-110 active:scale-95"
              >
                <PhoneOffIcon className="size-6" />
              </button>
              <RoundButton
                label={t("voiceCall.interrupt")}
                onClick={call.interrupt}
                disabled={call.phase !== "speaking" && call.phase !== "thinking"}
              >
                <HandIcon className="size-5" />
              </RoundButton>
            </>
          ) : (
            <div className="relative isolate">
              <span
                aria-hidden
                className="absolute -inset-3 -z-10 rounded-full bg-emerald-500/30 blur-xl"
              />
              <button
                type="button"
                onClick={() => void call.startCall()}
                disabled={!call.available}
                aria-label={t("voiceCall.startCall")}
                className="flex size-16 cursor-pointer items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/30 transition-transform hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PhoneIcon className="size-6" />
              </button>
            </div>
          )}
        </div>
        <p className="text-center text-[11px] text-muted-foreground/60">
          {t("voiceCall.footer", { transcriber: transcriber ?? t("voiceCall.defaultTranscriber") })}
        </p>
      </footer>
    </div>
  );
}

function RoundButton({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex size-12 cursor-pointer items-center justify-center rounded-full border backdrop-blur-sm transition-all active:scale-95 disabled:cursor-default disabled:opacity-30",
        active
          ? "border-destructive/40 bg-destructive/15 text-destructive"
          : "bg-card/70 text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Orb({
  phase,
  muted,
  levelRef,
  onTap,
}: {
  phase: CallPhase;
  muted: boolean;
  levelRef: React.RefObject<number>;
  onTap?: () => void;
}) {
  const t = useT();
  const coreRef = React.useRef<HTMLDivElement>(null);
  const haloRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let frame = 0;
    let smooth = 0;
    const step = () => {
      smooth = smooth * 0.75 + (levelRef.current ?? 0) * 0.25;
      const breathe =
        phase === "listening" || phase === "ready"
          ? (Math.sin(performance.now() / 900) + 1) * 0.02
          : 0;
      const s = 1 + smooth * 0.35 + breathe;
      if (coreRef.current) coreRef.current.style.transform = `scale(${s})`;
      if (haloRef.current) {
        haloRef.current.style.transform = `scale(${1 + smooth * 0.9 + breathe * 2})`;
        haloRef.current.style.opacity = String(0.35 + smooth * 0.65);
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [phase, levelRef]);

  const thinking = phase === "thinking" || phase === "transcribing";

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!onTap}
      aria-label={onTap ? t("voiceCall.interrupt") : undefined}
      tabIndex={onTap ? 0 : -1}
      className="relative flex size-56 items-center justify-center disabled:cursor-default sm:size-64"
    >
      <div
        ref={haloRef}
        aria-hidden
        className={cn(
          "absolute inset-0 rounded-full blur-2xl transition-colors duration-500",
          muted ? "bg-muted-foreground/20" : "bg-primary/40",
        )}
      />
      <div
        ref={coreRef}
        aria-hidden
        className={cn(
          "relative size-40 rounded-full shadow-2xl transition-[filter] duration-500 sm:size-44",
          muted
            ? "bg-muted grayscale"
            : "bg-[radial-gradient(circle_at_30%_25%,color-mix(in_oklab,var(--primary)_55%,white)_0%,var(--primary)_45%,color-mix(in_oklab,var(--primary)_60%,black)_100%)] shadow-primary/40",
        )}
      >
        {thinking ? (
          <div className="absolute inset-0 animate-spin rounded-full bg-[conic-gradient(from_0deg,transparent_0%,rgba(255,255,255,0.45)_20%,transparent_40%)] [animation-duration:1.6s]" />
        ) : null}
        <div className="absolute inset-4 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.35),transparent_60%)]" />
      </div>
    </button>
  );
}
