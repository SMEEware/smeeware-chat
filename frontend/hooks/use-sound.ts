"use client";

import * as React from "react";

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

    audio.currentTime = 0;

    void audio.play().catch(() => {});
  }, []);
}
