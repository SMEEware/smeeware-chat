"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { stripToolScaffolding } from "@/lib/chat/sanitize";
import type { ChatMessage } from "@/lib/chat/types";
import { useSettings } from "@/lib/settings/store";
import { SatzSchneider, istEcho, istEchteAussage } from "@/lib/voice/sprache";

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
const TEMPO = 12;
/** Nach dem Ende eines Satzes spielt die WebRTC-Schleife noch kurz nach
 *  (Jitter-Puffer) -- so lange gilt der Satz als nicht vorbei. */
const NACHLAUF_MS = 150;
/** Direkt nach dem Sprechen hallt die Stimme noch nach: so lange zaehlt
 *  nichts als Einsatz ... */
const RUHE_NACH_SPRECHEN_MS = 400;
/** ... und was in diesem Fenster beginnt, wird auf Echo geprueft. */
const ECHO_FENSTER_MS = 2_500;

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

type Satz = {
  text: string;
  audio: Promise<Blob | null> | null;
  /** Schon geladen -- ueberlebt eine Pause fuers Dazwischenreden. */
  blob?: Blob | null;
};

type Schleife = { a: RTCPeerConnection; b: RTCPeerConnection; stream: MediaStream };

/**
 * Die Stimme ueber eine WebRTC-Verbindung mit sich selbst schicken.
 *
 * Das ist der Kern gegen das Selbst-Unterbrechen: die Echo-Unterdrueckung
 * des Browsers kann nur abziehen, was sie als Gespraechston kennt. Normales
 * Abspielen (Audio-Element, WebAudio) ist fuer sie "Medien" -- vor allem auf
 * Android landet es ungefiltert wieder im Mikrofon. Kommt dieselbe Stimme
 * als WebRTC-Gegenstelle herein, behandelt der Browser sie wie die Stimme in
 * einem Videocall und rechnet sie heraus. Die Verbindung verlaesst das Geraet
 * nie (zwei Enden in derselben Seite).
 */
