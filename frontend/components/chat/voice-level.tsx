"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const BAR_COUNT = 28;

export function VoiceLevel({
  analyser,
  className,
}: {
  analyser: AnalyserNode | null;
  className?: string;
}) {
  const containerRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const bars = Array.from(
      container.querySelectorAll<HTMLElement>("[data-bar]"),
    );

    if (!analyser) {
      for (const bars_ of bars) bars_.style.transform = "scaleY(0.12)";
      return;
    }

    const data = new Uint8Array(analyser.frequencyBinCount);
    let image = 0;

    const draw = () => {
      image = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);

      const usable = Math.floor(data.length * 0.6);
      const perBar = Math.max(1, Math.floor(usable / bars.length));

      for (let i = 0; i < bars.length; i += 1) {
        let sum = 0;
        for (let j = 0; j < perBar; j += 1) {
          sum += data[i * perBar + j] ?? 0;
        }
        const value = sum / perBar / 255;
        const height = Math.min(1, Math.sqrt(value) * 1.25);
        bars[i].style.transform = `scaleY(${Math.max(0.12, height)})`;
      }
    };

    draw();
    return () => cancelAnimationFrame(image);
  }, [analyser]);

  return (
    <span
      ref={containerRef}
      aria-hidden
      className={cn("flex h-5 items-center gap-[2px]", className)}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span
          key={i}
          data-bar
          className="h-full w-[2px] origin-center rounded-full bg-primary/70 transition-transform duration-75 ease-out"
          style={{ transform: "scaleY(0.12)" }}
        />
      ))}
    </span>
  );
}
