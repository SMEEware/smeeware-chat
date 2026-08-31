"use client";

import * as React from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";

import { SystemModal, type Systemdaten } from "@/components/chat/system-modal";
import { useServerEvents, type ServerEvent } from "@/hooks/use-server-events";
import { useBildlaeufe } from "@/lib/chat/image-runs";
import { useSprechlauf } from "@/lib/chat/speech-runs";
import { hinweisKey } from "@/hooks/use-notifications";
import { useSettings } from "@/lib/settings/store";
import { useSound } from "@/hooks/use-sound";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type Stufe = "info" | "success" | "warning" | "error";

type Toast = {
  id: number;
  level: Stufe;
  title: string;
  body?: string | null;
  /** Faellt auf false, kurz bevor er verschwindet -- fuer den Abgang. */
  sichtbar: boolean;
};

/** Lange genug zum Lesen, kurz genug, um nicht im Weg zu stehen. */
const STANDZEIT = 7000;
const ABGANG = 220;
const MAX_SICHTBAR = 3;

type Stilsatz = {
  icon: React.ReactNode;
  ring: string;
  ton: string;
  schein: string;
};

const STIL: Record<Stufe, Stilsatz> = {
  info: {
    icon: <InfoIcon className="size-4" />,
    ring: "ring-border/70",
    ton: "text-foreground/70",
    schein: "bg-foreground/30",
  },
  success: {
    icon: <CheckCircle2Icon className="size-4" />,
    ring: "ring-emerald-500/40",
    ton: "text-emerald-500",
    schein: "bg-emerald-500",
  },
  warning: {
    icon: <AlertTriangleIcon className="size-4" />,
    ring: "ring-amber-500/40",
    ton: "text-amber-500",
    schein: "bg-amber-500",
  },
  error: {
    icon: <XCircleIcon className="size-4" />,
    ring: "ring-destructive/45",
    ton: "text-destructive",
    schein: "bg-destructive",
  },
};

/** Hoehe eines eingeklappten Stapels -- ein Toast plus die Kanten dahinter. */
const HOEHE = 96;

/**
 * Hinweise vom Backend.
 *
 * Eigene Umsetzung statt einer Bibliothek: die Toasts sollen dieselbe
 * Sprache sprechen wie der Rest -- Haarlinie statt Fuellung, ein Schimmer,
 * der einmal durchlaeuft. Und sie tragen genau einen Fall, nicht die
 * fuenfzehn, die eine allgemeine Bibliothek mitbringt.
 *
 * Gestapelt wird von unten rechts nach oben, hoechstens drei auf einmal --
 * darueber liest sie ohnehin niemand mehr.
 */
