"use client";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Die Verbindungsanzeige im Kopf des Chats.
 *
 * Zwei Ebenen, und die Trennung dazwischen ist der ganze Entwurf: die
 * Pille sagt nur, ob es geht -- ein Punkt und ein Wort, im Blickfeld,
 * ohne dass man hinschauen muss. Alles, was man erst wissen will, wenn
 * etwas nicht stimmt, liegt im Tooltip: welcher Host, welcher Pfad, wie
 * schnell, wann zuletzt geprueft.
 *
 * Der Tooltip ist deshalb kein Einzeiler mehr, sondern eine kleine Karte
 * in denselben Farben wie die Modale und die Einfuehrung. Der Zeiger
 * darunter faellt weg -- an einer Karte mit Rahmen sieht er aus wie ein
 * Fehler, und ihn mitzurahmen ist mehr Aufwand, als er wert ist.
 */

type Zustand = "prueft" | "verbunden" | "streamt" | "weg";

type BackendStatusProps = {
  online: boolean | undefined;
  endpoint: string | undefined;
  isStreaming: boolean;
  /** Rundlauf Next -> Backend in ms. null, wenn niemand geantwortet hat. */
  latencyMs?: number | null;
  /** Wann die letzte Pruefung durchlief (Date.now()-Zeitstempel). */
  checkedAt?: number;
};

/**
 * Wie jeder Zustand aussieht und heisst -- an einer Stelle statt in vier
 * verschachtelten Bedingungen. Ein neuer Zustand ist damit ein Eintrag,
 * keine Suche durch das Markup.
 */
const ZUSTAENDE: Record<
  Zustand,
  {
    /** Was in der Pille steht -- knapp, sie ist nur ein Wort breit. */
    kurz: string;
    /** Die Ueberschrift der Karte. */
    titel: string;
    punkt: string;
    schein: string;
    pille: string;
    /** Schlaegt der Punkt? */
    puls: boolean;
  }
> = {
  prueft: {
    kurz: "checking…",
    titel: "Checking the backend",
    punkt: "bg-muted-foreground/50",
    schein: "bg-muted-foreground/20",
    pille: "ring-border/50 text-muted-foreground",
    puls: false,
  },
  verbunden: {
    kurz: "connected",
    titel: "Connected",
    punkt: "bg-emerald-500",
    schein: "bg-emerald-500/30",
    pille: "ring-border/60 text-muted-foreground hover:text-foreground",
    puls: true,
  },
  streamt: {
    kurz: "generating",
    titel: "Streaming a response",
    punkt: "bg-primary",
    schein: "bg-primary/30",
    // Bewusst dieselbe ruhige Pille wie im Normalfall: primary und
    // destructive sind in diesem Thema beide rot, ein gefaerbter Rahmen
    // hier waere auf einen Blick nicht von "offline" zu unterscheiden --
    // und das sind die zwei Zustaende, die man nie verwechseln darf.
    // Dass etwas laeuft, tragen der schlagende Punkt und das Wort.
    pille: "ring-border/60 text-foreground",
    puls: true,
  },
  weg: {
    kurz: "offline",
    titel: "Not reachable",
    punkt: "bg-destructive",
    schein: "bg-destructive/30",
    pille: "bg-destructive/[0.07] ring-destructive/40 text-destructive",
    puls: false,
  },
};

