"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { useSettings } from "@/lib/settings/store";

export type Aufnahmezustand = "idle" | "recording" | "transcribing";

function besterTyp(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const kandidaten = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return kandidaten.find((typ) => MediaRecorder.isTypeSupported(typ));
}

type Status = { available: boolean; reason?: string | null };

export function useTranscribe(onText: (text: string) => void) {
  const modell = useSettings((einstellungen) => einstellungen.transcribeModel);
  const [zustand, setZustand] = React.useState<Aufnahmezustand>("idle");
  const [ms, setMs] = React.useState(0);
  const [fehler, setFehler] = React.useState<string | null>(null);
  const [analyser, setAnalyser] = React.useState<AnalyserNode | null>(null);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const stueckeRef = React.useRef<Blob[]>([]);
  const startRef = React.useRef(0);
  const uhrRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const verwerfenRef = React.useRef(false);

  const status = useQuery<Status>({
    queryKey: ["transcribe", "status", modell],
    queryFn: async () => {
      const abfrage = modell ? `?model=${encodeURIComponent(modell)}` : "";
      const antwort = await fetch(`/api/transcribe${abfrage}`, {
        cache: "no-store",
      });
      return (await antwort.json()) as Status;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const aufraeumen = React.useCallback(() => {
    if (uhrRef.current !== null) {
      clearInterval(uhrRef.current);
      uhrRef.current = null;
    }
    streamRef.current?.getTracks().forEach((spur) => spur.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setAnalyser(null);
    recorderRef.current = null;
  }, []);

  React.useEffect(() => aufraeumen, [aufraeumen]);

  const hochladen = React.useCallback(
    async (blob: Blob) => {
      setZustand("transcribing");
      try {
        const form = new FormData();
        form.append("file", blob, "recording.webm");
        if (modell) form.append("model", modell);

        const antwort = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
        });

        if (!antwort.ok) {
          let meldung = `HTTP ${antwort.status}`;
          try {
            const nutzlast = await antwort.json();
            meldung = nutzlast?.error?.message ?? meldung;
          } catch {
          }
          throw new Error(meldung);
        }

        const nutzlast = (await antwort.json()) as { text?: string };
        const text = (nutzlast.text ?? "").trim();
        if (text) onText(text);
        else setFehler("Nothing was said.");
      } catch (ausnahme) {
        setFehler(
          ausnahme instanceof Error ? ausnahme.message : "Transcription failed.",
        );
      } finally {
        setZustand("idle");
        setMs(0);
      }
    },
    [modell, onText],
  );

  const starten = React.useCallback(async () => {
    if (zustand !== "idle") return;
    setFehler(null);
    verwerfenRef.current = false;

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
      setFehler("No microphone access.");
      return;
    }

    streamRef.current = stream;
    stueckeRef.current = [];

    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const knoten = ctx.createAnalyser();
      knoten.fftSize = 256;
      knoten.smoothingTimeConstant = 0.7;
      ctx.createMediaStreamSource(stream).connect(knoten);
      setAnalyser(knoten);
    } catch {
    }

    const typ = besterTyp();
    const recorder = new MediaRecorder(stream, typ ? { mimeType: typ } : {});
    recorderRef.current = recorder;

    recorder.ondataavailable = (ereignis) => {
      if (ereignis.data.size > 0) stueckeRef.current.push(ereignis.data);
    };

    recorder.onstop = () => {
      const stuecke = stueckeRef.current;
      stueckeRef.current = [];
      aufraeumen();

      if (verwerfenRef.current) {
        setZustand("idle");
        setMs(0);
        return;
      }

      const blob = new Blob(stuecke, { type: typ || "audio/webm" });
      if (blob.size < 1200) {
        setZustand("idle");
        setMs(0);
        return;
      }
      void hochladen(blob);
    };

    recorder.start();
    startRef.current = performance.now();
    setMs(0);
    setZustand("recording");
    uhrRef.current = setInterval(
      () => setMs(performance.now() - startRef.current),
      200,
    );
  }, [aufraeumen, hochladen, zustand]);

  const beenden = React.useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const abbrechen = React.useCallback(() => {
    verwerfenRef.current = true;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    } else {
      aufraeumen();
      setZustand("idle");
      setMs(0);
    }
  }, [aufraeumen]);

  return {
    zustand,
    ms,
    fehler,
    analyser,
    verfuegbar: status.data?.available ?? false,
    starten,
    beenden,
    abbrechen,
    fehlerWeg: () => setFehler(null),
  };
}