export function ServerToasts() {
  const an = useSettings((zustand) => zustand.notifications);
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  // Beim Ueberfahren faechert der Stapel auf -- solange bleiben auch die
  // dahinter lesbar.
  const [offen, setOffen] = React.useState(false);
  // Der Systemcheck. Anders als ein Toast bleibt er stehen, bis jemand ihn
  // wegklickt -- er traegt Zahlen, keine Meldung.
  const [system, setSystem] = React.useState<Systemdaten | null>(null);
  const queryClient = useQueryClient();
  const naechsteId = React.useRef(0);
  const melde = useBildlaeufe((zustand) => zustand.melde);
  const meldeSprache = useSprechlauf((zustand) => zustand.melde);

  // Ein Klang je Anlass: ein Hinweis kommt herein, oder der Systemcheck
  // schlaegt auf. Beide Ereignisse laufen ohnehin nur, wenn Hinweise an sind
  // (useServerEvents haengt an ``an``), also braucht der Klang keine eigene
  // Schranke.
  const spielHinweis = useSound("/assets/sounds/receive_notification.mp3");
  const spielSystem = useSound("/assets/sounds/system_check.mp3");

  const schliessen = React.useCallback((id: number) => {
    // Erst ausblenden, dann entfernen -- sonst springt der Stapel.
    setToasts((vorher) =>
      vorher.map((t) => (t.id === id ? { ...t, sichtbar: false } : t)),
    );
    setTimeout(
      () => setToasts((vorher) => vorher.filter((t) => t.id !== id)),
      ABGANG,
    );
  }, []);

  const aufEreignis = React.useCallback(
    (ereignis: ServerEvent) => {
      // Bilder zuerst und ohne Schranke: sie sind keine Meldung, sondern
      // der Fortschritt eines Werkzeugs, das gerade laeuft. Wer Hinweise
      // abgeschaltet hat, wollte keine Einblendungen -- nicht ein Bild,
      // das im Verlauf nicht mehr entsteht.
      if (ereignis.type === "image") {
        melde(ereignis);
        return;
      }
      // Vorlesen laeuft wie die Bilder ueber diesen Kanal und haengt an
      // keiner Vorliebe: es ist der Fortschritt eines Werkzeugs, das der
      // Nutzer gerade selbst angestossen hat, keine Einblendung.
      if (ereignis.type === "speech") {
        meldeSprache(ereignis);
        return;
      }
      // Der Hinweis liegt zu diesem Zeitpunkt schon in der Ablage --
      // das Abzeichen am Megafon soll das sofort zeigen. Bewusst vor der
      // Schranke unten: wer die Einblendungen abgeschaltet hat, wollte
      // keine Toasts, nicht eine Ablage, die stumm veraltet.
      if (ereignis.type === "toast") {
        void queryClient.invalidateQueries({ queryKey: hinweisKey });
      }

      if (!an) return;
      if (ereignis.type === "system") {
        spielSystem();
        setSystem(ereignis.daten as Systemdaten);
        return;
      }
      if (ereignis.type !== "toast") return;

      spielHinweis();
      const id = naechsteId.current++;
      setToasts((vorher) =>
        [
          ...vorher,
          {
            id,
            level: ereignis.level,
            title: ereignis.title,
            body: ereignis.body,
            sichtbar: true,
          },
        ].slice(-MAX_SICHTBAR),
      );
      setTimeout(() => schliessen(id), STANDZEIT);
    },
    [an, melde, meldeSprache, queryClient, schliessen, spielHinweis, spielSystem],
  );

  // Immer verbunden, nicht nur bei eingeschalteten Hinweisen: ueber
  // denselben Strom laufen die Zwischenstaende der Bilderzeugung, und
  // die haengen an keiner Vorliebe. Was ``an`` steuert, ist die
  // Anzeige -- siehe aufEreignis.
  useServerEvents(true, aufEreignis);

  const modal = system ? (
    <SystemModal daten={system} onClose={() => setSystem(null)} />
  ) : null;

  if (!an || toasts.length === 0) return modal;

  // Der neueste liegt vorn. Die dahinter werden kleiner und ruecken nach
  // oben weg -- so sieht man, dass da noch etwas liegt, ohne dass es um
  // Aufmerksamkeit mit dem Neuen konkurriert.
  const stapel = [...toasts].reverse();

  return (
    <>
      {modal}
      <div
        aria-live="polite"
        onMouseEnter={() => setOffen(true)}
        onMouseLeave={() => setOffen(false)}
        style={{ height: offen ? undefined : HOEHE }}
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col-reverse items-stretch gap-2"
      >
        {stapel.map((toast, tiefe) => {
          const stil = STIL[toast.level];
          // Aufgefaechert: normale Liste. Gestapelt: uebereinander, jeder
          // dahinter etwas kleiner und ein Stueck nach oben versetzt.
          const gestapelt = !offen && tiefe > 0;

          return (
            <div
              key={toast.id}
              style={
                gestapelt
                  ? {
                      position: "absolute",
                      insetInline: 0,
                      bottom: 0,
                      transform: `translateY(-${tiefe * 10}px) scale(${1 - tiefe * 0.05})`,
                      zIndex: 10 - tiefe,
                    }
                  : undefined
              }
              className={cn(
                "group pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-2xl p-3.5",
                // Milchglas mit farbigem Rand -- die Stufe faerbt die Kante,
                // nicht die Flaeche. Eine volle Farbfuellung waere neben dem
                // ruhigen Chat ein Schrei.
                "bg-background/80 shadow-xl shadow-black/10 ring-1 backdrop-blur-xl ring-inset dark:bg-background/70 dark:shadow-black/40",
                stil.ring,
                "transition-all duration-300 ease-out",
                toast.sichtbar
                  ? "translate-y-0 scale-100 opacity-100 blur-0"
                  : "translate-y-2 scale-95 opacity-0 blur-[2px]",
                gestapelt && "opacity-70",
              )}
            >
              {/* Ein Schein in der Stufenfarbe, oben links -- gibt der
                Glasflaeche Tiefe, ohne sie einzufaerben. */}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute -top-8 -left-8 size-24 rounded-full opacity-25 blur-2xl",
                  stil.schein,
                )}
              />

              <span
                aria-hidden
                className="absolute inset-y-0 -left-full w-full animate-[toast-schimmer_900ms_ease-out_forwards] bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent"
              />

              {/* Das Symbol in einer getoenten Kachel statt nackt: es traegt
                  die Stufe, ohne dass die ganze Flaeche Farbe bekommt. */}
              <span
                className={cn(
                  "relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-current/10",
                  stil.ton,
                )}
              >
                {stil.icon}
              </span>

              <span className="relative flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] leading-snug font-medium wrap-break-words">
                  {toast.title}
                </span>
                {toast.body ? (
                  <span className="text-[11px] leading-relaxed text-muted-foreground wrap-break-words">
                    {toast.body}
                  </span>
                ) : null}
              </span>

              <button
                type="button"
                onClick={() => schliessen(toast.id)}
                aria-label="Dismiss"
                className="relative -mt-1 -mr-1 ms-auto flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 opacity-0 transition-[opacity,color] group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 max-md:opacity-100"
              >
                <XIcon className="size-3.5" />
              </button>

              {/* Die Standzeit als Balken an der Unterkante -- man sieht, wie
                lange der Hinweis noch da ist, statt ihn wegspringen zu
                sehen. */}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-0 bottom-0 h-px origin-left animate-[toast-zeit_7000ms_linear_forwards] bg-current opacity-40",
                  stil.ton,
                )}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
