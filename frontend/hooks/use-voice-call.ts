"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { stripToolScaffolding } from "@/lib/chat/sanitize";
import type { ChatMessage } from "@/lib/chat/types";
import { useSettings } from "@/lib/settings/store";
import { SentenceSplitter, isEcho, isRealUtterance } from "@/lib/voice/speech";

export type CallPhase =
  | "ready"
  | "connecting"
  | "listening"
  | "hearing"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";

type VoiceCallOptions = {
  messages: ChatMessage[];
  isStreaming: boolean;
  send: (text: string) => void;
  stop: () => void;
};

const MIN_THRESHOLD = 0.012;
const MIN_BARGE_IN_THRESHOLD = 0.05;
const TICK_MS = 50;
const ONSET_MS = 150;
const BARGE_IN_MS = 350;
const PAUSE_MS = 900;
const MIN_UTTERANCE_MS = 350;
const MAX_UTTERANCE_MS = 90_000;
const RESTART_WITHOUT_SPEECH_MS = 25_000;
const PREROLL_INTERVAL_MS = 1_500;
const PREFETCH_COUNT = 3;
const TEMPO = 12;
const TAIL_MS = 150;
const QUIET_AFTER_SPEAKING_MS = 400;
const ECHO_WINDOW_MS = 2_500;

function bestMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ].find((type) => MediaRecorder.isTypeSupported(type));
}

