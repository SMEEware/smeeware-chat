"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { stripToolScaffolding } from "@/lib/chat/sanitize";
import type { ChatMessage } from "@/lib/chat/types";
import { useSettings } from "@/lib/settings/store";
import { SatzSchneider, istEchteAussage } from "@/lib/voice/sprache";

/**
 * Das Telefonat -- freihaendig mit dem Chat sprechen.
 *
 * Ein Kreislauf: zuhoeren, bis jemand spricht; aufnehmen, bis er eine Weile
 * schweigt; mit dem in den Einstellungen gewaehlten Transkribierer zu Text
 * machen; als Frage in den Chat schicken; die Antwort Satz fuer Satz
 * vorlesen, waehrend sie noch entsteht; dann wieder zuhoeren.
 *
 * Wer dazwischenredet, waehrend die Stimme spricht oder das Modell noch
 * nachdenkt, unterbricht: die Stimme verstummt, die Antwort wird gestoppt,
 * und das Gesagte wird die naechste Frage.
 *
 * Die Stimme kommt vom Backend (neuronal, gratis, ohne Kontingent); faellt
 * sie aus, spricht der Browser mit seiner eigenen weiter.
 */

export type CallPhase =
  | "ready"
  | "connecting"
  | "listening"
  | "hearing"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";

type Optionen = {
  messages: ChatMessage[];
  isStreaming: boolean;
  send: (text: string) => void;
  stop: () => void;
};

/** Ab wann ein Pegel als Sprache gilt -- nie unter diesem Boden. */
const MIN_SCHWELLE = 0.012;
/** Waehrend die Stimme spricht, muss man deutlicher reden, um zu
 *  unterbrechen -- sonst unterbraeche sich die Stimme ueber ihr eigenes Echo. */
const MIN_SCHWELLE_UNTERBRECHEN = 0.05;
const TAKT_MS = 50;
const EINSATZ_MS = 150;
const UNTERBRECHEN_MS = 350;
const PAUSE_MS = 900;
const MIN_AUSSAGE_MS = 350;
const MAX_AUSSAGE_MS = 90_000;
const NEUSTART_OHNE_SPRACHE_MS = 25_000;
/** Waehrend die Stimme spricht, laeuft alle so viele ms eine neue
 *  Vorlauf-Aufnahme an -- damit ein Dazwischenreden ab seinem ersten Wort
 *  im Kasten ist, nicht erst ab dem Moment, in dem es erkannt wurde. */
const VORLAUF_TAKT_MS = 1_500;
/** So viele Saetze werden vorab erzeugt, waehrend einer spricht. */
const VORLAUF = 3;
/** Am Telefon wirkt ein Hauch schneller lebendiger als das Vorlese-Tempo. */
const TEMPO = 5;

function besterTyp(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ].find((typ) => MediaRecorder.isTypeSupported(typ));
}

function pegel(analyser: AnalyserNode | null, puffer: Float32Array<ArrayBuffer>): number {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(puffer);
  let summe = 0;
  for (let i = 0; i < puffer.length; i++) summe += puffer[i] * puffer[i];
  return Math.sqrt(summe / puffer.length);
}

type Satz = { text: string; audio: Promise<Blob | null> | null };

type Aufnahme = { rec: MediaRecorder; stuecke: Blob[]; seit: number };

function aufnahmeStarten(mic: MediaStream): Aufnahme {
  const typ = besterTyp();
  const rec = new MediaRecorder(mic, typ ? { mimeType: typ } : undefined);
  const aufnahme: Aufnahme = { rec, stuecke: [], seit: performance.now() };
  rec.ondataavailable = (event) => {
    if (event.data.size > 0) aufnahme.stuecke.push(event.data);
  };
  rec.start();
  return aufnahme;
}

function aufnahmeVerwerfen(aufnahme: Aufnahme | null | undefined): void {
  if (!aufnahme || aufnahme.rec.state === "inactive") return;
  aufnahme.rec.ondataavailable = null;
  aufnahme.rec.onstop = null;
  aufnahme.rec.stop();
}

