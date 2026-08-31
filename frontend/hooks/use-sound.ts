"use client";

import * as React from "react";

/**
 * Kurzer UI-Sound. Die Datei wird einmal vorgeladen, damit der erste
 * Klick nicht auf das Netz wartet.
 */
export function useSound(src: string) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    const audio = new Audio(src);
    audio.preload = "auto";
    audioRef.current = audio;
    audioRef.current.volume = 0.45;

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [src]);

  return React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Zurueckspulen, damit schnelles Hintereinander-Senden jedes Mal
    // hoerbar ist und nicht in den noch laufenden Ton faellt.
    audio.currentTime = 0;

    // Der Browser darf das Abspielen verweigern (Autoplay-Policy oder
    // stummgeschalteter Tab) -- das ist kein Fehler, den der Chat
    // ausbaden muesste.
    void audio.play().catch(() => {});
  }, []);
}