function rmsLevel(analyser: AnalyserNode | null, buffer: Float32Array<ArrayBuffer>): number {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

type Sentence = {
  text: string;
  audio: Promise<Blob | null> | null;
  blob?: Blob | null;
};

type Loopback = { a: RTCPeerConnection; b: RTCPeerConnection; stream: MediaStream };

async function buildLoopback(source: MediaStream): Promise<Loopback | null> {
  if (typeof RTCPeerConnection === "undefined") return null;
  const a = new RTCPeerConnection();
  const b = new RTCPeerConnection();
  try {
    a.onicecandidate = (e) => {
      if (e.candidate) void b.addIceCandidate(e.candidate).catch(() => {});
    };
    b.onicecandidate = (e) => {
      if (e.candidate) void a.addIceCandidate(e.candidate).catch(() => {});
    };
    const received = new Promise<MediaStream>((ok) => {
      b.ontrack = (e) => ok(e.streams[0] ?? new MediaStream([e.track]));
    });
    source.getAudioTracks().forEach((trail) => a.addTrack(trail, source));
    const offer = await a.createOffer();
    await a.setLocalDescription(offer);
    await b.setRemoteDescription(offer);
    const response = await b.createAnswer();
    await b.setLocalDescription(response);
    await a.setRemoteDescription(response);
    const stream = await Promise.race([
      received,
      new Promise<null>((r) => setTimeout(() => r(null), 3_000)),
    ]);
    if (!stream) throw new Error("no remote track");
    return { a, b, stream };
  } catch {
    a.close();
    b.close();
    return null;
  }
}

type Recording = { rec: MediaRecorder; chunks: Blob[]; since: number };

function startRecordingFor(mic: MediaStream): Recording {
  const type = bestMimeType();
  const rec = new MediaRecorder(mic, type ? { mimeType: type } : undefined);
  const recording: Recording = { rec, chunks: [], since: performance.now() };
  rec.ondataavailable = (event) => {
    if (event.data.size > 0) recording.chunks.push(event.data);
  };
  rec.start();
  return recording;
}

function discardRecording(recording: Recording | null | undefined): void {
  if (!recording || recording.rec.state === "inactive") return;
  recording.rec.ondataavailable = null;
  recording.rec.onstop = null;
  recording.rec.stop();
}

export function useVoiceCall({ messages, isStreaming, send, stop }: VoiceCallOptions) {
  const transcriber = useSettings((z) => z.transcribeModel);
  const voice = useSettings((z) => z.callVoice);
  const bargeInAllowed = useSettings((z) => z.callBargeIn);
  const setBargeInSetting = useSettings((z) => z.setCallBargeIn);
  const [echoNotice, setEchoNotice] = React.useState(false);

  const [phase, setPhaseState] = React.useState<CallPhase>("ready");
  const [error, setError] = React.useState<string | null>(null);
  const [muted, setMutedState] = React.useState(false);
  const [lastSaid, setLastSaid] = React.useState<string | null>(null);
  const [spokenText, setSpokenText] = React.useState<string | null>(null);

  const status = useQuery<{ available: boolean; reason?: string | null }>({
    queryKey: ["transcribe", "status", transcriber],
    queryFn: async () => {
      const query = transcriber
        ? `?model=${encodeURIComponent(transcriber)}`
        : "";
      const response = await fetch(`/api/transcribe${query}`, {
        cache: "no-store",
      });
      return (await response.json()) as { available: boolean };
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const phaseRef = React.useRef<CallPhase>("ready");
  const mutedRef = React.useRef(false);
  const streamingRef = React.useRef(isStreaming);
  const messagesRef = React.useRef(messages);
  const voiceRef = React.useRef(voice);
  const transcriberRef = React.useRef(transcriber);
  const sendRef = React.useRef(send);
  const stopRef = React.useRef(stop);
  const bargeInAllowedRef = React.useRef(bargeInAllowed);

  React.useEffect(() => {
    bargeInAllowedRef.current = bargeInAllowed;
    streamingRef.current = isStreaming;
    messagesRef.current = messages;
    voiceRef.current = voice;
    transcriberRef.current = transcriber;
    sendRef.current = send;
    stopRef.current = stop;
  });

  const micRef = React.useRef<MediaStream | null>(null);
  const ctxRef = React.useRef<AudioContext | null>(null);
  const micAnalyserRef = React.useRef<AnalyserNode | null>(null);
  const outAnalyserRef = React.useRef<AnalyserNode | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const loopbackRef = React.useRef<Loopback | null>(null);
  const sourceRef = React.useRef<AudioBufferSourceNode | null>(null);
  const recordingRef = React.useRef<Recording | null>(null);
  const prerollRef = React.useRef<Recording[]>([]);
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const levelRef = React.useRef(0);

  const vad = React.useRef({
    floor: 0.01,
    activeMs: 0,
    silenceMs: 0,
    speakingSince: 0,
    listeningSince: 0,
  });

  const sentenceQueueRef = React.useRef<Sentence[]>([]);
  const playingRef = React.useRef(false);
  const answerStartRef = React.useRef(0);
  const awaitingRef = React.useRef(false);
  const startedRef = React.useRef(false);
  const doneRef = React.useRef(false);
  const splitterRef = React.useRef(new SentenceSplitter());
  const speakAbortRef = React.useRef<AbortController | null>(null);
  const fetchAbortRef = React.useRef<AbortController | null>(null);
  const pausedRef = React.useRef(false);
  const currentSentenceRef = React.useRef<Sentence | null>(null);
  const interruptedSentenceRef = React.useRef<Sentence | null>(null);
  const recentRef = React.useRef<string[]>([]);
  const quietUntilRef = React.useRef(0);
  const echoCheckUntilRef = React.useRef(0);

  const setPhase = React.useCallback((p: CallPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const stopPreroll = React.useCallback(() => {
    prerollRef.current.forEach(discardRecording);
    prerollRef.current = [];
  }, []);

  const startRecorder = React.useCallback(() => {
    const mic = micRef.current;
    if (!mic) return;
    discardRecording(recordingRef.current);
    recordingRef.current = startRecordingFor(mic);
    vad.current.listeningSince = performance.now();
  }, []);

  const stopRecorder = React.useCallback((): Promise<Blob | null> => {
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (!recording || recording.rec.state === "inactive") {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      recording.rec.onstop = () =>
        resolve(
          new Blob(recording.chunks, {
            type: recording.rec.mimeType || "audio/webm",
          }),
        );
      recording.rec.stop();
    });
  }, []);

  const rotatePreroll = React.useCallback(() => {
    const mic = micRef.current;
    if (!mic || mutedRef.current) return;
    const list = prerollRef.current;
    const newest = list.at(-1);
    if (newest && performance.now() - newest.since < PREROLL_INTERVAL_MS) return;
    list.push(startRecordingFor(mic));
    while (list.length > 2) discardRecording(list.shift());
  }, []);

  const listen = React.useCallback(() => {
    stopPreroll();
    awaitingRef.current = false;
    vad.current.activeMs = 0;
    vad.current.silenceMs = 0;
    setPhase("listening");
    if (!mutedRef.current) startRecorder();
  }, [startRecorder, setPhase, stopPreroll]);

  const holeAudio = React.useCallback(
    async (text: string, signal: AbortSignal): Promise<Blob | null> => {
      try {
        const response = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            voice: voiceRef.current ?? undefined,
            rate: TEMPO,
          }),
          signal,
        });
        if (!response.ok) return null;
        const blob = await response.blob();
        return blob.size > 0 ? blob : null;
      } catch {
        return null;
      }
    },
    [],
  );

  const prefetch = React.useCallback(() => {
    const controller = fetchAbortRef.current;
    if (!controller) return;
    sentenceQueueRef.current.slice(0, PREFETCH_COUNT).forEach((sentence) => {
      if (!sentence.audio) {
        sentence.audio = holeAudio(sentence.text, controller.signal).then((blob) => {
          sentence.blob = blob;
          return blob;
        });
      }
    });
  }, [holeAudio]);

  const playBlob = React.useCallback(
    async (blob: Blob, signal: AbortSignal): Promise<boolean> => {
      const ctx = ctxRef.current;
      const target = outAnalyserRef.current;
      if (!ctx || !target || signal.aborted) return true;

      let buffer: AudioBuffer;
      try {
        buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      } catch {
        return false;
      }
      if (signal.aborted) return true;

      await new Promise<void>((resolve) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(target);
        sourceRef.current = source;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", cancel);
          if (sourceRef.current === source) sourceRef.current = null;
          resolve();
        };
        const cancel = () => {
          try {
            source.stop();
          } catch {
          }
          finish();
        };
        source.onended = () => setTimeout(finish, TAIL_MS);
        signal.addEventListener("abort", cancel);
        source.start();
      });
      return true;
    },
    [],
  );

  const speakInBrowser = React.useCallback(
    (text: string, signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) {
          return resolve();
        }
        const synth = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance(text);
        const language = document.documentElement.lang || navigator.language;
        utterance.lang = language;
        utterance.rate = 1.1;
        const voices = synth
          .getVoices()
          .filter((v) => v.lang.startsWith(language.slice(0, 2)));
        utterance.voice =
          voices.find((v) => /natural|neural|premium|enhanced/i.test(v.name)) ??
          voices.find((v) => /google/i.test(v.name)) ??
          voices[0] ??
          null;
        const finish = () => {
          signal.removeEventListener("abort", cancel);
          resolve();
        };
        const cancel = () => {
          synth.cancel();
          finish();
        };
        utterance.onend = finish;
        utterance.onerror = finish;
        signal.addEventListener("abort", cancel);
        synth.speak(utterance);
      }),
    [],
  );

  const speechFinished = React.useCallback(() => {
    if (pausedRef.current) return;
    if (!doneRef.current || playingRef.current) return;
    if (sentenceQueueRef.current.length > 0) return;
    if (phaseRef.current === "speaking" || phaseRef.current === "thinking") {
      setSpokenText(null);
      const now = performance.now();
      quietUntilRef.current = now + QUIET_AFTER_SPEAKING_MS;
      echoCheckUntilRef.current = now + ECHO_WINDOW_MS;
      listen();
    }
  }, [listen]);

  const playQueue = React.useCallback(async () => {
    if (playingRef.current || pausedRef.current) return;
    const controller = speakAbortRef.current;
    const load = fetchAbortRef.current;
    if (!controller || !load) return;
    playingRef.current = true;

    while (sentenceQueueRef.current.length > 0 && !controller.signal.aborted) {
      prefetch();
      const sentence = sentenceQueueRef.current.shift()!;
      prefetch();
      currentSentenceRef.current = sentence;
      recentRef.current = [...recentRef.current.slice(-2), sentence.text];
      if (phaseRef.current !== "speaking") setPhase("speaking");
      setSpokenText(sentence.text);

      const blob =
        sentence.blob !== undefined
          ? sentence.blob
          : await (sentence.audio ?? holeAudio(sentence.text, load.signal));
      if (controller.signal.aborted) break;
      const played = blob ? await playBlob(blob, controller.signal) : false;
      if (!played && !controller.signal.aborted) {
        await speakInBrowser(sentence.text, controller.signal);
      }
      if (!controller.signal.aborted) currentSentenceRef.current = null;
    }

    playingRef.current = false;
    speechFinished();
  }, [holeAudio, setPhase, playBlob, speakInBrowser, prefetch, speechFinished]);

  const cancelSpeech = React.useCallback(() => {
    speakAbortRef.current?.abort();
    speakAbortRef.current = null;
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = null;
    sentenceQueueRef.current = [];
    pausedRef.current = false;
    currentSentenceRef.current = null;
    interruptedSentenceRef.current = null;
    try {
      sourceRef.current?.stop();
    } catch {
    }
    sourceRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpokenText(null);
  }, []);

  const pause = React.useCallback(() => {
    pausedRef.current = true;
    interruptedSentenceRef.current = currentSentenceRef.current;
    speakAbortRef.current?.abort();
    speakAbortRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  React.useEffect(() => {
    if (!awaitingRef.current) return;
    if (isStreaming) startedRef.current = true;
    if (!startedRef.current) return;

    const response = messages
      .slice(answerStartRef.current)
      .filter((m) => m.role === "assistant")
      .map((m) => stripToolScaffolding(m.content))
      .join("\n\n");

    const splitter = splitterRef.current;
    const newSentences = isStreaming ? splitter.push(response) : splitter.flush(response);
    if (newSentences.length > 0) {
      sentenceQueueRef.current.push(
        ...newSentences.map((text) => ({ text, audio: null })),
      );
      void playQueue();
    }

    if (!isStreaming) {
      doneRef.current = true;
      awaitingRef.current = false;
      if (!response.trim()) setError("No answer came back — just ask again.");
      speechFinished();
    }
  }, [messages, isStreaming, playQueue, speechFinished]);

  const resume = React.useCallback(() => {
    pausedRef.current = false;
    const sentence = interruptedSentenceRef.current;
    interruptedSentenceRef.current = null;
    if (sentence) sentenceQueueRef.current.unshift(sentence);
    speakAbortRef.current = new AbortController();
    stopPreroll();
    vad.current.activeMs = 0;
    vad.current.silenceMs = 0;
    if (sentenceQueueRef.current.length > 0) {
      setPhase("speaking");
      void playQueue();
    } else if (doneRef.current) {
      setSpokenText(null);
      listen();
    } else {
      setPhase("thinking");
    }
  }, [setPhase, playQueue, stopPreroll, listen]);

  const finishUtterance = React.useCallback(async () => {
    const wasInterruption = pausedRef.current;
    const inEchoWindow = vad.current.speakingSince < echoCheckUntilRef.current;
    setPhase("transcribing");
    const duration = performance.now() - vad.current.speakingSince;
    vad.current.activeMs = 0;
    vad.current.silenceMs = 0;
    const blob = await stopRecorder();
    if (!blob || duration < MIN_UTTERANCE_MS || blob.size < 1_000) {
      if (wasInterruption) resume();
      else listen();
      return;
    }

    let text = "";
    try {
      const form = new FormData();
      form.append("file", blob, "call.webm");
      if (transcriberRef.current) form.append("model", transcriberRef.current);
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      if (response.ok) {
        text = (((await response.json()) as { text?: string }).text ?? "").trim();
      } else {
        setError("Transcription failed — say it again.");
      }
    } catch {
      setError("Transcription failed — say it again.");
    }

    if (phaseRef.current !== "transcribing") return;

    const echo =
      (wasInterruption || inEchoWindow) && isEcho(text, recentRef.current);
    if (echo) {
      bargeInAllowedRef.current = false;
      setBargeInSetting(false);
      setEchoNotice(true);
    }

    if (wasInterruption) {
      if (echo || !isRealUtterance(text)) {
        resume();
        return;
      }
      cancelSpeech();
      doneRef.current = false;
      awaitingRef.current = false;
      if (streamingRef.current) stopRef.current();
    } else if (echo || !isRealUtterance(text)) {
      listen();
      return;
    }

    for (let i = 0; i < 60 && streamingRef.current; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }

    setError(null);
    setLastSaid(text);
    answerStartRef.current = messagesRef.current.length;
    splitterRef.current = new SentenceSplitter();
    sentenceQueueRef.current = [];
    recentRef.current = [];
    speakAbortRef.current = new AbortController();
    fetchAbortRef.current = new AbortController();
    startedRef.current = false;
    doneRef.current = false;
    awaitingRef.current = true;
    setPhase("thinking");
    sendRef.current(text);
  }, [
    resume,
    stopRecorder,
    setBargeInSetting,
    setPhase,
    cancelSpeech,
    listen,
  ]);

  const interrupt = React.useCallback(() => {
    cancelSpeech();
    doneRef.current = false;
    if (streamingRef.current) stopRef.current();
    listen();
  }, [cancelSpeech, listen]);

  const onBargeIn = React.useCallback(() => {
    pause();
    vad.current.silenceMs = 0;
    vad.current.speakingSince = performance.now();
    setPhase("hearing");
    const preroll = prerollRef.current.shift();
    stopPreroll();
    if (preroll && preroll.rec.state !== "inactive") {
      discardRecording(recordingRef.current);
      recordingRef.current = preroll;
    } else {
      startRecorder();
    }
  }, [pause, startRecorder, setPhase, stopPreroll]);

  const tick = React.useCallback(() => {
    const buffer = new Float32Array(1024);
    const v = vad.current;
    const mic = rmsLevel(micAnalyserRef.current, buffer);
    const p = phaseRef.current;

    levelRef.current = Math.min(
      1,
      (p === "speaking" ? rmsLevel(outAnalyserRef.current, buffer) : mic) * 8,
    );

    if (mutedRef.current || p === "transcribing" || p === "connecting") return;

    const isBargeInPhase = p === "speaking" || p === "thinking";
    if (isBargeInPhase && !bargeInAllowedRef.current) return;

    const now = performance.now();
    if (p === "listening" && now < quietUntilRef.current) {
      v.activeMs = 0;
      return;
    }

    const basis = Math.max(MIN_THRESHOLD, v.floor * 2.6);
    const threshold = isBargeInPhase
      ? Math.max(MIN_BARGE_IN_THRESHOLD, basis * 2.2)
      : basis;

    if (mic > threshold) {
      v.activeMs += TICK_MS;
      v.silenceMs = 0;
    } else {
      v.silenceMs += TICK_MS;
      v.activeMs = Math.max(0, v.activeMs - TICK_MS / 2);
      if (p === "listening") v.floor = v.floor * 0.97 + mic * 0.03;
    }

    if (isBargeInPhase) rotatePreroll();
    if (p === "listening") {
      if (v.activeMs >= ONSET_MS) {
        v.speakingSince = now - v.activeMs;
        v.silenceMs = 0;
        setPhase("hearing");
      } else if (now - v.listeningSince > RESTART_WITHOUT_SPEECH_MS) {
        startRecorder();
      }
    } else if (p === "hearing") {
      if (v.silenceMs >= PAUSE_MS || now - v.speakingSince > MAX_UTTERANCE_MS) {
        void finishUtterance();
      }
    } else if (isBargeInPhase && v.activeMs >= BARGE_IN_MS) {
      onBargeIn();
    }
  }, [finishUtterance, onBargeIn, startRecorder, setPhase, rotatePreroll]);

  const cleanup = React.useCallback(() => {
    if (tickRef.current !== null) clearInterval(tickRef.current);
    tickRef.current = null;
    cancelSpeech();
    discardRecording(recordingRef.current);
    recordingRef.current = null;
    stopPreroll();
    loopbackRef.current?.a.close();
    loopbackRef.current?.b.close();
    loopbackRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    micRef.current?.getTracks().forEach((trail) => trail.stop());
    micRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    micAnalyserRef.current = null;
    outAnalyserRef.current = null;
    audioRef.current = null;
    awaitingRef.current = false;
    levelRef.current = 0;
  }, [stopPreroll, cancelSpeech]);

  React.useEffect(() => cleanup, [cleanup]);

  const startCall = React.useCallback(async () => {
    if (phaseRef.current !== "ready" && phaseRef.current !== "error") return;
    setError(null);
    setPhase("connecting");

    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    void ctx.resume();
    ctxRef.current = ctx;

    const outAnalyser = ctx.createAnalyser();
    outAnalyser.fftSize = 1024;
    const target = ctx.createMediaStreamDestination();
    outAnalyser.connect(target);
    outAnalyserRef.current = outAnalyser;
    const el = new Audio();
    el.autoplay = true;
    el.srcObject = target.stream;
    void el.play().catch(() => {});
    audioRef.current = el;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    }

    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      cleanup();
      setError("No microphone access. Allow it in the browser and try again.");
      setPhase("error");
      return;
    }
    micRef.current = mic;

    const micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 1024;
    ctx.createMediaStreamSource(mic).connect(micAnalyser);
    micAnalyserRef.current = micAnalyser;

    const loopback = await buildLoopback(target.stream);
    if (loopback && audioRef.current === el) {
      loopbackRef.current = loopback;
      el.srcObject = loopback.stream;
      void el.play().catch(() => {});
    }

    vad.current = { floor: 0.01, activeMs: 0, silenceMs: 0, speakingSince: 0, listeningSince: 0 };
    tickRef.current = setInterval(tick, TICK_MS);
    listen();
  }, [cleanup, setPhase, tick, listen]);

  const hangUp = React.useCallback(() => {
    cleanup();
    setPhase("ready");
    setLastSaid(null);
    setSpokenText(null);
    setError(null);
  }, [cleanup, setPhase]);

  const setMuted = React.useCallback(
    (value: boolean) => {
      mutedRef.current = value;
      setMutedState(value);
      micRef.current?.getAudioTracks().forEach((trail) => {
        trail.enabled = !value;
      });
      if (value && phaseRef.current === "hearing") {
        void stopRecorder();
        listen();
      } else if (!value && phaseRef.current === "listening") {
        startRecorder();
      }
    },
    [startRecorder, stopRecorder, listen],
  );

  return {
    phase,
    error,
    muted,
    setMuted,
    lastSaid,
    spokenText,
    levelRef,
    startCall,
    hangUp,
    interrupt,
    echoNotice,
    bargeInAllowed,
    setBargeInAllowed: (value: boolean) => {
      bargeInAllowedRef.current = value;
      setBargeInSetting(value);
      if (value) setEchoNotice(false);
    },
    loopbackActive: () => loopbackRef.current !== null,
    available: status.data?.available ?? false,
    reason: status.data?.available === false ? (status.data.reason ?? null) : null,
  };
}