export function useVoiceCall({ messages, isStreaming, send, stop }: Optionen) {
  const transkribierer = useSettings((z) => z.transcribeModel);
  const stimme = useSettings((z) => z.callVoice);

  const [phase, setPhaseState] = React.useState<CallPhase>("ready");
  const [fehler, setFehler] = React.useState<string | null>(null);
  const [stumm, setStummState] = React.useState(false);
  const [gesagt, setGesagt] = React.useState<string | null>(null);
  const [gesprochen, setGesprochen] = React.useState<string | null>(null);

  // Transkription muss gehen, sonst ist das Telefonat taub.
  const status = useQuery<{ available: boolean; reason?: string | null }>({
    queryKey: ["transcribe", "status", transkribierer],
    queryFn: async () => {
      const abfrage = transkribierer
        ? `?model=${encodeURIComponent(transkribierer)}`
        : "";
      const antwort = await fetch(`/api/transcribe${abfrage}`, {
        cache: "no-store",
      });
      return (await antwort.json()) as { available: boolean };
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Alles, was die Takt-Schleife und die Rueckrufe lesen, steht in Refs --
  // sie laufen ausserhalb des Render-Zyklus.
  const phaseRef = React.useRef<CallPhase>("ready");
  const stummRef = React.useRef(false);
  const streamingRef = React.useRef(isStreaming);
  const messagesRef = React.useRef(messages);
  const stimmeRef = React.useRef(stimme);
  const transkribiererRef = React.useRef(transkribierer);
  const sendRef = React.useRef(send);
  const stopRef = React.useRef(stop);

  React.useEffect(() => {
    streamingRef.current = isStreaming;
    messagesRef.current = messages;
    stimmeRef.current = stimme;
    transkribiererRef.current = transkribierer;
    sendRef.current = send;
    stopRef.current = stop;
  });

  const micRef = React.useRef<MediaStream | null>(null);
  const ctxRef = React.useRef<AudioContext | null>(null);
  const micAnalyserRef = React.useRef<AnalyserNode | null>(null);
  const outAnalyserRef = React.useRef<AnalyserNode | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const aufnahmeRef = React.useRef<Aufnahme | null>(null);
  /** Die rollenden Vorlauf-Aufnahmen, aelteste zuerst. */
  const vorlaufRef = React.useRef<Aufnahme[]>([]);
  const taktRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  /** 0..1 -- fuer die Kugel. Wird im Takt geschrieben, nie gerendert. */
  const levelRef = React.useRef(0);

  const vad = React.useRef({
    boden: 0.01,
    aktivMs: 0,
    stilleMs: 0,
    sprichtSeit: 0,
    hoertSeit: 0,
  });

  // Vorlesen
  const satzSchlangeRef = React.useRef<Satz[]>([]);
  const spieltRef = React.useRef(false);
  const antwortAbRef = React.useRef(0);
  const wartetRef = React.useRef(false);
  const gestartetRef = React.useRef(false);
  const fertigRef = React.useRef(false);
  const schneiderRef = React.useRef(new SatzSchneider());
  const sprechAbbruchRef = React.useRef<AbortController | null>(null);

  const setPhase = React.useCallback((p: CallPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  // ---------------------------------------------------------------- //
  // Aufnahme                                                          //
  // ---------------------------------------------------------------- //

  const vorlaufBeenden = React.useCallback(() => {
    vorlaufRef.current.forEach(aufnahmeVerwerfen);
    vorlaufRef.current = [];
  }, []);

  const recorderStarten = React.useCallback(() => {
    const mic = micRef.current;
    if (!mic) return;
    aufnahmeVerwerfen(aufnahmeRef.current);
    aufnahmeRef.current = aufnahmeStarten(mic);
    vad.current.hoertSeit = performance.now();
  }, []);

  const recorderStoppen = React.useCallback((): Promise<Blob | null> => {
    const aufnahme = aufnahmeRef.current;
    aufnahmeRef.current = null;
    if (!aufnahme || aufnahme.rec.state === "inactive") {
      return Promise.resolve(null);
    }
    return new Promise((fertig) => {
      aufnahme.rec.onstop = () =>
        fertig(
          new Blob(aufnahme.stuecke, {
            type: aufnahme.rec.mimeType || "audio/webm",
          }),
        );
      aufnahme.rec.stop();
    });
  }, []);

  /** Waehrend "denkt" und "spricht": alle ``VORLAUF_TAKT_MS`` eine neue
   *  Aufnahme, hoechstens zwei zugleich. So liegt beim Dazwischenreden immer
   *  eine bereit, die 1,5 bis 3 Sekunden zurueckreicht. */
  const vorlaufDrehen = React.useCallback(() => {
    const mic = micRef.current;
    if (!mic || stummRef.current) return;
    const liste = vorlaufRef.current;
    const juengste = liste.at(-1);
    if (juengste && performance.now() - juengste.seit < VORLAUF_TAKT_MS) return;
    liste.push(aufnahmeStarten(mic));
    while (liste.length > 2) aufnahmeVerwerfen(liste.shift());
  }, []);

  const zuhoeren = React.useCallback(() => {
    vorlaufBeenden();
    wartetRef.current = false;
    vad.current.aktivMs = 0;
    vad.current.stilleMs = 0;
    setPhase("listening");
    if (!stummRef.current) recorderStarten();
  }, [recorderStarten, setPhase, vorlaufBeenden]);

  // ---------------------------------------------------------------- //
  // Vorlesen                                                          //
  // ---------------------------------------------------------------- //

  const holeAudio = React.useCallback(
    async (text: string, signal: AbortSignal): Promise<Blob | null> => {
      try {
        const antwort = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            voice: stimmeRef.current ?? undefined,
            rate: TEMPO,
          }),
          signal,
        });
        if (!antwort.ok) return null;
        const blob = await antwort.blob();
        return blob.size > 0 ? blob : null;
      } catch {
        return null;
      }
    },
    [],
  );

  const vorbereiten = React.useCallback(() => {
    const abbruch = sprechAbbruchRef.current;
    if (!abbruch) return;
    satzSchlangeRef.current.slice(0, VORLAUF).forEach((satz) => {
      if (!satz.audio) satz.audio = holeAudio(satz.text, abbruch.signal);
    });
  }, [holeAudio]);

  const spieleBlob = React.useCallback(
    (blob: Blob, signal: AbortSignal) =>
      new Promise<void>((fertig) => {
        const el = audioRef.current;
        if (!el || signal.aborted) return fertig();
        const url = URL.createObjectURL(blob);
        const schluss = () => {
          el.onended = null;
          el.onerror = null;
          signal.removeEventListener("abort", abbrechen);
          URL.revokeObjectURL(url);
          fertig();
        };
        const abbrechen = () => {
          el.pause();
          schluss();
        };
        el.onended = schluss;
        el.onerror = schluss;
        signal.addEventListener("abort", abbrechen);
        el.src = url;
        el.play().catch(schluss);
      }),
    [],
  );

  const sprichImBrowser = React.useCallback(
    (text: string, signal: AbortSignal) =>
      new Promise<void>((fertig) => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) {
          return fertig();
        }
        const synth = window.speechSynthesis;
        const aeusserung = new SpeechSynthesisUtterance(text);
        const sprache = document.documentElement.lang || navigator.language;
        aeusserung.lang = sprache;
        // Die beste Stimme, die der Browser hat: bevorzugt die neuronalen.
        const stimmen = synth
          .getVoices()
          .filter((v) => v.lang.startsWith(sprache.slice(0, 2)));
        aeusserung.voice =
          stimmen.find((v) => /natural|neural|premium|enhanced/i.test(v.name)) ??
          stimmen.find((v) => /google/i.test(v.name)) ??
          stimmen[0] ??
          null;
        const schluss = () => {
          signal.removeEventListener("abort", abbrechen);
          fertig();
        };
        const abbrechen = () => {
          synth.cancel();
          schluss();
        };
        aeusserung.onend = schluss;
        aeusserung.onerror = schluss;
        signal.addEventListener("abort", abbrechen);
        synth.speak(aeusserung);
      }),
    [],
  );

  const vorlesenBeendet = React.useCallback(() => {
    if (!fertigRef.current || spieltRef.current) return;
    if (satzSchlangeRef.current.length > 0) return;
    if (phaseRef.current === "speaking" || phaseRef.current === "thinking") {
      setGesprochen(null);
      zuhoeren();
    }
  }, [zuhoeren]);

  const spielen = React.useCallback(async () => {
    if (spieltRef.current) return;
    const abbruch = sprechAbbruchRef.current;
    if (!abbruch) return;
    spieltRef.current = true;

    while (satzSchlangeRef.current.length > 0 && !abbruch.signal.aborted) {
      vorbereiten();
      const satz = satzSchlangeRef.current.shift()!;
      vorbereiten();
      if (phaseRef.current !== "speaking") setPhase("speaking");
      setGesprochen(satz.text);

      const blob = await (satz.audio ?? holeAudio(satz.text, abbruch.signal));
      if (abbruch.signal.aborted) break;
      if (blob) await spieleBlob(blob, abbruch.signal);
      else await sprichImBrowser(satz.text, abbruch.signal);
    }

    spieltRef.current = false;
    vorlesenBeendet();
  }, [holeAudio, setPhase, spieleBlob, sprichImBrowser, vorbereiten, vorlesenBeendet]);

  const vorlesenAbbrechen = React.useCallback(() => {
    sprechAbbruchRef.current?.abort();
    sprechAbbruchRef.current = null;
    satzSchlangeRef.current = [];
    audioRef.current?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setGesprochen(null);
  }, []);

  // Die wachsende Antwort in Saetze schneiden und einreihen.
  React.useEffect(() => {
    if (!wartetRef.current) return;
    if (isStreaming) gestartetRef.current = true;
    if (!gestartetRef.current) return;

    const antwort = messages
      .slice(antwortAbRef.current)
      .filter((m) => m.role === "assistant")
      .map((m) => stripToolScaffolding(m.content))
      .join("\n\n");

    const schneider = schneiderRef.current;
    const neue = isStreaming ? schneider.weiter(antwort) : schneider.ende(antwort);
    if (neue.length > 0) {
      satzSchlangeRef.current.push(
        ...neue.map((text) => ({ text, audio: null })),
      );
      void spielen();
    }

    if (!isStreaming) {
      fertigRef.current = true;
      wartetRef.current = false;
      if (!antwort.trim()) setFehler("No answer came back — just ask again.");
      vorlesenBeendet();
    }
  }, [messages, isStreaming, spielen, vorlesenBeendet]);

  // ---------------------------------------------------------------- //
  // Eine Aussage abschliessen                                         //
  // ---------------------------------------------------------------- //

  const aussageFertig = React.useCallback(async () => {
    setPhase("transcribing");
    const dauer = performance.now() - vad.current.sprichtSeit;
    // Die Zaehler der eben beendeten Aussage duerfen nicht in die naechste
    // Phase hinueberreichen: der Sprechzaehler ist nach einer langen Frage
    // noch hoch und saehe beim Wechsel zu "denkt" wie ein Dazwischenreden
    // aus -- der frische Turn wuerde sofort wieder abgebrochen.
    vad.current.aktivMs = 0;
    vad.current.stilleMs = 0;
    const blob = await recorderStoppen();
    if (!blob || dauer < MIN_AUSSAGE_MS || blob.size < 1_000) {
      zuhoeren();
      return;
    }

    let text = "";
    try {
      const form = new FormData();
      form.append("file", blob, "call.webm");
      if (transkribiererRef.current) form.append("model", transkribiererRef.current);
      const antwort = await fetch("/api/transcribe", { method: "POST", body: form });
      if (antwort.ok) {
        text = (((await antwort.json()) as { text?: string }).text ?? "").trim();
      } else {
        setFehler("Transcription failed — say it again.");
      }
    } catch {
      setFehler("Transcription failed — say it again.");
    }

    if (phaseRef.current !== "transcribing") return;
    if (!istEchteAussage(text)) {
      zuhoeren();
      return;
    }

    // Wurde gerade eine Antwort unterbrochen, ist sie womoeglich noch nicht
    // ganz beendet -- ohne dieses Warten wuerde die neue Frage als Einschub
    // in den sterbenden Turn geschoben und mit ihm verworfen.
    for (let i = 0; i < 60 && streamingRef.current; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }

    setFehler(null);
    setGesagt(text);
    antwortAbRef.current = messagesRef.current.length;
    schneiderRef.current = new SatzSchneider();
    satzSchlangeRef.current = [];
    sprechAbbruchRef.current = new AbortController();
    gestartetRef.current = false;
    fertigRef.current = false;
    wartetRef.current = true;
    setPhase("thinking");
    sendRef.current(text);
  }, [recorderStoppen, setPhase, zuhoeren]);

  /** Knopf oder Tipp auf die Kugel: verstummen und wieder zuhoeren. Ohne
   *  Vorlauf -- der enthielte nur das Echo der Stimme, nicht den Nutzer. */
  const unterbrechen = React.useCallback(() => {
    vorlesenAbbrechen();
    fertigRef.current = false;
    if (streamingRef.current) stopRef.current();
    zuhoeren();
  }, [vorlesenAbbrechen, zuhoeren]);

  /** Der Nutzer redet dazwischen: verstummen und ab seinem ersten Wort
   *  aufnehmen. */
  const dazwischenGeredet = React.useCallback(() => {
    vorlesenAbbrechen();
    wartetRef.current = false;
    fertigRef.current = false;
    if (streamingRef.current) stopRef.current();
    vad.current.stilleMs = 0;
    vad.current.sprichtSeit = performance.now();
    setPhase("hearing");
    // Die aelteste Vorlauf-Aufnahme wird zur Aufnahme der Unterbrechung: sie
    // reicht vor den Moment der Erkennung zurueck, das erste Wort ist also
    // drin. Nur ohne Vorlauf beginnt eine frische (dann fehlt der Anfang).
    const vorlauf = vorlaufRef.current.shift();
    vorlaufBeenden();
    if (vorlauf && vorlauf.rec.state !== "inactive") {
      aufnahmeVerwerfen(aufnahmeRef.current);
      aufnahmeRef.current = vorlauf;
    } else {
      recorderStarten();
    }
  }, [recorderStarten, setPhase, vorlaufBeenden, vorlesenAbbrechen]);

  // ---------------------------------------------------------------- //
  // Der Takt: Pegel messen, Sprache erkennen                          //
  // ---------------------------------------------------------------- //

  const takt = React.useCallback(() => {
    const puffer = new Float32Array(1024);
    const v = vad.current;
    const mic = pegel(micAnalyserRef.current, puffer);
    const p = phaseRef.current;

    levelRef.current = Math.min(
      1,
      (p === "speaking" ? pegel(outAnalyserRef.current, puffer) : mic) * 8,
    );

    if (stummRef.current || p === "transcribing" || p === "connecting") return;

    const basis = Math.max(MIN_SCHWELLE, v.boden * 2.6);
    const redetDazwischen = p === "speaking" || p === "thinking";
    const schwelle = redetDazwischen
      ? Math.max(MIN_SCHWELLE_UNTERBRECHEN, basis * 2.2)
      : basis;

    if (mic > schwelle) {
      v.aktivMs += TAKT_MS;
      v.stilleMs = 0;
    } else {
      v.stilleMs += TAKT_MS;
      v.aktivMs = Math.max(0, v.aktivMs - TAKT_MS / 2);
      // Der Grundpegel lernt nur in der Stille -- so passt sich die
      // Erkennung an Luefter und Strassenlaerm an.
      if (p === "listening") v.boden = v.boden * 0.97 + mic * 0.03;
    }

    const jetzt = performance.now();
    if (redetDazwischen) vorlaufDrehen();
    if (p === "listening") {
      if (v.aktivMs >= EINSATZ_MS) {
        v.sprichtSeit = jetzt - v.aktivMs;
        v.stilleMs = 0;
        setPhase("hearing");
      } else if (jetzt - v.hoertSeit > NEUSTART_OHNE_SPRACHE_MS) {
        // Lange nichts gesagt: die Aufnahme neu beginnen, damit sie nicht
        // minutenlange Stille zum Transkribieren mitschleppt.
        recorderStarten();
      }
    } else if (p === "hearing") {
      if (v.stilleMs >= PAUSE_MS || jetzt - v.sprichtSeit > MAX_AUSSAGE_MS) {
        void aussageFertig();
      }
    } else if (redetDazwischen && v.aktivMs >= UNTERBRECHEN_MS) {
      dazwischenGeredet();
    }
  }, [aussageFertig, dazwischenGeredet, recorderStarten, setPhase, vorlaufDrehen]);

  // ---------------------------------------------------------------- //
  // Anrufen und auflegen                                              //
  // ---------------------------------------------------------------- //

  const aufraeumen = React.useCallback(() => {
    if (taktRef.current !== null) clearInterval(taktRef.current);
    taktRef.current = null;
    vorlesenAbbrechen();
    aufnahmeVerwerfen(aufnahmeRef.current);
    aufnahmeRef.current = null;
    vorlaufBeenden();
    micRef.current?.getTracks().forEach((spur) => spur.stop());
    micRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    micAnalyserRef.current = null;
    outAnalyserRef.current = null;
    audioRef.current = null;
    wartetRef.current = false;
    levelRef.current = 0;
  }, [vorlaufBeenden, vorlesenAbbrechen]);

  React.useEffect(() => aufraeumen, [aufraeumen]);

  /** Muss aus einem Klick heraus aufgerufen werden: nur dann duerfen
   *  Browser (vor allem iOS) Ton abspielen und das Mikrofon oeffnen. */
  const anrufen = React.useCallback(async () => {
    if (phaseRef.current !== "ready" && phaseRef.current !== "error") return;
    setFehler(null);
    setPhase("connecting");

    // Ton freischalten -- noch innerhalb der Klick-Geste.
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    void ctx.resume();
    ctxRef.current = ctx;
    const el = new Audio();
    el.preload = "auto";
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
      aufraeumen();
      setFehler("No microphone access. Allow it in the browser and try again.");
      setPhase("error");
      return;
    }
    micRef.current = mic;

    const micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 1024;
    ctx.createMediaStreamSource(mic).connect(micAnalyser);
    micAnalyserRef.current = micAnalyser;

    const outAnalyser = ctx.createAnalyser();
    outAnalyser.fftSize = 1024;
    const quelle = ctx.createMediaElementSource(el);
    quelle.connect(outAnalyser);
    outAnalyser.connect(ctx.destination);
    outAnalyserRef.current = outAnalyser;

    vad.current = { boden: 0.01, aktivMs: 0, stilleMs: 0, sprichtSeit: 0, hoertSeit: 0 };
    taktRef.current = setInterval(takt, TAKT_MS);
    zuhoeren();
  }, [aufraeumen, setPhase, takt, zuhoeren]);

  const auflegen = React.useCallback(() => {
    aufraeumen();
    setPhase("ready");
    setGesagt(null);
    setGesprochen(null);
    setFehler(null);
  }, [aufraeumen, setPhase]);

  const setStumm = React.useCallback(
    (wert: boolean) => {
      stummRef.current = wert;
      setStummState(wert);
      micRef.current?.getAudioTracks().forEach((spur) => {
        spur.enabled = !wert;
      });
      if (wert && phaseRef.current === "hearing") {
        void recorderStoppen();
        zuhoeren();
      } else if (!wert && phaseRef.current === "listening") {
        recorderStarten();
      }
    },
    [recorderStarten, recorderStoppen, zuhoeren],
  );

  return {
    phase,
    fehler,
    stumm,
    setStumm,
    gesagt,
    gesprochen,
    levelRef,
    anrufen,
    auflegen,
    unterbrechen,
    verfuegbar: status.data?.available ?? false,
    grund: status.data?.available === false ? (status.data.reason ?? null) : null,
  };
}
