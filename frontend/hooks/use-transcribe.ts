"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { useSettings } from "@/lib/settings/store";

export type RecordingState = "idle" | "recording" | "transcribing";

function bestMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

type Status = { available: boolean; reason?: string | null };

export function useTranscribeStatus() {
  const model = useSettings((settings) => settings.transcribeModel);
  return useQuery<Status>({
    queryKey: ["transcribe", "status", model],
    queryFn: async () => {
      const query = model ? `?model=${encodeURIComponent(model)}` : "";
      const response = await fetch(`/api/transcribe${query}`, {
        cache: "no-store",
      });
      return (await response.json()) as Status;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useTranscribe(onText: (text: string) => void) {
  const model = useSettings((settings) => settings.transcribeModel);
  const [state, setZustand] = React.useState<RecordingState>("idle");
  const [ms, setMs] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [analyser, setAnalyser] = React.useState<AnalyserNode | null>(null);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const startRef = React.useRef(0);
  const clockRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRef = React.useRef(false);

  const status = useTranscribeStatus();

  const cleanup = React.useCallback(() => {
    if (clockRef.current !== null) {
      clearInterval(clockRef.current);
      clockRef.current = null;
    }
    streamRef.current?.getTracks().forEach((trail) => trail.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setAnalyser(null);
    recorderRef.current = null;
  }, []);

  React.useEffect(() => cleanup, [cleanup]);

  const upload = React.useCallback(
    async (blob: Blob) => {
      setZustand("transcribing");
      try {
        const form = new FormData();
        form.append("file", blob, "recording.webm");
        if (model) form.append("model", model);

        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
        });

        if (!response.ok) {
          let statusMessage = `HTTP ${response.status}`;
          try {
            const payload = await response.json();
            statusMessage = payload?.error?.message ?? statusMessage;
          } catch {
          }
          throw new Error(statusMessage);
        }

        const payload = (await response.json()) as { text?: string };
        const text = (payload.text ?? "").trim();
        if (text) onText(text);
        else setError("Nothing was said.");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Transcription failed.",
        );
      } finally {
        setZustand("idle");
        setMs(0);
      }
    },
    [model, onText],
  );

  const start = React.useCallback(async () => {
    if (state !== "idle") return;
    setError(null);
    discardRef.current = false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      setError("No microphone access.");
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const node = ctx.createAnalyser();
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.7;
      ctx.createMediaStreamSource(stream).connect(node);
      setAnalyser(node);
    } catch {
    }

    const type = bestMimeType();
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : {});
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const chunks = chunksRef.current;
      chunksRef.current = [];
      cleanup();

      if (discardRef.current) {
        setZustand("idle");
        setMs(0);
        return;
      }

      const blob = new Blob(chunks, { type: type || "audio/webm" });
      if (blob.size < 1200) {
        setZustand("idle");
        setMs(0);
        return;
      }
      void upload(blob);
    };

    recorder.start();
    startRef.current = performance.now();
    setMs(0);
    setZustand("recording");
    clockRef.current = setInterval(
      () => setMs(performance.now() - startRef.current),
      200,
    );
  }, [cleanup, upload, state]);

  const end = React.useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const cancel = React.useCallback(() => {
    discardRef.current = true;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    } else {
      cleanup();
      setZustand("idle");
      setMs(0);
    }
  }, [cleanup]);

  return {
    state,
    ms,
    error,
    analyser,
    available: status.data?.available ?? false,
    start,
    end,
    cancel,
    clearError: () => setError(null),
  };
}
