"use client";

import * as React from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CommandIcon,
  CompassIcon,
  FolderGit2Icon,
  FolderPlusIcon,
  MessageSquareIcon,
  MicIcon,
  SettingsIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";

import { Kbd } from "@/components/ui/kbd";
import { useSidebar } from "@/components/ui/sidebar";
import { useSettings } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

/**
 * Die Einfuehrung -- einmal, beim ersten Oeffnen des Chats.
 *
 * Warum eine eigene Schicht und keine Bibliothek: die drei Dinge, die eine
 * Tour ausmachen, sind hier jeweils drei Zeilen -- den Kasten eines
 * Elements messen, alles andere abdunkeln, einen Text danebenlegen. Eine
 * Bibliothek braechte dafuer ihr eigenes Gestaltungssystem mit, das man
 * anschliessend wieder einfangen muesste.
 *
 * Das Loch entsteht ueber ``clip-path`` mit der Regel evenodd: die aeussere
 * Bahn ist der ganze Bildschirm, die innere das hervorgehobene Element --
 * uebrig bleibt alles dazwischen, und genau darauf liegt der Weichzeichner.
 * Ein Element hoeher zu stapeln waere der andere Weg, wuerde aber
 * verlangen, jedem Ziel eine Positionierung aufzuzwingen.
 *
 * Ziele werden ueber ``data-tour`` gefunden. Fehlt eines -- die Sidebar ist
 * auf schmalen Fenstern eingeklappt --, faellt der Schritt weg, statt auf
 * einen Kasten der Groesse null zu zeigen.
 */

type Seite = "oben" | "unten";

type Schritt = {
  id: string;
  /** Ein oder mehrere ``data-tour``-Namen. Mehrere ergeben einen Kasten. */
  ziele: string[];
  icon: React.ElementType;
  titel: string;
  text: React.ReactNode;
  /** Wo der Text bevorzugt steht. Passt er nicht, dreht er sich um. */
  seite?: Seite;
  /** Wie rund das Loch ist -- passend zum Element darunter. */
  radius?: number;
  /** Liegt das Ziel in der Sidebar? Dann wird sie fuer den Schritt
   *  aufgeklappt, falls sie zu ist -- sonst zeigte er ins Leere. */
  sidebar?: boolean;
};

const SCHRITTE: Schritt[] = [
  {
    id: "composer",
    ziele: ["composer"],
    icon: MessageSquareIcon,
    titel: "This is where it starts",
    text: (
      <>
        Type your question and press <Kbd>↵</Kbd> to send.{" "}
        <Kbd>⇧</Kbd>
        <Kbd>↵</Kbd> makes a new line. Everything else on this bar is
        optional.
      </>
    ),
    seite: "oben",
    radius: 26,
  },
  {
    id: "modell",
    ziele: ["modell"],
    icon: SparklesIcon,
    titel: "One model per message",
    text: (
      <>
        GPT-5.6, DeepSeek, or a local one through Ollama. Switch whenever you
        like — the next answer uses whatever stands here, even mid-conversation.
      </>
    ),
    seite: "oben",
    radius: 999,
  },
  {
    id: "anhang",
    ziele: ["anhang", "stimme"],
    icon: MicIcon,
    titel: "Files and voice",
    text: (
      <>
        Attach a file — or just drop it anywhere on the box. The microphone
        writes down what you say in any language; you never pick one first.
      </>
    ),
    seite: "oben",
    radius: 999,
  },
  {
    id: "workspace",
    ziele: ["workspace"],
    icon: FolderGit2Icon,
    titel: "Work from a project",
    text: (
      <>
        Point a workspace at a folder and it rides along with every message, so
        the model knows which project and path you mean. Switch or clear it here
        anytime.
      </>
    ),
    seite: "oben",
    radius: 999,
  },
  {
    id: "neu",
    ziele: ["neu"],
    icon: FolderPlusIcon,
    titel: "A fresh start",
    text: (
      <>
        Every chat gets its own address from the first second, so you can link
        to one and come back to it later.
      </>
    ),
    seite: "unten",
    radius: 10,
    sidebar: true,
  },
  {
    id: "suche",
    ziele: ["suche"],
    icon: CommandIcon,
    titel: "Find your way back",
    text: (
      <>
        Search your chats by name here — or press <Kbd>⌘</Kbd>
        <Kbd>K</Kbd> anywhere for the command palette. Every command lives there;
        type <Kbd>/</Kbd> in the message box to reach them inline.
      </>
    ),
    seite: "unten",
    radius: 10,
    sidebar: true,
  },
  {
    id: "einstellungen",
    ziele: ["einstellungen"],
    icon: SettingsIcon,
    titel: "Yours to adjust",
    text: (
      <>
        Thinking, tools, personas, and which model turns your voice into text.
        All of it lives behind this gear.
      </>
    ),
    seite: "oben",
    radius: 8,
    sidebar: true,
  },
  {
    id: "tour",
    ziele: ["tour"],
    icon: CompassIcon,
    titel: "Lost? Come back here",
    text: (
      <>
        This walkthrough lives behind the compass. Press it whenever you want
        to run through it again — it changes nothing but what you see.
      </>
    ),
    seite: "oben",
    radius: 8,
    sidebar: true,
  },
];

