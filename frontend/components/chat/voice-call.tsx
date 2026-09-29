"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AudioLinesIcon,
  HandIcon,
  Loader2Icon,
  MicIcon,
  MicOffIcon,
  PhoneIcon,
  PhoneOffIcon,
  XIcon,
} from "lucide-react";

import { useVoiceCall } from "@/hooks/use-voice-call";
import type { CallPhase } from "@/hooks/use-voice-call";
import type { ChatMessage } from "@/lib/chat/types";
import { useSettings } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

type VoiceList = {
  default: string;
  voices: { id: string; name: string; description: string; language: string }[];
};

const PHASE_TEXT: Record<CallPhase, string> = {
  ready: "Ready when you are",
  connecting: "Connecting…",
  listening: "Listening — go ahead",
  hearing: "Listening…",
  transcribing: "Got it…",
  thinking: "Thinking…",
  speaking: "Speaking — talk to interrupt",
  error: "Something went wrong",
};

/**
 * Das Telefonat als Vollbild ueber dem Chat.
 *
 * Der Chat darunter laeuft ganz normal weiter -- jede Frage und jede Antwort
 * landet im Verlauf. Das Fenster ist nur die Buehne dafuer: eine Kugel, die
 * mit der Stimme atmet, eine Zeile Untertitel, drei Knoepfe.
 */
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
    <CallFenster
      onClose={onClose}
      messages={messages}
      isStreaming={isStreaming}
      send={send}
      stop={stop}
    />
  );
}

function CallFenster({
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
  const stimme = useSettings((z) => z.callVoice);
  const setStimme = useSettings((z) => z.setCallVoice);
  const transkribierer = useSettings((z) => z.transcribeModel);

  const stimmen = useQuery<VoiceList>({
    queryKey: ["voice", "voices"],
    queryFn: async () => (await (await fetch("/api/voice/voices")).json()) as VoiceList,
    staleTime: Infinity,
    retry: false,
  });

  const { auflegen } = call;
  const beenden = React.useCallback(() => {
    auflegen();
    onClose();
  }, [auflegen, onClose]);

  React.useEffect(() => {
    const aufTaste = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        beenden();
      }
    };
    window.addEventListener("keydown", aufTaste);
    return () => window.removeEventListener("keydown", aufTaste);
  }, [beenden]);

  const laeuft = call.phase !== "ready" && call.phase !== "error";
  const gewaehlt = stimme ?? stimmen.data?.default ?? "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Voice call"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background/90 backdrop-blur-2xl animate-in fade-in duration-300"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="hero-aurora absolute -top-40 left-1/4 size-[32rem] rounded-full bg-primary/15 blur-[120px] dark:bg-primary/25" />
        <div className="hero-aurora-slow absolute -right-24 bottom-0 size-[28rem] rounded-full bg-primary/10 blur-[120px] dark:bg-primary/20" />
      </div>

      <header className="flex items-center gap-3 px-4 py-4 sm:px-6">
        <span className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
          <AudioLinesIcon className="size-3.5 text-primary" />
          Voice call
        </span>

        {stimmen.data ? (
          <label className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Voice</span>
            <select
              value={gewaehlt}
              onChange={(event) =>
                setStimme(
                  event.target.value === stimmen.data.default
                    ? null
                    : event.target.value,
                )
              }
              className="cursor-pointer rounded-full border bg-card/70 px-3 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/40"
            >
              {stimmen.data.voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {v.description}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="ms-auto" />
        )}

        <button
          type="button"
          onClick={beenden}
          aria-label="Close voice call"
          className="flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-5" />
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
        <Kugel
          phase={call.phase}
          stumm={call.stumm}
          levelRef={call.levelRef}
          onTap={call.phase === "speaking" ? call.unterbrechen : undefined}
        />

        <div className="flex min-h-28 w-full max-w-xl flex-col items-center gap-3 text-center">
          <p
            aria-live="polite"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
          >
            {call.phase === "transcribing" || call.phase === "connecting" ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : null}
            {call.stumm && laeuft ? "Muted" : PHASE_TEXT[call.phase]}
          </p>

          {call.gesprochen ? (
            <p className="text-lg leading-relaxed text-balance text-foreground md:text-xl animate-in fade-in duration-300">
              {call.gesprochen}
            </p>
          ) : call.gesagt ? (
            <p className="line-clamp-3 text-base leading-relaxed text-balance text-muted-foreground">
              <span className="text-foreground/60">You:</span> {call.gesagt}
            </p>
          ) : call.phase === "ready" ? (
            <p className="max-w-sm text-sm leading-relaxed text-pretty text-muted-foreground/80">
              Talk hands-free. Every question and answer lands in this chat.
              Start talking while it speaks to interrupt.
            </p>
          ) : null}

          {call.fehler ? (
            <p role="alert" className="text-sm text-destructive">
              {call.fehler}
            </p>
          ) : null}
          {!call.verfuegbar && call.phase === "ready" ? (
            <p role="alert" className="max-w-sm text-sm text-destructive">
              Transcription is not available
              {call.grund ? ` — ${call.grund}` : ""}. Pick a working
              transcriber in the settings.
            </p>
          ) : null}
        </div>
      </main>

      <footer className="flex flex-col items-center gap-4 px-6 pb-10">
        <div className="flex items-center gap-5">
          {laeuft ? (
            <>
              <RundKnopf
                label={call.stumm ? "Unmute" : "Mute"}
                onClick={() => call.setStumm(!call.stumm)}
                aktiv={call.stumm}
              >
                {call.stumm ? <MicOffIcon className="size-5" /> : <MicIcon className="size-5" />}
              </RundKnopf>
              <button
                type="button"
                onClick={beenden}
                aria-label="End call"
                className="flex size-16 cursor-pointer items-center justify-center rounded-full bg-destructive text-white shadow-xl shadow-destructive/30 transition-transform hover:brightness-110 active:scale-95"
              >
                <PhoneOffIcon className="size-6" />
              </button>
              <RundKnopf
                label="Interrupt"
                onClick={call.unterbrechen}
                disabled={call.phase !== "speaking" && call.phase !== "thinking"}
              >
                <HandIcon className="size-5" />
              </RundKnopf>
            </>
          ) : (
            <div className="relative isolate">
              <span
                aria-hidden
                className="absolute -inset-3 -z-10 rounded-full bg-emerald-500/30 blur-xl"
              />
              <button
                type="button"
                onClick={() => void call.anrufen()}
                disabled={!call.verfuegbar}
                aria-label="Start call"
                className="flex size-16 cursor-pointer items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/30 transition-transform hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PhoneIcon className="size-6" />
              </button>
            </div>
          )}
        </div>
        <p className="text-center text-[11px] text-muted-foreground/60">
          Free neural voice · transcribed with{" "}
          {transkribierer ?? "your default transcriber"} · Esc to end
        </p>
      </footer>
    </div>
  );
}