async function schleifeBauen(quelle: MediaStream): Promise<Schleife | null> {
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
    const empfangen = new Promise<MediaStream>((ok) => {
      b.ontrack = (e) => ok(e.streams[0] ?? new MediaStream([e.track]));
    });
    quelle.getAudioTracks().forEach((spur) => a.addTrack(spur, quelle));
    const angebot = await a.createOffer();
    await a.setLocalDescription(angebot);
    await b.setRemoteDescription(angebot);
    const antwort = await b.createAnswer();
    await b.setLocalDescription(antwort);
    await a.setRemoteDescription(antwort);
    const stream = await Promise.race([
      empfangen,
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
  const dazwischenErlaubt = useSettings((z) => z.callBargeIn);
  const setDazwischenErlaubtEinstellung = useSettings((z) => z.setCallBargeIn);
  const [echoHinweis, setEchoHinweis] = React.useState(false);

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
  const dazwischenErlaubtRef = React.useRef(dazwischenErlaubt);

  React.useEffect(() => {
    dazwischenErlaubtRef.current = dazwischenErlaubt;
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
  /** Spielt aus, was die Schleife liefert (oder direkt, ohne Schleife). */
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const schleifeRef = React.useRef<Schleife | null>(null);
  const quelleRef = React.useRef<AudioBufferSourceNode | null>(null);
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
  /** Bricht das Abspielen ab (auch fuer eine Pause). */
  const sprechAbbruchRef = React.useRef<AbortController | null>(null);
  /** Bricht das Laden der Saetze ab -- nur wenn die Antwort wirklich weg ist. */
  const holAbbruchRef = React.useRef<AbortController | null>(null);
  /** Pause fuers Dazwischenreden: erst das Transkript entscheidet, ob es
   *  ein echter Einwurf war -- oder nur das eigene Echo. */
  const pausiertRef = React.useRef(false);
  const aktuellerSatzRef = React.useRef<Satz | null>(null);
  const unterbrochenerSatzRef = React.useRef<Satz | null>(null);
  /** Die zuletzt gesprochenen Saetze -- der Vergleich fuers Echo. */
  const zuletztRef = React.useRef<string[]>([]);
  /** Bis wann Einsaetze ignoriert bzw. auf Echo geprueft werden. */
  const ruheBisRef = React.useRef(0);
  const echoPruefenBisRef = React.useRef(0);

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
    const abbruch = holAbbruchRef.current;
    if (!abbruch) return;
    satzSchlangeRef.current.slice(0, VORLAUF).forEach((satz) => {
      if (!satz.audio) {
        satz.audio = holeAudio(satz.text, abbruch.signal).then((blob) => {
          satz.blob = blob;
          return blob;
        });
      }
    });
  }, [holeAudio]);

  /** Einen Satz abspielen -- dekodiert und durch die Schleife geschickt.
   *  false, wenn er sich nicht dekodieren liess (dann spricht der Browser). */
  const spieleBlob = React.useCallback(
    async (blob: Blob, signal: AbortSignal): Promise<boolean> => {
      const ctx = ctxRef.current;
      const ziel = outAnalyserRef.current;
      if (!ctx || !ziel || signal.aborted) return true;

      let puffer: AudioBuffer;
      try {
        puffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      } catch {
        return false;
      }
      if (signal.aborted) return true;

      await new Promise<void>((fertig) => {
        const quelle = ctx.createBufferSource();
        quelle.buffer = puffer;
        quelle.connect(ziel);
        quelleRef.current = quelle;
        let erledigt = false;
        const schluss = () => {
          if (erledigt) return;
          erledigt = true;
          signal.removeEventListener("abort", abbrechen);
          if (quelleRef.current === quelle) quelleRef.current = null;
          fertig();
        };
        const abbrechen = () => {
          try {
            quelle.stop();
          } catch {
            // schon gestoppt
          }
          schluss();
        };
        quelle.onended = () => setTimeout(schluss, NACHLAUF_MS);
        signal.addEventListener("abort", abbrechen);
        quelle.start();
      });
      return true;
    },
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
        aeusserung.rate = 1.1;
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
    if (pausiertRef.current) return;
    if (!fertigRef.current || spieltRef.current) return;
    if (satzSchlangeRef.current.length > 0) return;
    if (phaseRef.current === "speaking" || phaseRef.current === "thinking") {
      setGesprochen(null);
      // Der Nachhall der letzten Worte ist noch im Raum: kurz nichts als
      // Einsatz werten, und was danach gleich beginnt, auf Echo pruefen.
      const jetzt = performance.now();
      ruheBisRef.current = jetzt + RUHE_NACH_SPRECHEN_MS;
      echoPruefenBisRef.current = jetzt + ECHO_FENSTER_MS;
      zuhoeren();
    }
  }, [zuhoeren]);

  const spielen = React.useCallback(async () => {
    if (spieltRef.current || pausiertRef.current) return;
    const abbruch = sprechAbbruchRef.current;
    const holen = holAbbruchRef.current;
    if (!abbruch || !holen) return;
    spieltRef.current = true;

    while (satzSchlangeRef.current.length > 0 && !abbruch.signal.aborted) {
      vorbereiten();
      const satz = satzSchlangeRef.current.shift()!;
      vorbereiten();
      aktuellerSatzRef.current = satz;
      zuletztRef.current = [...zuletztRef.current.slice(-2), satz.text];
      if (phaseRef.current !== "speaking") setPhase("speaking");
      setGesprochen(satz.text);

      const blob =
        satz.blob !== undefined
          ? satz.blob
          : await (satz.audio ?? holeAudio(satz.text, holen.signal));
      if (abbruch.signal.aborted) break;
      const gespielt = blob ? await spieleBlob(blob, abbruch.signal) : false;
      if (!gespielt && !abbruch.signal.aborted) {
        await sprichImBrowser(satz.text, abbruch.signal);
      }
      if (!abbruch.signal.aborted) aktuellerSatzRef.current = null;
    }

    spieltRef.current = false;
    vorlesenBeendet();
  }, [holeAudio, setPhase, spieleBlob, sprichImBrowser, vorbereiten, vorlesenBeendet]);

  /** Die Antwort ist endgueltig weg: nichts mehr spielen, nichts mehr laden. */
  const vorlesenAbbrechen = React.useCallback(() => {
    sprechAbbruchRef.current?.abort();
    sprechAbbruchRef.current = null;
    holAbbruchRef.current?.abort();
    holAbbruchRef.current = null;
    satzSchlangeRef.current = [];
    pausiertRef.current = false;
    aktuellerSatzRef.current = null;
    unterbrochenerSatzRef.current = null;
    try {
      quelleRef.current?.stop();
    } catch {
      // schon gestoppt
    }
    quelleRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setGesprochen(null);
  }, []);

  /** Verstummen, aber nichts wegwerfen: die Schlange und der gerade
   *  unterbrochene Satz bleiben, bis das Transkript entschieden hat. */
  const pausieren = React.useCallback(() => {
    pausiertRef.current = true;
    unterbrochenerSatzRef.current = aktuellerSatzRef.current;
    sprechAbbruchRef.current?.abort();
    sprechAbbruchRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
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

  /** Falscher Alarm beim Dazwischenreden: dort weitersprechen, wo die
   *  Stimme stehen geblieben ist -- der unterbrochene Satz beginnt neu. */
  const fortsetzen = React.useCallback(() => {
    pausiertRef.current = false;
    const satz = unterbrochenerSatzRef.current;
    unterbrochenerSatzRef.current = null;
    if (satz) satzSchlangeRef.current.unshift(satz);
    sprechAbbruchRef.current = new AbortController();
    vorlaufBeenden();
    vad.current.aktivMs = 0;
    vad.current.stilleMs = 0;
    if (satzSchlangeRef.current.length > 0) {
      setPhase("speaking");
      void spielen();
    } else if (fertigRef.current) {
      setGesprochen(null);
      zuhoeren();
    } else {
      setPhase("thinking");
    }
  }, [setPhase, spielen, vorlaufBeenden, zuhoeren]);

  // ---------------------------------------------------------------- //
  // Eine Aussage abschliessen                                         //
  // ---------------------------------------------------------------- //

  const aussageFertig = React.useCallback(async () => {
    const warUnterbrechung = pausiertRef.current;
    const imEchoFenster = vad.current.sprichtSeit < echoPruefenBisRef.current;
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
      if (warUnterbrechung) fortsetzen();
      else zuhoeren();
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

    const echo =
      (warUnterbrechung || imEchoFenster) && istEcho(text, zuletztRef.current);
    if (echo) {
      // Die Stimme hat sich selbst gehoert -- dieses Geraet unterdrueckt das
      // Echo nicht. Ab jetzt nur noch per Tipp unterbrechen (und das fuer
      // dieses Geraet merken); gesprochen wird einfach weiter.
      dazwischenErlaubtRef.current = false;
      setDazwischenErlaubtEinstellung(false);
      setEchoHinweis(true);
    }

    if (warUnterbrechung) {
      if (echo || !istEchteAussage(text)) {
        fortsetzen();
        return;
      }
      // Ein echter Einwurf: erst jetzt die alte Antwort wirklich beenden.
      vorlesenAbbrechen();
      fertigRef.current = false;
      wartetRef.current = false;
      if (streamingRef.current) stopRef.current();
    } else if (echo || !istEchteAussage(text)) {
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
    zuletztRef.current = [];
    sprechAbbruchRef.current = new AbortController();
    holAbbruchRef.current = new AbortController();
    gestartetRef.current = false;
    fertigRef.current = false;
    wartetRef.current = true;
    setPhase("thinking");
    sendRef.current(text);
  }, [
    fortsetzen,
    recorderStoppen,
    setDazwischenErlaubtEinstellung,
    setPhase,
    vorlesenAbbrechen,
    zuhoeren,
  ]);

  /** Knopf oder Tipp auf die Kugel: verstummen und wieder zuhoeren. Ohne
   *  Vorlauf -- der enthielte nur das Echo der Stimme, nicht den Nutzer. */
  const unterbrechen = React.useCallback(() => {
    vorlesenAbbrechen();
    fertigRef.current = false;
    if (streamingRef.current) stopRef.current();
    zuhoeren();
  }, [vorlesenAbbrechen, zuhoeren]);

  /** Der Nutzer redet dazwischen -- oder das Echo tut so. Verstummen, ab dem
   *  ersten Wort aufnehmen, aber die Antwort noch nicht verwerfen: das
   *  entscheidet erst das Transkript (siehe ``aussageFertig``). */
  const dazwischenGeredet = React.useCallback(() => {
    pausieren();
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
  }, [pausieren, recorderStarten, setPhase, vorlaufBeenden]);

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

    const redetDazwischen = p === "speaking" || p === "thinking";
    // Halb-Duplex: waehrend die Stimme spricht, hoert das Mikrofon nicht hin
    // (Geraete ohne Echo-Unterdrueckung). Unterbrochen wird dann per Tipp.
    if (redetDazwischen && !dazwischenErlaubtRef.current) return;

    const jetzt = performance.now();
    if (p === "listening" && jetzt < ruheBisRef.current) {
      v.aktivMs = 0;
      return;
    }

    const basis = Math.max(MIN_SCHWELLE, v.boden * 2.6);
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
    schleifeRef.current?.a.close();
    schleifeRef.current?.b.close();
    schleifeRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
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

    // Der Weg der Stimme: Satz -> Pegelmesser -> Stream -> (Schleife) ->
    // Audio-Element. Zuerst direkt verbunden und noch in der Geste gestartet,
    // damit das Element abspielen darf; die Schleife kommt weiter unten dazu.
    const outAnalyser = ctx.createAnalyser();
    outAnalyser.fftSize = 1024;
    const ziel = ctx.createMediaStreamDestination();
    outAnalyser.connect(ziel);
    outAnalyserRef.current = outAnalyser;
    const el = new Audio();
    el.autoplay = true;
    el.srcObject = ziel.stream;
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

    // Erst nach dem Mikrofon: dann laeuft das Geraet schon im Gespraechs-
    // modus, und die Stimme kommt als Gegenstelle eines Anrufs herein.
    const schleife = await schleifeBauen(ziel.stream);
    if (schleife && audioRef.current === el) {
      schleifeRef.current = schleife;
      el.srcObject = schleife.stream;
      void el.play().catch(() => {});
    }

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
    echoHinweis,
    dazwischenErlaubt,
    setDazwischenErlaubt: (wert: boolean) => {
      dazwischenErlaubtRef.current = wert;
      setDazwischenErlaubtEinstellung(wert);
      if (wert) setEchoHinweis(false);
    },
    schleifeAktiv: () => schleifeRef.current !== null,
    verfuegbar: status.data?.available ?? false,
    grund: status.data?.available === false ? (status.data.reason ?? null) : null,
  };
}