export function BackendStatus({
  online,
  endpoint,
  isStreaming,
  latencyMs,
  checkedAt,
}: BackendStatusProps) {
  // Der Strom hat Vorrang: laeuft gerade eine Antwort, ist die Frage nach
  // der Erreichbarkeit beantwortet, und zwar mit ja.
  const zustand: Zustand = isStreaming
    ? "streamt"
    : online === undefined
      ? "prueft"
      : online
        ? "verbunden"
        : "weg";

  const art = ZUSTAENDE[zustand];
  const ziel = zerlegen(endpoint);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={cn(
              "flex cursor-default items-center gap-2 rounded-full py-1 ps-2 pe-2.5 text-xs font-medium ring-1 ring-inset transition-colors select-none",
              art.pille,
            )}
          />
        }
      >
        <Punkt art={art} groesse="klein" />
        {art.kurz}
      </TooltipTrigger>

      {/* Nach unten: die Pille sitzt in der Kopfzeile, ueber ihr ist kein
          Platz fuer eine Karte. */}
      <TooltipContent
        side="bottom"
        sideOffset={8}
        className={cn(
          "relative w-64 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-0 overflow-hidden rounded-2xl border border-border/70 bg-card/95 p-0 text-foreground shadow-xl shadow-black/20 backdrop-blur-xl",
          "**:data-[slot=tooltip-arrow]:hidden",
        )}
      >
        {/* Derselbe Schein wie in den Modalen -- hier in der Farbe des
            Zustands, damit die Karte schon beim Aufgehen sagt, worum es
            geht, bevor irgendjemand ein Wort gelesen hat. */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-10 -right-8 size-28 rounded-full opacity-70 blur-3xl",
            art.schein,
          )}
        />

        <div className="relative flex flex-col gap-2.5 p-3.5">
          <div className="flex items-center gap-2">
            <Punkt art={art} groesse="gross" />
            <span className="text-[13px] leading-none font-medium tracking-tight">
              {art.titel}
            </span>

            {/* Die Zahl steht rechts und in Ziffern gleicher Breite: beim
                Hovern zweier Messungen hintereinander soll sie sich
                aendern, ohne dass daneben etwas verrutscht. */}
            {typeof latencyMs === "number" ? (
              <span className="ms-auto rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                {latencyMs} ms
              </span>
            ) : null}
          </div>

          {/* Wohin die Verbindung geht. Host und Pfad getrennt, weil man
              nach dem Host sucht und den Pfad nur bestaetigt -- als eine
              lange Zeile liest man beides nicht. */}
          {ziel ? (
            <div className="flex flex-col gap-0.5 font-mono text-[11px] leading-relaxed">
              <span className="truncate">
                <span className="text-muted-foreground/50">{ziel.schema}</span>
                <span className="text-foreground/90">{ziel.host}</span>
              </span>
              {ziel.pfad ? (
                <span className="break-all text-muted-foreground/60">
                  {ziel.pfad}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="relative border-t border-border/60 px-3.5 py-2 text-[10px] leading-relaxed text-muted-foreground/70">
          {fusszeile(zustand, checkedAt)}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Der Punkt -- zweimal dieselbe Form in zwei Groessen, in der Pille und in
 * der Karte. Der Ring darum ist ein zweites Element und kein Rahmen: nur
 * so kann er schlagen, ohne den Punkt selbst mitzubewegen.
 */
function Punkt({
  art,
  groesse,
}: {
  art: (typeof ZUSTAENDE)[Zustand];
  groesse: "klein" | "gross";
}) {
  const s = groesse === "klein" ? "size-1.5" : "size-2";
  return (
    <span className={cn("relative flex shrink-0", s)}>
      {art.puls ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-75",
            art.punkt,
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex rounded-full", s, art.punkt)} />
    </span>
  );
}

/**
 * Was unten steht, haengt am Zustand: solange alles laeuft, ist die
 * einzige offene Frage, wie alt die Auskunft ist. Geht nichts, ist sie,
 * woran es liegt -- und ein Zeitstempel waere dann nur im Weg.
 */
function fusszeile(zustand: Zustand, checkedAt?: number): string {
  if (zustand === "weg") return "Nothing is answering on this port.";
  if (zustand === "prueft") return "Reaching out…";
  if (zustand === "streamt") return "A response is coming in right now.";
  return checkedAt ? `Checked ${seit(checkedAt)}.` : "Reachable.";
}

/**
 * Kompakte Altersangabe. Absichtlich nicht date-fns: dessen
 * ``formatDistanceToNowStrict`` schreibt "12 seconds ago" aus, und in
 * einer Zeile von zehn Pixeln Hoehe ist das eine halbe Zeile zu viel.
 *
 * Gerechnet wird beim Rendern, und das genuegt: die Karte haengt am
 * offenen Tooltip, existiert also nur, solange jemand hinschaut.
 */
function seit(zeitpunkt: number): string {
  const sekunden = Math.max(0, Math.round((Date.now() - zeitpunkt) / 1000));
  if (sekunden < 5) return "just now";
  if (sekunden < 60) return `${sekunden}s ago`;
  const minuten = Math.round(sekunden / 60);
  if (minuten < 60) return `${minuten}m ago`;
  return `${Math.round(minuten / 60)}h ago`;
}

/**
 * Die URL in ihre drei lesbaren Teile. Faellt das Zerlegen aus -- der
 * Endpunkt kommt aus einer Umgebungsvariable und muss nichts Gueltiges
 * sein --, wird der ganze Text zum Host: lieber unformatiert anzeigen als
 * die Karte an einer kaputten Einstellung scheitern lassen.
 */
function zerlegen(endpoint: string | undefined) {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    return { schema: `${url.protocol}//`, host: url.host, pfad: url.pathname };
  } catch {
    return { schema: "", host: endpoint, pfad: "" };
  }
}
