"use client";

import * as React from "react";
import {
  ChevronDownIcon,
  GripHorizontalIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react";

import { SpeechVisualizer } from "@/components/chat/speech-visualizer";
import { useSprechlauf, type Sprechlauf } from "@/lib/chat/speech-runs";
import { cn } from "@/lib/utils";

const BREITE = 340;
const RAND = 16;
/** So viel vom Fenster bleibt immer im Bild, damit man es wiederfindet. */
const SICHTBAR = 56;

/**
 * Eine geladene Audiospur -- die Grundlage fuers Abspielen.
 *
 * Kein ``<audio>``-Element: dessen Zusammenspiel aus MediaElementSource,
 * Analyser und Suchen ist in Chrome unzuverlaessig (ein Sprung landet dann
 * auf 0). Stattdessen wird das MP3 einmal in einen ``AudioBuffer`` dekodiert
 * und ueber einen ``AudioBufferSourceNode`` gespielt. Der Fortschritt kommt
 * aus der Uhr des ``AudioContext`` -- nicht aus einem Medienelement --, und
 * Suchen heisst schlicht: die Quelle stoppen und mit neuem Versatz neu
 * starten. Damit sind Start, Stopp und Springen exakt und ohne Eigenheiten.
 */
type Spur = {
  buffer: AudioBuffer | null;
  quelle: AudioBufferSourceNode | null;
  /** ``ctx.currentTime`` beim Start der aktuellen Quelle. */
  startCtx: number;
  /** Position in Sekunden -- Basis, von der aus gespielt/gesprungen wird. */
  versatz: number;
  /** Gesetzt, bevor eine Quelle fuer Pause/Sprung gestoppt wird, damit ihr
   *  ``onended`` das nicht fuer ein natuerliches Ende haelt. */
  handStop: boolean;
  fehler: boolean;
};

/**
 * Die Sprechanzeige -- ein verschiebbares Fenster mit einem Tab je Audio.
 *
 * Jedes Vorlesen bekommt seinen eigenen Tab und bleibt liegen: man wechselt
 * zwischen ihnen, schliesst sie einzeln oder das ganze Fenster, haelt an,
 * spielt weiter und springt im Regler vor und zurueck. Das Neue spielt von
 * selbst los -- der lebendige Teil, der bleiben soll --, die alten warten
 * daneben.
 *
 * Ein einziger ``AudioContext`` und ein Analyser fuer alle; es spielt immer
 * nur eine Spur, also zeigt die Kreis-Anzeige genau die, die man hoert.
 */
export function SpeechFenster() {
  const laeufe = useSprechlauf((z) => z.laeufe);
  const aktiv = useSprechlauf((z) => z.aktiv);
  const position = useSprechlauf((z) => z.position);
  const entferne = useSprechlauf((z) => z.entferne);
  const leere = useSprechlauf((z) => z.leere);
  const waehle = useSprechlauf((z) => z.waehle);
  const setPosition = useSprechlauf((z) => z.setPosition);

  const [analyser, setAnalyser] = React.useState<AnalyserNode | null>(null);
  const [spieltId, setSpieltId] = React.useState<string | null>(null);
  const [zieht, setZieht] = React.useState(false);
  // Ladezustand je Tab in echtem State -- so muss die Anzeige zum Rendern
  // nie in die Ref schauen (Refs waehrend des Renderns sind heikel) und
  // erfaehrt trotzdem von jedem frisch geladenen Puffer.
  type Ladung = { status: "laden" | "fertig" | "fehler"; dauer: number };
  const [geladen, setGeladen] = React.useState<Record<string, Ladung>>({});
  // Welcher Tab seinen Text aufgeklappt zeigt. Als run-id statt als Boolean,
  // damit das Aufklappen beim Tabwechsel von selbst wieder zufaellt.
  const [offenRun, setOffenRun] = React.useState<string | null>(null);

  const rahmenRef = React.useRef<HTMLDivElement>(null);
  const zugRef = React.useRef<{ dx: number; dy: number } | null>(null);
  const letzteRef = React.useRef<{ x: number; y: number } | null>(null);

  const ctxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const spurRef = React.useRef<Map<string, Spur>>(new Map());
  const autoRef = React.useRef<Set<string>>(new Set());

  const derAktive = laeufe.find((l) => l.run === aktiv) ?? null;

  // ---- Audio-Graph ------------------------------------------------- //

  const kontext = React.useCallback((): AudioContext => {
    if (!ctxRef.current) {
      const c = new AudioContext();
      const a = c.createAnalyser();
      a.fftSize = 256;
      a.smoothingTimeConstant = 0.72;
      a.connect(c.destination);
      ctxRef.current = c;
      analyserRef.current = a;
      setAnalyser(a);
    }
    return ctxRef.current;
  }, []);

  /** Das MP3 einmal laden und dekodieren. Mehrfach aufrufbar. */
  const laden = React.useCallback(
    async (run: string, url: string): Promise<Spur> => {
      const da = spurRef.current.get(run);
      if (da) return da;
      const spur: Spur = {
        buffer: null,
        quelle: null,
        startCtx: 0,
        versatz: 0,
        handStop: false,
        fehler: false,
      };
      spurRef.current.set(run, spur);
      setGeladen((g) => ({ ...g, [run]: { status: "laden", dauer: 0 } }));
      try {
        const c = kontext();
        const roh = await (await fetch(url, { cache: "no-store" })).arrayBuffer();
        spur.buffer = await c.decodeAudioData(roh);
        const dauer = spur.buffer.duration;
        setGeladen((g) => ({ ...g, [run]: { status: "fertig", dauer } }));
      } catch {
        spur.fehler = true;
        setGeladen((g) => ({ ...g, [run]: { status: "fehler", dauer: 0 } }));
      }
      return spur;
    },
    [kontext],
  );

  const pausieren = React.useCallback((run: string) => {
    const spur = spurRef.current.get(run);
    const c = ctxRef.current;
    if (spur && spur.quelle && c) {
      const dauer = spur.buffer?.duration ?? 0;
      spur.versatz = Math.min(dauer, spur.versatz + (c.currentTime - spur.startCtx));
      spur.handStop = true;
      try {
        spur.quelle.stop();
      } catch {
        // schon gestoppt
      }
      spur.quelle = null;
    }
    setSpieltId((id) => (id === run ? null : id));
  }, []);

  const abspielen = React.useCallback(
    async (lauf: Sprechlauf) => {
      if (!lauf.url) return;
      const c = kontext();
      const spur = await laden(lauf.run, lauf.url);
      if (!spur.buffer) return;

      // Alles andere anhalten -- es spielt immer nur eines.
      for (const [id, s] of spurRef.current) if (id !== lauf.run && s.quelle) pausieren(id);

      await c.resume().catch(() => {});
      if (c.state !== "running") return;

      // Am Ende (oder ganz knapp davor) wieder von vorn.
      if (spur.versatz >= spur.buffer.duration - 0.05) spur.versatz = 0;

      const quelle = c.createBufferSource();
      quelle.buffer = spur.buffer;
      quelle.connect(analyserRef.current!);
      spur.handStop = false;
      quelle.onended = () => {
        if (spur.handStop) return; // fuer Pause/Sprung gestoppt
        spur.versatz = 0;
        spur.quelle = null;
        setSpieltId((id) => (id === lauf.run ? null : id));
      };
      quelle.start(0, spur.versatz);
      spur.startCtx = c.currentTime;
      spur.quelle = quelle;
      setSpieltId(lauf.run);
    },
    [kontext, laden, pausieren],
  );

  const springen = React.useCallback(
    (run: string, ziel: number) => {
      const spur = spurRef.current.get(run);
      const c = ctxRef.current;
      if (!spur || !spur.buffer || !c) return;
      const t = Math.max(0, Math.min(ziel, spur.buffer.duration));
      const liefGerade = !!spur.quelle;
      if (liefGerade) {
        spur.handStop = true;
        try {
          spur.quelle!.stop();
        } catch {
          // egal
        }
        spur.quelle = null;
      }
      spur.versatz = t;
      if (liefGerade) {
        const quelle = c.createBufferSource();
        quelle.buffer = spur.buffer;
        quelle.connect(analyserRef.current!);
        spur.handStop = false;
        quelle.onended = () => {
          if (spur.handStop) return;
          spur.versatz = 0;
          spur.quelle = null;
          setSpieltId((id) => (id === run ? null : id));
        };
        quelle.start(0, t);
        spur.startCtx = c.currentTime;
        spur.quelle = quelle;
      }
    },
    [],
  );

  /** Die aktuelle Position einer Spur -- aus der Uhr des Kontexts. */
  const fortschritt = React.useCallback((run: string): number => {
    const spur = spurRef.current.get(run);
    const c = ctxRef.current;
    if (!spur) return 0;
    const dauer = spur.buffer?.duration ?? 0;
    const p = spur.quelle && c ? spur.versatz + (c.currentTime - spur.startCtx) : spur.versatz;
    return Math.max(0, Math.min(p, dauer));
  }, []);

  // Laden + Auto-Start: sobald der aktive Tab fertig ist. Jedes Vorlesen
  // startet genau einmal von selbst.
  React.useEffect(() => {
    if (!derAktive || derAktive.phase !== "done" || !derAktive.url) return;
    const spur = spurRef.current.get(derAktive.run);
    if (!spur) {
      void laden(derAktive.run, derAktive.url);
      return;
    }
    if (spur.buffer && !autoRef.current.has(derAktive.run)) {
      autoRef.current.add(derAktive.run);
      void abspielen(derAktive);
    }
  }, [derAktive, geladen, laden, abspielen]);

  // Geschlossene Tabs raeumen. Ist der letzte weg, den Kontext schliessen.
  React.useEffect(() => {
    const ids = new Set(laeufe.map((l) => l.run));
    for (const [id, s] of spurRef.current) {
      if (!ids.has(id)) {
        if (s.quelle) {
          try {
            s.quelle.stop();
          } catch {
            // egal
          }
        }
        spurRef.current.delete(id);
        autoRef.current.delete(id);
        setSpieltId((cur) => (cur === id ? null : cur));
      }
    }
    if (laeufe.length === 0 && ctxRef.current) {
      void ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
      analyserRef.current = null;
      setAnalyser(null);
      setSpieltId(null);
    }
  }, [laeufe]);

  // ---- Ziehen ------------------------------------------------------ //

  const einpassen = React.useCallback((x: number, y: number) => {
    return {
      x: Math.min(Math.max(x, RAND - BREITE + SICHTBAR), window.innerWidth - SICHTBAR),
      y: Math.min(Math.max(y, RAND), window.innerHeight - SICHTBAR),
    };
  }, []);

  React.useEffect(() => {
    const rahmen = rahmenRef.current;
    if (!rahmen || laeufe.length === 0) return;
    const start =
      position ??
      einpassen((window.innerWidth - BREITE) / 2, window.innerHeight - 360);
    letzteRef.current = start;
    rahmen.style.transform = `translate3d(${start.x}px, ${start.y}px, 0)`;
  }, [laeufe.length, position, einpassen]);

  const anfassen = (event: React.PointerEvent) => {
    const letzte = letzteRef.current;
    if (!letzte) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    zugRef.current = { dx: event.clientX - letzte.x, dy: event.clientY - letzte.y };
    if (rahmenRef.current) rahmenRef.current.style.willChange = "transform";
    setZieht(true);
  };

  const ziehen = (event: React.PointerEvent) => {
    const zug = zugRef.current;
    const rahmen = rahmenRef.current;
    if (!zug || !rahmen) return;
    const neu = einpassen(event.clientX - zug.dx, event.clientY - zug.dy);
    letzteRef.current = neu;
    rahmen.style.transform = `translate3d(${neu.x}px, ${neu.y}px, 0)`;
  };

  const loslassen = () => {
    if (!zugRef.current) return;
    zugRef.current = null;
    if (rahmenRef.current) rahmenRef.current.style.willChange = "auto";
    setZieht(false);
    if (letzteRef.current) setPosition(letzteRef.current);
  };

  if (laeufe.length === 0 || !derAktive) return null;

  const spielt = spieltId === derAktive.run;
  const ladung = geladen[derAktive.run];
  const bereitetVor =
    (derAktive.phase === "start" && !derAktive.url) ||
    (derAktive.phase === "done" &&
      derAktive.url !== undefined &&
      ladung?.status !== "fertig" &&
      ladung?.status !== "fehler");
  const fehler = derAktive.phase === "error" || ladung?.status === "fehler";
  const offenText = offenRun === derAktive.run;

  return (
    <div
      ref={rahmenRef}
      style={{ width: BREITE }}
      className={cn(
        "fixed top-0 left-0 z-50 flex flex-col overflow-hidden rounded-3xl shadow-2xl shadow-black/25 ring-1 ring-border/60 dark:shadow-black/50",
        "animate-in fade-in zoom-in-95 duration-200",
        // Beim Ziehen fallen Milchglas und Durchsicht weg: ``backdrop-filter``
        // muss den Hintergrund in jedem Bild neu abtasten und ruckelt dabei.
        zieht
          ? "select-none bg-background dark:bg-background"
          : "bg-background/80 backdrop-blur-xl transition-shadow dark:bg-background/70",
      )}
    >
      {/* Kopf = Ziehgriff. */}
      <div
        onPointerDown={anfassen}
        onPointerMove={ziehen}
        onPointerUp={loslassen}
        onPointerCancel={loslassen}
        className={cn(
          "flex h-9 touch-none items-center gap-1.5 px-3",
          zieht ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <GripHorizontalIcon className="size-3.5 shrink-0 text-muted-foreground/40" />
        <Volume2Icon className="size-3.5 shrink-0 text-primary" />
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground/70">
          Reading aloud
        </span>
        {laeufe.length > 1 ? (
          <span className="rounded-full bg-muted/60 px-1.5 py-px text-[9px] tabular-nums text-muted-foreground/60">
            {laeufe.length}
          </span>
        ) : null}
        <button
          type="button"
          onClick={leere}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Close all"
          title="Close all"
          className="ms-auto flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      {/* Tab-Leiste -- nur ab zwei Audios. */}
      {laeufe.length > 1 ? (
        <div className="flex gap-1 overflow-x-auto px-2 pb-2 scrollbar-none">
          {laeufe.map((l, i) => (
            <Tab
              key={l.run}
              lauf={l}
              nummer={i + 1}
              aktiv={l.run === aktiv}
              spielt={spieltId === l.run}
              onWaehle={() => waehle(l.run)}
              onSchliesse={() => entferne(l.run)}
            />
          ))}
        </div>
      ) : null}

      {/* Koerper des offenen Tabs. */}
      <div className="group flex flex-col items-center gap-3 px-5 pt-1 pb-5">
        <div className="relative flex items-center justify-center">
          {bereitetVor || fehler ? (
            <span
              className={cn(
                "flex size-32 items-center justify-center rounded-full",
                fehler ? "bg-destructive/10" : "bg-primary/10",
              )}
            >
              {fehler ? (
                <XIcon className="size-6 text-destructive" />
              ) : (
                <Loader2Icon className="size-6 animate-spin text-primary" />
              )}
            </span>
          ) : (
            <SpeechVisualizer
              analyser={analyser}
              active={spielt}
              size={128}
              paused={zieht}
            />
          )}

          {/* Nur noch Start/Stop, mittig auf der Anzeige. */}
          {!bereitetVor && !fehler ? (
            <button
              type="button"
              onClick={() =>
                spielt ? pausieren(derAktive.run) : void abspielen(derAktive)
              }
              aria-label={spielt ? "Pause" : "Play"}
              className="absolute flex size-11 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95"
            >
              {spielt ? (
                <PauseIcon className="size-5 fill-current" />
              ) : (
                <PlayIcon className="size-5 translate-x-0.5 fill-current" />
              )}
            </button>
          ) : null}
        </div>

        {fehler ? (
          <p className="text-center text-[12px] text-destructive">
            Couldn&apos;t read that aloud.
          </p>
        ) : null}

        {/* Der Regler -- vor und zurueck, wie im Media-Player. */}
        {!bereitetVor && !fehler ? (
          <Seekleiste
            run={derAktive.run}
            spielt={spielt}
            dauer={ladung?.dauer ?? 0}
            fortschritt={fortschritt}
            springen={springen}
          />
        ) : null}

        {derAktive.provider === "free" ? (
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground/60">
            free voice
          </span>
        ) : null}

        {/* Der Text -- eingeklappt zwei Zeilen mit Verlauf, aufgeklappt der
            ganze, scrollbar. */}
        {derAktive.text ? (
          <div className="w-full">
            <div
              className={cn(
                "relative overflow-y-auto rounded-xl bg-muted/30 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground transition-[max-height]",
                offenText ? "max-h-40" : "max-h-[3.4rem]",
              )}
            >
              <p className={cn(!offenText && "line-clamp-2")}>{derAktive.text}</p>
              {!offenText ? (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-6 rounded-b-xl bg-linear-to-t from-background/60 to-transparent" />
              ) : null}
            </div>
            {derAktive.text.length > 90 ? (
              <button
                type="button"
                onClick={() =>
                  setOffenRun((r) => (r === derAktive.run ? null : derAktive.run))
                }
                className="mt-1.5 flex cursor-pointer items-center gap-1 text-[11px] font-medium text-muted-foreground/60 transition-colors hover:text-foreground"
              >
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 transition-transform",
                    offenText && "rotate-180",
                  )}
                />
                {offenText ? "Show less" : "Show full text"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Ein Tab in der Leiste -- Nummer, Titel, ein Punkt wenn er spielt, ein x. */
function Tab({
  lauf,
  nummer,
  aktiv,
  spielt,
  onWaehle,
  onSchliesse,
}: {
  lauf: Sprechlauf;
  nummer: number;
  aktiv: boolean;
  spielt: boolean;
  onWaehle: () => void;
  onSchliesse: () => void;
}) {
  const titel = titelAus(lauf, nummer);
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "group/tab flex shrink-0 items-center gap-1.5 rounded-lg py-1 ps-2 pe-1 text-[11px] transition-colors",
        aktiv
          ? "bg-primary/9 text-foreground ring-1 ring-primary/25 ring-inset"
          : "text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={onWaehle}
        className="flex max-w-28 cursor-pointer items-center gap-1.5"
        title={titel}
      >
        {spielt ? (
          <span className="relative flex size-1.5 shrink-0">
            <span className="absolute inline-flex size-1.5 animate-ping rounded-full bg-primary/70" />
            <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
          </span>
        ) : (
          <Volume2Icon className="size-3 shrink-0 opacity-50" />
        )}
        <span className="truncate">{titel}</span>
      </button>
      <button
        type="button"
        onClick={onSchliesse}
        aria-label="Close tab"
        className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-[opacity,color] group-hover/tab:opacity-100 hover:text-destructive"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}

/**
 * Der Regler unter der Anzeige -- vor- und zurueckziehen wie im Media-Player.
 *
 * Der Fortschritt laeuft nicht durch React: ein ``requestAnimationFrame``
 * schreibt Breite und Griff direkt ans Element. Er liest die Position aus
 * ``fortschritt`` -- der Uhr des AudioContext, nicht einem Medienelement --,
 * und schreibt den Zeitstempel nur selten in den Zustand.
 */
function Seekleiste({
  run,
  spielt,
  dauer,
  fortschritt,
  springen,
}: {
  run: string;
  spielt: boolean;
  dauer: number;
  fortschritt: (run: string) => number;
  springen: (run: string, ziel: number) => void;
}) {
  const [jetzt, setJetzt] = React.useState(0);
  const bahnRef = React.useRef<HTMLDivElement>(null);
  const fuellRef = React.useRef<HTMLDivElement>(null);
  const punktRef = React.useRef<HTMLDivElement>(null);
  const ziehtRef = React.useRef(false);

  const anteil = (clientX: number): number => {
    const bahn = bahnRef.current;
    if (!bahn) return 0;
    const r = bahn.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const male = (p: number) => {
    if (fuellRef.current) fuellRef.current.style.width = `${p * 100}%`;
    if (punktRef.current) punktRef.current.style.left = `${p * 100}%`;
  };

  React.useEffect(() => {
    let bild = 0;
    let letzte = 0;
    const tick = () => {
      bild = requestAnimationFrame(tick);
      if (ziehtRef.current) return;
      const p = dauer > 0 ? Math.min(1, fortschritt(run) / dauer) : 0;
      male(p);
      const now = performance.now();
      if (now - letzte > 150) {
        letzte = now;
        setJetzt(fortschritt(run));
      }
    };
    tick();
    return () => cancelAnimationFrame(bild);
    // run wechselt beim Tab, dauer wird beim Laden von 0 auf den Wert gesetzt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, dauer]);

  const zeigen = (clientX: number) => {
    const p = anteil(clientX);
    male(p);
    if (dauer > 0) setJetzt(p * dauer);
  };

  const runter = (e: React.PointerEvent) => {
    e.stopPropagation();
    ziehtRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    zeigen(e.clientX);
  };
  const bewegen = (e: React.PointerEvent) => {
    if (ziehtRef.current) zeigen(e.clientX);
  };
  const hoch = (e: React.PointerEvent) => {
    if (!ziehtRef.current) return;
    ziehtRef.current = false;
    if (dauer > 0) springen(run, anteil(e.clientX) * dauer);
  };

  return (
    <div className="w-full">
      <div
        ref={bahnRef}
        onPointerDown={runter}
        onPointerMove={bewegen}
        onPointerUp={hoch}
        onPointerCancel={hoch}
        className="group/seek relative flex h-4 cursor-pointer items-center"
      >
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted-foreground/20 transition-all group-hover/seek:h-1.5">
          <div
            ref={fuellRef}
            className="h-full rounded-full bg-primary"
            style={{ width: "0%" }}
          />
        </div>
        <div
          ref={punktRef}
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 rounded-full bg-primary shadow ring-2 ring-background transition-transform group-hover/seek:scale-125"
          style={{ left: "0%" }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground/50">
        <span>{uhr(jetzt)}</span>
        <span className={cn(!spielt && "opacity-70")}>{uhr(dauer)}</span>
      </div>
    </div>
  );
}

/** Sekunden als m:ss. */
function uhr(sekunden: number): string {
  if (!Number.isFinite(sekunden) || sekunden < 0) sekunden = 0;
  const m = Math.floor(sekunden / 60);
  const s = Math.floor(sekunden % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Ein kurzer Titel je Tab: die ersten Worte des Textes, sonst "Audio N". */
function titelAus(lauf: Sprechlauf, nummer: number): string {
  const text = (lauf.text ?? "").trim();
  if (!text) return `Audio ${nummer}`;
  const kurz = text.split(/\s+/).slice(0, 4).join(" ");
  return kurz.length < text.length ? `${kurz}…` : kurz;
}
