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

    const mitte = size / 2;
    const grund = size * 0.26;
    const BALKEN = 72;

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

    const daten = analyser
      ? new Uint8Array(analyser.frequencyBinCount)
      : new Uint8Array(0);
    const geglaettet = new Float32Array(BALKEN);
    let kern = 0;
    let bild = 0;

    const zeichnen = () => {
      bild = requestAnimationFrame(zeichnen);
      ctx.clearRect(0, 0, size, size);

      let pegel = 0;
      if (analyser && active) {
        analyser.getByteFrequencyData(daten);
        const nutzbar = Math.max(BALKEN, Math.floor(daten.length * 0.55));
        const proBalken = Math.max(1, Math.floor(nutzbar / BALKEN));
        for (let i = 0; i < BALKEN; i += 1) {
          let summe = 0;
          for (let j = 0; j < proBalken; j += 1) {
            summe += daten[i * proBalken + j] ?? 0;
          }
          const wert = summe / proBalken / 255;
          pegel += wert;
          const ziel = Math.min(1, Math.sqrt(wert) * 1.15);
          geglaettet[i] += (ziel - geglaettet[i]) * 0.35;
        }
        pegel /= BALKEN;
      } else {
        for (let i = 0; i < BALKEN; i += 1) geglaettet[i] += -geglaettet[i] * 0.1;
      }
      const zielKern = active ? Math.min(1, Math.sqrt(pegel) * 1.4) : 0;
      kern += (zielKern - kern) * 0.2;

      const scheinR = grund * (1.15 + kern * 0.9);
      const schein = ctx.createRadialGradient(
        mitte, mitte, grund * 0.2, mitte, mitte, scheinR,
      );
      schein.addColorStop(0, `rgba(${rgb},${0.28 + kern * 0.35})`);
      schein.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = schein;
      ctx.beginPath();
      ctx.arc(mitte, mitte, scheinR, 0, Math.PI * 2);
      ctx.fill();

      const maxLen = size * 0.2;
      ctx.lineWidth = Math.max(1.5, size * 0.014);
      ctx.lineCap = "round";
      for (let i = 0; i < BALKEN; i += 1) {
        const winkel = (i / BALKEN) * Math.PI * 2 - Math.PI / 2;
        const laenge = 2 + geglaettet[i] * maxLen;
        const innen = grund + size * 0.03;
        const x1 = mitte + Math.cos(winkel) * innen;
        const y1 = mitte + Math.sin(winkel) * innen;
        const x2 = mitte + Math.cos(winkel) * (innen + laenge);
        const y2 = mitte + Math.sin(winkel) * (innen + laenge);
        ctx.strokeStyle = `rgba(${rgb},${0.45 + geglaettet[i] * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      const kernR = grund * (0.82 + kern * 0.22);
      const fuellung = ctx.createRadialGradient(
        mitte, mitte - kernR * 0.3, kernR * 0.2, mitte, mitte, kernR,
      );
      fuellung.addColorStop(0, `rgba(${rgb},1)`);
      fuellung.addColorStop(1, `rgba(${rgb},0.82)`);
      ctx.fillStyle = fuellung;
      ctx.beginPath();
      ctx.arc(mitte, mitte, kernR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mitte, mitte, kernR * 0.86, 0, Math.PI * 2);
      ctx.stroke();
    };

    zeichnen();
    return () => cancelAnimationFrame(bild);
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
