"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const BALKEN = 28;

/**
 * Der Ausschlag der Stimme, als Reihe von Balken.
 *
 * Bewusst kein React-Zustand: die Hoehen werden pro Bild direkt am Element
 * gesetzt. Sechzig Zustandsaenderungen je Sekunde wuerden den ganzen
 * Composer neu rendern, waehrend jemand spricht -- fuer eine Anzeige, die
 * niemand liest, sondern nur sieht.
 *
 * Und es ist ein echter Pegel, kein Zufallsgewackel: was da wackelt, ist
 * die Lautstaerke. Wer leise spricht, sieht das.
 */
export function VoiceLevel({
  analyser,
  className,
}: {
  analyser: AnalyserNode | null;
  className?: string;
}) {
  const behaelterRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const behaelter = behaelterRef.current;
    if (!behaelter) return;

    const balken = Array.from(
      behaelter.querySelectorAll<HTMLElement>("[data-balken]"),
    );

    // Ohne Analyser ruhen die Balken auf ihrer Grundhoehe, statt zu
    // verschwinden -- ein leerer Streifen saehe nach Fehler aus.
    if (!analyser) {
      for (const balken_ of balken) balken_.style.transform = "scaleY(0.12)";
      return;
    }

    const daten = new Uint8Array(analyser.frequencyBinCount);
    let bild = 0;

    const zeichnen = () => {
      bild = requestAnimationFrame(zeichnen);
      analyser.getByteFrequencyData(daten);

      // Die Bins auf die Balken verteilen. Die untere Haelfte des Spektrums
      // traegt bei Sprache fast alles -- den Rest zu zeigen hiesse, halb
      // tote Balken zu zeigen.
      const nutzbar = Math.floor(daten.length * 0.6);
      const proBalken = Math.max(1, Math.floor(nutzbar / balken.length));

      for (let i = 0; i < balken.length; i += 1) {
        let summe = 0;
        for (let j = 0; j < proBalken; j += 1) {
          summe += daten[i * proBalken + j] ?? 0;
        }
        const wert = summe / proBalken / 255;
        // Wurzel statt linear: leise Sprache soll sichtbar sein, nicht nur
        // ein Zucken am Boden.
        const hoehe = Math.min(1, Math.sqrt(wert) * 1.25);
        balken[i].style.transform = `scaleY(${Math.max(0.12, hoehe)})`;
      }
    };

    zeichnen();
    return () => cancelAnimationFrame(bild);
  }, [analyser]);

  return (
    <span
      ref={behaelterRef}
      aria-hidden
      className={cn("flex h-5 items-center gap-[2px]", className)}
    >
      {Array.from({ length: BALKEN }, (_, i) => (
        <span
          key={i}
          data-balken
          className="h-full w-[2px] origin-center rounded-full bg-primary/70 transition-transform duration-75 ease-out"
          style={{ transform: "scaleY(0.12)" }}
        />
      ))}
    </span>
  );
}
