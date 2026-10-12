"use client";

import * as React from "react";
import { useAnimationFrame, type MotionValue } from "motion/react";

import {
  drawStrands,
  spawnWisp,
  stepStrands,
  type Strand,
} from "@/components/site/timeline/smoke-strands";

type Ember = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number };

type SmokeState = {
  strands: Strand[];
  embers: Ember[];
  next: number;
  emit: number;
  spark: number;
  fired: boolean;
  time: number;
  last: number;
  width: number;
  height: number;
  ratio: number;
  dirty: boolean;
};

function ember(x: number, y: number, boost: number): Ember {
  return {
    x,
    y: y + (Math.random() - 0.5) * 2,
    vx: (110 + Math.random() * 170) * boost,
    vy: -(8 + Math.random() * 36),
    age: 0,
    life: 0.45 + Math.random() * 0.5,
    size: 0.5 + Math.random() * 0.8,
  };
}

export function UnderlineSmoke({
  progress,
  line,
}: {
  progress: MotionValue<number>;
  line: React.RefObject<HTMLElement | null>;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const state = React.useRef<SmokeState>({
    strands: [],
    embers: [],
    next: 0,
    emit: 0,
    spark: 0,
    fired: false,
    time: 0,
    last: 0,
    width: 0,
    height: 0,
    ratio: 1,
    dirty: false,
  });

  useAnimationFrame((_, delta) => {
    const canvas = canvasRef.current;
    const stroke = line.current;
    if (!canvas || !stroke) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const s = state.current;
    const seconds = Math.min(delta, 50) / 1000;
    s.time += seconds;

    const value = progress.get();
    const growing = value > s.last + 0.0004;
    s.last = value;
    if (value < 0.05) s.fired = false;

    if (!growing && s.strands.length === 0 && s.embers.length === 0) {
      if (s.dirty) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        s.dirty = false;
      }
      return;
    }

    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (s.width !== box.width || s.height !== box.height || s.ratio !== ratio) {
      canvas.width = Math.round(box.width * ratio);
      canvas.height = Math.round(box.height * ratio);
      s.width = box.width;
      s.height = box.height;
      s.ratio = ratio;
    }

    const rect = stroke.getBoundingClientRect();
    const end = rect.left - box.left + rect.width * 0.9;
    const y = rect.top + rect.height / 2 - box.top;

    const pushWisp = (drift: number) => {
      let strand = s.strands.find((item) => item.born > s.time - 0.45);
      if (!strand) {
        strand = { id: s.next++, head: "line", born: s.time, points: [] };
        s.strands.push(strand);
      }
      strand.points.push(spawnWisp(end, y, 0, 0.3 + Math.random() * 0.1, drift, 0.18));
    };

    if (growing && value > 0.72 && !s.fired) {
      let carry = s.emit + 38 * seconds;
      while (carry >= 1) {
        carry -= 1;
        pushWisp(170 + Math.random() * 120);
      }
      s.emit = carry;
      let sparks = s.spark + 9 * seconds;
      while (sparks >= 1) {
        sparks -= 1;
        s.embers.push(ember(end, y, 1));
      }
      s.spark = sparks;
    }

    if (!s.fired && value > 0.985) {
      s.fired = true;
      for (let i = 0; i < 12; i++) pushWisp(230 + Math.random() * 170);
      for (let i = 0; i < 7; i++) s.embers.push(ember(end, y, 1.3));
    }

    s.strands = stepStrands(s.strands, seconds, s.time);
    s.embers = s.embers.filter((p) => {
      p.age += seconds;
      if (p.age >= p.life) return false;
      p.vx *= 1 - 2.2 * seconds;
      p.vy += 60 * seconds;
      p.x += p.vx * seconds;
      p.y += p.vy * seconds;
      return true;
    });

    const dark = document.documentElement.classList.contains("dark");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, s.width, s.height);
    drawStrands(context, s.strands, 0, 0, dark);

    context.globalCompositeOperation = dark ? "lighter" : "source-over";
    for (const p of s.embers) {
      const t = p.age / p.life;
      const alpha = (1 - t) * (0.55 + Math.random() * 0.35);
      const g = Math.round(220 - 150 * t);
      const b = Math.round(150 - 120 * t);
      const rgb = dark ? `255,${g},${b}` : `230,${Math.max(0, g - 60)},${Math.max(0, b - 60)}`;
      context.fillStyle = `rgba(${rgb},${alpha * (dark ? 0.18 : 0.14)})`;
      context.beginPath();
      context.arc(p.x, p.y, p.size * 2.6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = `rgba(${rgb},${alpha})`;
      context.beginPath();
      context.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2);
      context.fill();
    }
    context.globalCompositeOperation = "source-over";
    s.dirty = true;
  });

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute -bottom-6 -left-8 -z-10 h-28 w-[calc(100%+12rem)]"
    />
  );
}