type Kasten = { x: number; y: number; breite: number; hoehe: number };

/** Wie viel Luft zwischen Element und Loch bleibt. */
const LUFT = 8;
/** Breite der Textkarte. */
const KARTE = 340;
/** Abstand der Karte zum Loch. */
const ABSTAND = 16;
/** Rand, den die Karte zum Fensterrand haelt. */
const RAND = 16;

/**
 * Die Einfuehrung von aussen anstossen -- fuer den Knopf in der Sidebar.
 *
 * Sie haengt an genau einem Wert, und der liegt in den Einstellungen:
 * "nochmal zeigen" ist dasselbe wie "noch nicht gesehen". Die Funktion gibt
 * es trotzdem, damit der Aufrufer das nicht wissen muss -- die Sidebar
 * startet eine Tour, sie setzt keine Merkvariable zurueck.
 *
 * ``getState`` statt Hook: das hier laeuft in einem Klick, nicht beim
 * Rendern. Ein Abonnement wuerde die Sidebar bei jedem Schritt der Tour
 * neu zeichnen, obwohl sie den Wert gar nicht anzeigt.
 */
export function tourStarten() {
  useSettings.getState().setTourGesehen(false);
}

export function ChatTour() {
  const gesehen = useSettings((z) => z.tourGesehen);
  const setGesehen = useSettings((z) => z.setTourGesehen);

  // Die Sidebar -- fuer Schritte, die auf etwas in ihr zeigen. Ist sie zu,
  // wird sie fuer den Schritt aufgeklappt; auf dem Handy als Sheet, sonst
  // fest an der Seite.
  const { open, setOpen, isMobile, openMobile, setOpenMobile } = useSidebar();
  const sidebarOffen = isMobile ? openMobile : open;

  // Erst nach dem Einhaengen: der Server kennt den localStorage nicht, und
  // eine Tour, die im vorgerenderten HTML steht, blitzt beim Laden auf.
  const [bereit, setBereit] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const [kasten, setKasten] = React.useState<Kasten | null>(null);
  const [fenster, setFenster] = React.useState({ breite: 0, hoehe: 0 });

  React.useEffect(() => {
    // Ein Wimpernschlag Vorlauf, damit Sidebar und Composer wirklich
    // stehen -- gemessen wird sonst ein halb aufgebautes Fenster.
    const id = setTimeout(() => setBereit(true), 600);
    return () => clearTimeout(id);
  }, []);

  const laeuft = bereit && !gesehen;

  // Nur Schritte, deren Ziel es wirklich gibt. Ein Sidebar-Schritt bleibt
  // immer dabei, auch wenn die Sidebar gerade zu ist -- er klappt sie beim
  // Erreichen selbst auf. Alles andere muss jetzt schon sichtbar sein.
  const schritte = React.useMemo(() => {
    if (!laeuft) return [];
    return SCHRITTE.filter(
      (s) =>
        s.sidebar ||
        s.ziele.every((z) => {
          const el = document.querySelector<HTMLElement>(`[data-tour="${z}"]`);
          return el !== null && el.getBoundingClientRect().width > 0;
        }),
    );
  }, [laeuft]);

  const schritt = schritte[index];

  const beenden = React.useCallback(() => {
    setGesehen(true);
    setIndex(0);
  }, [setGesehen]);

  const weiter = React.useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= schritte.length) {
        setGesehen(true);
        return 0;
      }
      return i + 1;
    });
  }, [schritte.length, setGesehen]);

  const zurueck = React.useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  // Zeigt der Schritt in die Sidebar und ist sie zu, aufklappen -- sonst
  // zeigte der Schritt ins Leere. Das setState liegt in einem Frame Vorlauf,
  // nicht direkt im Effekt-Rumpf: sonst ruegt der Linter die Kaskade.
  React.useEffect(() => {
    if (!laeuft || !schritt?.sidebar || sidebarOffen) return;
    const id = requestAnimationFrame(() => {
      if (isMobile) setOpenMobile(true);
      else setOpen(true);
    });
    return () => cancelAnimationFrame(id);
  }, [laeuft, schritt, sidebarOffen, isMobile, setOpen, setOpenMobile]);

  // Messen -- bei jedem Schritt, wenn sich das Fenster aendert und sobald die
  // Sidebar auf- oder zugeht (dann steht ihr Ziel woanders).
  React.useEffect(() => {
    if (!laeuft || !schritt) return;

    const messen = () => {
      const kaesten = schritt.ziele
        .map((z) => document.querySelector<HTMLElement>(`[data-tour="${z}"]`))
        .filter((el): el is HTMLElement => el !== null)
        .map((el) => el.getBoundingClientRect());

      if (kaesten.length === 0) {
        setKasten(null);
        return;
      }

      // Mehrere Ziele ergeben einen umschliessenden Kasten -- Anhang und
      // Mikrofon gehoeren zusammen und sollen auch so aussehen.
      const links = Math.min(...kaesten.map((k) => k.left));
      const oben = Math.min(...kaesten.map((k) => k.top));
      const rechts = Math.max(...kaesten.map((k) => k.right));
      const unten = Math.max(...kaesten.map((k) => k.bottom));

      setKasten({
        x: links - LUFT,
        y: oben - LUFT,
        breite: rechts - links + LUFT * 2,
        hoehe: unten - oben + LUFT * 2,
      });
      setFenster({ breite: window.innerWidth, hoehe: window.innerHeight });
    };

    messen();
    // Nach dem Auf-/Zuklappen der Sidebar sitzt das Ziel erst nach der
    // Animation (~200 ms, auf dem Handy laenger) an seinem Platz -- ein paar
    // Nachmessungen holen die endgueltige Lage ein.
    const t1 = setTimeout(messen, 230);
    const t2 = setTimeout(messen, 520);
    window.addEventListener("resize", messen);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", messen);
    };
  }, [laeuft, schritt, sidebarOffen]);

  // Tastatur: vor, zurueck, raus.
  React.useEffect(() => {
    if (!laeuft) return;
    const auf = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        beenden();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        weiter();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        zurueck();
      }
    };
    window.addEventListener("keydown", auf, true);
    return () => window.removeEventListener("keydown", auf, true);
  }, [laeuft, beenden, weiter, zurueck]);

  if (!laeuft || !schritt || !kasten || schritte.length === 0) return null;

  const platz = karteSetzen(schritt, kasten, fenster);
  const Icon = schritt.icon;
  const letzter = index === schritte.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Getting started"
      className="fixed inset-0 z-[60] animate-in fade-in duration-300"
    >
      {/* Alles ausser dem Ziel: weichgezeichnet und abgedunkelt. Faengt
          zugleich jeden Klick ab -- waehrend der Einfuehrung soll niemand
          versehentlich etwas ausloesen, das die Erklaerung daneben
          widerlegt. */}
      <div
        className="absolute inset-0 bg-background/55 backdrop-blur-[3px] transition-[clip-path] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ clipPath: `path(evenodd, "${lochPfad(kasten, schritt.radius ?? 12)}")` }}
      />

      {/* Der Ring um das Ziel. Er liegt ueber dem Schleier, aber nicht ueber
          dem Element -- das bleibt unberuehrt und damit lesbar. */}
      <div
        aria-hidden
        className="tour-ring pointer-events-none absolute transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          left: kasten.x,
          top: kasten.y,
          width: kasten.breite,
          height: kasten.hoehe,
          borderRadius: schritt.radius ?? 12,
        }}
      />

      {/* Die Karte */}
      <div
        className="absolute w-[340px] max-w-[calc(100vw-2rem)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ left: platz.x, top: platz.top, bottom: platz.bottom }}
      >
        <div className="relative overflow-hidden rounded-2xl bg-card/95 shadow-2xl shadow-black/25 ring-1 ring-border/70 backdrop-blur-xl">
          {/* Ein Schein oben rechts -- derselbe Griff wie in den
              Einstellungen, damit die Tour dazugehoert und nicht
              danebensteht. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -top-12 -right-8 size-32 rounded-full bg-primary/25 opacity-50 blur-3xl"
          />

          <div className="relative flex flex-col gap-3 p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <div className="flex min-w-0 flex-col">
                <h2 className="font-heading text-[15px] font-semibold tracking-tight">
                  {schritt.titel}
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {schritt.text}
                </p>
              </div>

              <button
                type="button"
                onClick={beenden}
                aria-label="Skip the tour"
                className="-mt-1 -mr-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              {/* Punkte statt "3 von 6": man sieht auf einen Blick, wie viel
                  noch kommt, ohne zu rechnen. */}
              <span className="flex items-center gap-1.5">
                {schritte.map((s, i) => (
                  <span
                    key={s.id}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === index
                        ? "w-5 bg-primary"
                        : i < index
                          ? "w-1.5 bg-primary/40"
                          : "w-1.5 bg-muted-foreground/20",
                    )}
                  />
                ))}
              </span>

              <div className="ms-auto flex items-center gap-1.5">
                {index > 0 ? (
                  <button
                    type="button"
                    onClick={zurueck}
                    className="flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ArrowLeftIcon className="size-3.5" />
                    Back
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={beenden}
                    className="flex h-8 cursor-pointer items-center rounded-lg px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Skip
                  </button>
                )}

                <button
                  type="button"
                  onClick={weiter}
                  autoFocus
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-95"
                >
                  {letzter ? (
                    <>
                      <CheckIcon className="size-3.5" />
                      Got it
                    </>
                  ) : (
                    <>
                      Next
                      <ArrowRightIcon className="size-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Der Pfad mit dem Loch. Aussen der ganze Bildschirm, innen das Ziel als
 * abgerundetes Rechteck; ``evenodd`` laesst dazwischen stehen, was
 * abgedunkelt wird.
 *
 * Beide Bahnen haben immer dieselbe Form und dieselbe Zahl an Befehlen --
 * nur so kann der Browser zwischen zwei Schritten weich ueberblenden statt
 * zu springen.
 */
function lochPfad(k: Kasten, radius: number): string {
  const r = Math.max(0, Math.min(radius, k.breite / 2, k.hoehe / 2));
  const { x, y, breite: b, hoehe: h } = k;
  return [
    // Die aeussere Bahn ist bewusst ein fester, riesiger Rahmen und nicht die
    // Fenstergroesse: die Schicht liegt ohnehin ueber dem ganzen Fenster
    // (``inset-0``), also deckt der Rahmen es immer ab. Haenge er dagegen an
    // ``fenster`` -- das anfangs {0,0} ist und erst nach dem Messen steht --,
    // schrumpfte die dunkle Flaeche beim ersten Schritt kurz zusammen und
    // wuchse wieder. Fest bleibt sie immer gross; nur das Loch wandert.
    `M0 0 H100000 V100000 H0 Z`,
    `M${x + r} ${y}`,
    `H${x + b - r}`,
    `A${r} ${r} 0 0 1 ${x + b} ${y + r}`,
    `V${y + h - r}`,
    `A${r} ${r} 0 0 1 ${x + b - r} ${y + h}`,
    `H${x + r}`,
    `A${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V${y + r}`,
    `A${r} ${r} 0 0 1 ${x + r} ${y}`,
    "Z",
  ].join(" ");
}

/**
 * Wohin die Karte gehoert.
 *
 * Der Kniff steckt in der Rueckgabe: steht die Karte oben, wird sie ueber
 * ``bottom`` verankert, steht sie unten, ueber ``top``. Damit braucht die
 * Rechnung ihre Hoehe nicht zu kennen -- und kann sie folglich auch nicht
 * unterschaetzen. Mit einem festen Schaetzwert legte sich eine hohe Karte
 * ueber genau das Element, das sie erklaert.
 *
 * Die gewuenschte Seite gilt, solange dort ueberhaupt Platz ist; sonst
 * kippt sie. Waagerecht folgt sie der Mitte des Ziels und wird dann ins
 * Fenster geschoben -- eine Karte, die halb draussen steht, erklaert nichts.
 */
function karteSetzen(
  schritt: Schritt,
  k: Kasten,
  fenster: { breite: number; hoehe: number },
): { x: number; top?: number; bottom?: number } {
  // Nur fuer die Frage "passt sie da ueberhaupt hin?" -- grosszuegig
  // geschaetzt, damit im Zweifel die Seite mit mehr Luft gewinnt.
  const grob = 260;
  const platzOben = k.y - ABSTAND - RAND;
  const platzUnten = fenster.hoehe - (k.y + k.hoehe) - ABSTAND - RAND;

  const oben =
    schritt.seite === "oben"
      ? platzOben >= grob || platzOben >= platzUnten
      : platzUnten < grob && platzOben > platzUnten;

  const mitte = k.x + k.breite / 2 - KARTE / 2;
  const x = Math.min(
    Math.max(RAND, mitte),
    Math.max(RAND, fenster.breite - KARTE - RAND),
  );

  return oben
    ? { x, bottom: Math.max(RAND, fenster.hoehe - k.y + ABSTAND) }
    : { x, top: Math.max(RAND, k.y + k.hoehe + ABSTAND) };
}
