"use client";

// Absichtlich natives <img>: die Quelle wechselt waehrend der Erzeugung
// mehrfach, und next/image wuerde jeden Zwischenstand durch seinen
// Optimierer schicken -- fuer ein Bild, das eine Sekunde spaeter veraltet
// ist.
/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { ImageIcon, LayersIcon, SparklesIcon } from "lucide-react";

import type { Bildlauf } from "@/lib/chat/image-runs";
import { cn } from "@/lib/utils";

/**
 * Das Bild beim Entstehen.
 *
 * Ein Bild braucht zwanzig bis sechzig Sekunden. Ohne etwas zu sehen ist
 * das eine sehr lange Zeit vor einer Zeile, auf der "laeuft" steht --
 * lange genug, dass man am Chat zweifelt. Die Images-API schickt
 * Zwischenstaende; die kommen hier an.
 *
 * Zwei Dinge, die die Anzeige ruhig halten:
 *
 * Der Kasten hat von Anfang an seine endgueltige Groesse. Er kennt die
 * Masse des Bildes noch nicht, aber quadratisch ist die haeufigste Wahl
 * und ein springendes Layout waere schlimmer als ein leicht falsches
 * Seitenverhaeltnis fuer ein paar Sekunden.
 *
 * Zwischenstaende werden uebereinander geblendet statt ausgetauscht. Ein
 * ``src``-Wechsel am selben Element zeigt kurz nichts, waehrend das neue
 * Bild laedt -- bei einem Bild, das gerade erst entsteht, sieht das aus
 * wie ein Fehler. Also liegt der neue Stand als zweite Ebene darueber und
 * wird erst sichtbar, wenn er wirklich da ist.
 */
export function ImageGeneration({ lauf }: { lauf: Bildlauf }) {
  const fertig = lauf.phase === "done";

  return (
    <div className="my-1 w-fit max-w-full">
      <div
        className={cn(
          "relative aspect-square w-full max-w-[22rem] overflow-hidden rounded-2xl border",
          "bg-muted/40 shadow-sm",
        )}
      >
        {lauf.url ? (
          <Blende src={lauf.url} alt={lauf.alt ?? ""} />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <ImageIcon className="size-8 text-muted-foreground/25" />
          </span>
        )}

        {/* Solange es laeuft: ein Schleier plus wanderndes Licht ueber dem
            Bild. Er liegt bewusst UEBER dem Zwischenstand -- das ist der
            sichtbare Unterschied zwischen "wird noch" und "ist fertig". */}
        {!fertig ? (
          <>
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/50 via-transparent to-transparent" />
            <span className="image-sweep pointer-events-none absolute inset-0" />
          </>
        ) : null}

        <span
          className={cn(
            "absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full",
            "bg-background/85 px-2 py-1 text-[10px] font-medium backdrop-blur-sm",
            "transition-opacity duration-300",
            fertig ? "opacity-0" : "opacity-100",
          )}
        >
          <SparklesIcon className="size-3 animate-pulse text-primary" />
          <span className="text-muted-foreground">
            {lauf.url ? "refining…" : "generating…"}
          </span>
          <Uhr seit={lauf.startedAt} />
        </span>
      </div>

      {/* Nach Vorlage oder frei erfunden -- das erklaert, warum das Bild
          aussieht, wie es aussieht, und gehoert deshalb sichtbar dazu. */}
      {lauf.references ? (
        <p className="mt-1.5 flex items-center gap-1 pl-1 text-[11px] text-muted-foreground/60">
          <LayersIcon className="size-3 shrink-0" />
          from {lauf.references} reference
          {lauf.references === 1 ? "" : "s"}
        </p>
      ) : null}

      {lauf.alt ? (
        <p className="mt-1.5 line-clamp-1 pl-1 text-[11px] text-muted-foreground/60">
          {lauf.alt}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Zwei Ebenen, damit ein neuer Zwischenstand nicht durch ein Loch
 * eingeblendet wird: die alte bleibt liegen, bis die neue geladen ist.
 */
function Blende({ src, alt }: { src: string; alt: string }) {
  const [gezeigt, setGezeigt] = React.useState(src);
  // Abgeleitet statt in einen Effekt kopiert: solange die neue Adresse
  // nicht die gezeigte ist, liegt sie als unsichtbare zweite Ebene
  // darueber. Ihr onLoad macht sie zur gezeigten -- und damit
  // verschwindet sie aus dieser Ableitung von selbst.
  const naechstes = src === gezeigt ? null : src;

  return (
    <>
      <img
        src={gezeigt}
        alt={alt}
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
      {naechstes ? (
        <img
          key={naechstes}
          src={naechstes}
          alt=""
          decoding="async"
          onLoad={() => setGezeigt(naechstes)}
          className="absolute inset-0 size-full object-cover opacity-0"
        />
      ) : null}
    </>
  );
}

/** Verstrichene Zeit, zweimal je Sekunde -- genug fuer eine Sekundenanzeige. */
function Uhr({ seit }: { seit: number }) {
  const [jetzt, setJetzt] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setJetzt(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="font-mono tabular-nums text-muted-foreground/60">
      {Math.max(0, Math.round((jetzt - seit) / 1000))}s
    </span>
  );
}