function RundKnopf({
  label,
  onClick,
  aktiv,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  aktiv?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={aktiv}
      title={label}
      className={cn(
        "flex size-12 cursor-pointer items-center justify-center rounded-full border backdrop-blur-sm transition-all active:scale-95 disabled:cursor-default disabled:opacity-30",
        aktiv
          ? "border-destructive/40 bg-destructive/15 text-destructive"
          : "bg-card/70 text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Die Kugel. Ihr Pegel kommt aus einem Ref, nicht aus dem State: sie soll
 * sechzigmal pro Sekunde atmen, ohne dafuer sechzigmal React zu bemuehen.
 */
function Kugel({
  phase,
  stumm,
  levelRef,
  onTap,
}: {
  phase: CallPhase;
  stumm: boolean;
  levelRef: React.RefObject<number>;
  onTap?: () => void;
}) {
  const kernRef = React.useRef<HTMLDivElement>(null);
  const hofRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let rahmen = 0;
    let glatt = 0;
    const schritt = () => {
      glatt = glatt * 0.75 + (levelRef.current ?? 0) * 0.25;
      const atmen =
        phase === "listening" || phase === "ready"
          ? (Math.sin(performance.now() / 900) + 1) * 0.02
          : 0;
      const s = 1 + glatt * 0.35 + atmen;
      if (kernRef.current) kernRef.current.style.transform = `scale(${s})`;
      if (hofRef.current) {
        hofRef.current.style.transform = `scale(${1 + glatt * 0.9 + atmen * 2})`;
        hofRef.current.style.opacity = String(0.35 + glatt * 0.65);
      }
      rahmen = requestAnimationFrame(schritt);
    };
    rahmen = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(rahmen);
  }, [phase, levelRef]);

  const denkt = phase === "thinking" || phase === "transcribing";

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!onTap}
      aria-label={onTap ? "Interrupt" : undefined}
      tabIndex={onTap ? 0 : -1}
      className="relative flex size-56 items-center justify-center disabled:cursor-default sm:size-64"
    >
      <div
        ref={hofRef}
        aria-hidden
        className={cn(
          "absolute inset-0 rounded-full blur-2xl transition-colors duration-500",
          stumm ? "bg-muted-foreground/20" : "bg-primary/40",
        )}
      />
      <div
        ref={kernRef}
        aria-hidden
        className={cn(
          "relative size-40 rounded-full shadow-2xl transition-[filter] duration-500 sm:size-44",
          stumm
            ? "bg-muted grayscale"
            : "bg-[radial-gradient(circle_at_30%_25%,color-mix(in_oklab,var(--primary)_55%,white)_0%,var(--primary)_45%,color-mix(in_oklab,var(--primary)_60%,black)_100%)] shadow-primary/40",
        )}
      >
        {denkt ? (
          <div className="absolute inset-0 animate-spin rounded-full bg-[conic-gradient(from_0deg,transparent_0%,rgba(255,255,255,0.45)_20%,transparent_40%)] [animation-duration:1.6s]" />
        ) : null}
        <div className="absolute inset-4 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.35),transparent_60%)]" />
      </div>
    </button>
  );
}
