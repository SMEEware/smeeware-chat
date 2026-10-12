"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export function SpeechVisualizer({
  analyser,
  active,
  size = 148,
  className,
  paused = false,
}: {
  analyser: AnalyserNode | null;
  active: boolean;
  size?: number;
  className?: string;
  paused?: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const probeRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const probe = probeRef.current;
    if (!canvas || !probe) return;
    if (paused) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const middle = size / 2;
    const reason = size * 0.26;
    const BAR_COUNT = 72;

    const rgb = ((): string => {
      try {
        const probeCanvas = document.createElement("canvas");
        const pctx = probeCanvas.getContext("2d");
        if (!pctx) return "211,13,13";
        pctx.fillStyle = getComputedStyle(probe).color || "rgb(211,13,13)";
        pctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = pctx.getImageData(0, 0, 1, 1).data;
        return `${r},${g},${b}`;
      } catch {
        return "211,13,13";
      }
    })();

    const data = analyser
      ? new Uint8Array(analyser.frequencyBinCount)
      : new Uint8Array(0);
    const smoothed = new Float32Array(BAR_COUNT);
    let core = 0;
    let image = 0;

    const draw = () => {
      image = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, size, size);

      let rmsLevel = 0;
      if (analyser && active) {
        analyser.getByteFrequencyData(data);
        const usable = Math.max(BAR_COUNT, Math.floor(data.length * 0.55));
        const perBar = Math.max(1, Math.floor(usable / BAR_COUNT));
        for (let i = 0; i < BAR_COUNT; i += 1) {
          let sum = 0;
          for (let j = 0; j < perBar; j += 1) {
            sum += data[i * perBar + j] ?? 0;
          }
          const value = sum / perBar / 255;
          rmsLevel += value;
          const target = Math.min(1, Math.sqrt(value) * 1.15);
          smoothed[i] += (target - smoothed[i]) * 0.35;
        }
        rmsLevel /= BAR_COUNT;
      } else {
        for (let i = 0; i < BAR_COUNT; i += 1) smoothed[i] += -smoothed[i] * 0.1;
      }
      const targetBox = active ? Math.min(1, Math.sqrt(rmsLevel) * 1.4) : 0;
      core += (targetBox - core) * 0.2;

      const glowRadius = reason * (1.15 + core * 0.9);
      const glow = ctx.createRadialGradient(
        middle, middle, reason * 0.2, middle, middle, glowRadius,
      );
      glow.addColorStop(0, `rgba(${rgb},${0.28 + core * 0.35})`);
      glow.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(middle, middle, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      const maxLen = size * 0.2;
      ctx.lineWidth = Math.max(1.5, size * 0.014);
      ctx.lineCap = "round";
      for (let i = 0; i < BAR_COUNT; i += 1) {
        const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
        const len = 2 + smoothed[i] * maxLen;
        const inner = reason + size * 0.03;
        const x1 = middle + Math.cos(angle) * inner;
        const y1 = middle + Math.sin(angle) * inner;
        const x2 = middle + Math.cos(angle) * (inner + len);
        const y2 = middle + Math.sin(angle) * (inner + len);
        ctx.strokeStyle = `rgba(${rgb},${0.45 + smoothed[i] * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      const coreRadius = reason * (0.82 + core * 0.22);
      const fill = ctx.createRadialGradient(
        middle, middle - coreRadius * 0.3, coreRadius * 0.2, middle, middle, coreRadius,
      );
      fill.addColorStop(0, `rgba(${rgb},1)`);
      fill.addColorStop(1, `rgba(${rgb},0.82)`);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(middle, middle, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(middle, middle, coreRadius * 0.86, 0, Math.PI * 2);
      ctx.stroke();
    };

    draw();
    return () => cancelAnimationFrame(image);
  }, [analyser, active, size, paused]);

  return (
    <span className={cn("relative inline-flex", className)} style={{ width: size, height: size }}>
      <span ref={probeRef} className="pointer-events-none absolute size-0 text-primary opacity-0" aria-hidden />
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{ width: size, height: size }}
      />
    </span>
  );
}
