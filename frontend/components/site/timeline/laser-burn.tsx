"use client";

import * as React from "react";
import { useAnimationFrame, type MotionValue } from "motion/react";

import { xAt, type GitTrace } from "@/components/site/timeline/git-engine";
import {
  drawStrands,
  spawnWisp,
  stepStrands,
  type Strand,
} from "@/components/site/timeline/smoke-strands";

type Ember = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  carry: number;
  age: number;
  life: number;
  size: number;
  streak: boolean;
};

type Flash = { x: number; y: number; age: number };

type Glitch = { start: number; until: number; next: number };

type BurnState = {
  glitch: Glitch;
  strands: Strand[];
  embers: Ember[];
  flashes: Flash[];
  lastY: number | null;
  heat: number;
  time: number;
  next: number;
  emit: Record<string, number>;
  spark: Record<string, number>;
  width: number;
  height: number;
  ratio: number;
  dirty: boolean;
};

type Head = { id: string; trace: GitTrace; x: number; y: number };

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function hot(t: number): [number, number, number] {
  if (t > 0.82) {
    const k = (t - 0.82) / 0.18;
    return [255, mix(196, 248, k), mix(128, 236, k)];
  }
  if (t > 0.42) {
    const k = (t - 0.42) / 0.4;
    return [255, mix(92, 196, k), mix(54, 128, k)];
  }
  const k = t / 0.42;
  return [mix(170, 255, k), mix(30, 92, k), mix(30, 54, k)];
}

function trailPoints(trace: GitTrace, from: number, to: number) {
  const out: { x: number; y: number }[] = [{ x: xAt(trace.samples, from), y: from }];
  for (const point of trace.samples) {
    if (point.y > from && point.y < to) out.push(point);
  }
  out.push({ x: xAt(trace.samples, to), y: to });

  const dense: { x: number; y: number }[] = [out[0]];
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1];
    const b = out[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 9));
    for (let k = 1; k <= steps; k++) {
      dense.push({ x: mix(a.x, b.x, k / steps), y: mix(a.y, b.y, k / steps) });
    }
  }
  return dense;
}

export function LaserBurn({
  traces,
  nodes,
  litY,
  host,
  bleed,
}: {
  traces: GitTrace[];
  nodes: { x: number; y: number }[];
  litY: MotionValue<number>;
  host: React.RefObject<HTMLDivElement | null>;
  bleed: number;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const state = React.useRef<BurnState>({
    glitch: { start: 0, until: 0, next: 0 },
    strands: [],
    embers: [],
    flashes: [],
    lastY: null,
    heat: 0,
    time: 0,
    next: 0,
    emit: {},
    spark: {},
    width: 0,
    height: 0,
    ratio: 1,
    dirty: false,
  });

  useAnimationFrame((_, delta) => {
    const canvas = canvasRef.current;
    const root = host.current;
    if (!canvas || !root) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const s = state.current;

    const seconds = Math.min(delta, 50) / 1000;
    s.time += seconds;
    const velocity = litY.getVelocity();
    const target = clamp(Math.abs(velocity) / 950);
    const rate = target > s.heat ? 9 : 1.8;
    s.heat += (target - s.heat) * (1 - Math.exp(-rate * seconds));

    const current = litY.get();
    const previous = s.lastY ?? current;
    s.lastY = current;
    if (current > previous) {
      for (const node of nodes) {
        if (node.y > previous && node.y <= current) {
          s.flashes.push({ x: node.x, y: node.y, age: 0 });
          const count = 10 + ((Math.random() * 8) | 0);
          for (let i = 0; i < count; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
            const speed = 120 + Math.random() * 190;
            s.embers.push({
              x: node.x,
              y: node.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              carry: 0,
              age: 0,
              life: 0.28 + Math.random() * 0.3,
              size: 1,
              streak: true,
            });
          }
        }
      }
    }

    if (
      s.heat < 0.004 &&
      s.strands.length === 0 &&
      s.embers.length === 0 &&
      s.flashes.length === 0
    ) {
      if (s.dirty) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        s.dirty = false;
      }
      return;
    }

    const narrow = window.innerWidth < 768;
    const ratio = Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (s.width !== width || s.height !== height || s.ratio !== ratio) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      s.width = width;
      s.height = height;
      s.ratio = ratio;
    }

    const box = root.getBoundingClientRect();
    const ox = box.left + bleed;
    const oy = box.top;
    const y = current;
    const heat = s.heat;
    const advancing = velocity > 0;
    const dark = document.documentElement.classList.contains("dark");

    const heads: Head[] = traces
      .filter((trace) => y >= trace.start && y <= trace.end + 1)
      .map((trace) => ({ id: trace.id, trace, x: xAt(trace.samples, y), y }));

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.lineCap = "round";
    context.lineJoin = "round";

    const additive = dark ? "lighter" : "source-over";

    if (heat > 0.08 && s.time >= s.glitch.next) {
      const length = 0.12 + Math.random() * 0.14;
      s.glitch.start = s.time;
      s.glitch.until = s.time + length;
      s.glitch.next = s.time + length + (0.3 + Math.random() * 1.2) * (1.25 - heat * 0.6);
    }
    const glitching = s.time < s.glitch.until && heat > 0.04;
    const flicker = glitching ? 0.78 + Math.random() * 0.34 : 1;

    for (const head of heads) {
      if (heat < 0.01) continue;
      const length = 60 + heat * 190;
      const from = Math.max(head.trace.start, y - length);
      const points = trailPoints(head.trace, from, y);
      context.globalCompositeOperation = additive;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1];
          const b = points[i];
          const t = clamp(1 - (y - b.y) / length);
          const [r, g, bl] = hot(t);
          const alpha = Math.min(1, heat * Math.pow(t, 0.9) * (dark ? 1 : 0.85) * flicker);
          context.strokeStyle = `rgba(${r | 0},${g | 0},${bl | 0},${pass === 0 ? alpha * 0.16 : alpha})`;
          context.lineWidth = pass === 0 ? 9 * (0.5 + t * 0.5) : 1.2 + t * 1.3;
          context.beginPath();
          context.moveTo(ox + a.x, oy + a.y);
          context.lineTo(ox + b.x, oy + b.y);
          context.stroke();
        }
      }
    }

    for (const head of heads) {
      if (heat < 0.03) continue;
      const amount = (narrow ? 40 : 70) * heat + 14;
      let carry = (s.emit[head.id] ?? 0) + amount * seconds;
      let strand = s.strands.find((item) => item.head === head.id && item.born > s.time - 1.1);
      while (carry >= 1) {
        carry -= 1;
        if (!strand) {
          strand = { id: s.next++, head: head.id, born: s.time + Math.random() * 0.4, points: [] };
          s.strands.push(strand);
        }
        strand.points.push(spawnWisp(head.x, head.y, velocity, 0.45 + heat * 0.55));
      }
      s.emit[head.id] = carry;

      if (advancing) {
        let embers = (s.spark[head.id] ?? 0) + (2 + heat * (narrow ? 8 : 14)) * seconds;
        while (embers >= 1) {
          embers -= 1;
          const streak = heat > 0.5 && Math.random() < (heat - 0.5) * 0.9;
          const spread = streak ? 150 + heat * 160 : 34;
          s.embers.push({
            x: head.x + (Math.random() - 0.5) * 4,
            y: head.y - 2,
            vx: (Math.random() - 0.5) * 2 * spread,
            vy: streak ? -(110 + Math.random() * 160) : -(18 + Math.random() * 46),
            carry: velocity * (streak ? 0.3 : 0.7),
            age: 0,
            life: streak ? 0.22 + Math.random() * 0.22 : 0.7 + Math.random() * 0.9,
            size: 0.7 + Math.random() * 1,
            streak,
          });
        }
        s.spark[head.id] = embers;
      }
    }

    s.strands = stepStrands(s.strands, seconds, s.time);
    drawStrands(context, s.strands, ox, oy, dark);

    context.globalCompositeOperation = additive;
    s.embers = s.embers.filter((p) => {
      p.age += seconds;
      if (p.age >= p.life) return false;
      const t = p.age / p.life;
      if (p.streak) {
        p.vy += 640 * seconds;
        p.vx *= 1 - 1.1 * seconds;
      } else {
        p.vx += Math.sin(s.time * 3 + p.size * 9) * 20 * seconds;
        p.vy -= 6 * seconds;
      }
      p.carry *= Math.exp(-3.5 * seconds);
      p.x += p.vx * seconds;
      p.y += (p.vy + p.carry) * seconds;
      const [r, g, b] = hot(1 - t * 0.85);
      const flicker = p.streak ? 1 : 0.65 + Math.random() * 0.35;
      const alpha = (1 - t) * flicker;
      const x = ox + p.x;
      const yy = oy + p.y;
      if (p.streak) {
        context.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;
        context.lineWidth = 1.1 - t * 0.6;
        context.beginPath();
        context.moveTo(x, yy);
        context.lineTo(x - p.vx * 0.032, yy - (p.vy + p.carry) * 0.032);
        context.stroke();
      } else {
        context.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${alpha * 0.14})`;
        context.beginPath();
        context.arc(x, yy, p.size * 2.6, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;
        context.beginPath();
        context.arc(x, yy, p.size * 0.75, 0, Math.PI * 2);
        context.fill();
      }
      return true;
    });

    context.globalCompositeOperation = additive;
    for (const head of heads) {
      if (heat < 0.02) continue;
      const cx = ox + head.x;
      const cy = oy + head.y;
      const reach = 34 + heat * 150;
      const shimmer = 0.85 + Math.sin(s.time * 31) * 0.08 + Math.random() * 0.07;
      const flare = context.createLinearGradient(cx - reach, cy, cx + reach, cy);
      const core = dark ? "255,236,224" : "255,120,70";
      flare.addColorStop(0, `rgba(${core},0)`);
      flare.addColorStop(0.5, `rgba(${core},${Math.min(1, (dark ? 0.75 : 0.5) * heat * shimmer * flicker)})`);
      flare.addColorStop(1, `rgba(${core},0)`);
      context.fillStyle = flare;
      context.fillRect(cx - reach, cy - 0.6, reach * 2, 1.2);
      context.globalAlpha = 0.18;
      context.fillRect(cx - reach * 0.7, cy - 3, reach * 1.4, 6);
      context.globalAlpha = 1;

      const radius = 5 + heat * 9;
      const glow = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
      glow.addColorStop(0, `rgba(255,250,244,${0.9 * heat * shimmer})`);
      glow.addColorStop(0.4, `rgba(255,170,96,${0.45 * heat})`);
      glow.addColorStop(1, "rgba(255,80,50,0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fill();
    }

    if (glitching) {
      const span = Math.max(0.001, s.glitch.until - s.glitch.start);
      const phase = clamp((s.time - s.glitch.start) / span);
      const envelope = Math.sin(phase * Math.PI);
      context.globalCompositeOperation = additive;
      for (const head of heads) {
        const cx = ox + head.x;
        const cy = oy + head.y;

        context.filter = "blur(1.6px)";
        const warp = 6 + phase * 26;
        const lens = context.createRadialGradient(cx, cy, warp * 0.55, cx, cy, warp);
        lens.addColorStop(0, "rgba(255,255,255,0)");
        lens.addColorStop(0.72, `rgba(${dark ? "120,220,255" : "60,140,210"},${0.1 * envelope})`);
        lens.addColorStop(0.86, `rgba(255,${dark ? 236 : 150},${dark ? 222 : 110},${0.22 * envelope})`);
        lens.addColorStop(1, `rgba(${dark ? "255,60,90" : "220,40,70"},0)`);
        context.fillStyle = lens;
        context.beginPath();
        context.arc(cx, cy, warp, 0, Math.PI * 2);
        context.fill();

        const split = (1.2 + Math.random() * 2.2) * envelope;
        const channels: [string, number][] = [
          [dark ? "255,60,90" : "220,40,70", -split],
          [dark ? "90,214,255" : "40,150,200", split],
        ];
        for (const [rgb, dx] of channels) {
          const ghost = context.createRadialGradient(cx + dx, cy, 0, cx + dx, cy, 6);
          ghost.addColorStop(0, `rgba(${rgb},${(dark ? 0.42 : 0.3) * envelope})`);
          ghost.addColorStop(1, `rgba(${rgb},0)`);
          context.fillStyle = ghost;
          context.beginPath();
          context.arc(cx + dx, cy, 6, 0, Math.PI * 2);
          context.fill();
        }

        context.filter = "blur(2.2px)";
        const slices = 1 + ((Math.random() * 2) | 0);
        for (let i = 0; i < slices; i++) {
          const sy = cy + (Math.random() - 0.5) * 30;
          const sw = 10 + Math.random() * 34;
          const sx = cx - sw / 2 + (Math.random() - 0.5) * 30;
          const rgb = Math.random() < 0.5 ? channels[0][0] : channels[1][0];
          context.fillStyle = `rgba(${rgb},${(0.12 + Math.random() * 0.16) * envelope})`;
          context.fillRect(sx, sy, sw, 1.4);
        }

        if (s.glitch.start * 7.3 % 1 < 0.34) {
          context.filter = "blur(0.6px)";
          const angle = (s.glitch.start * 13.7) % (Math.PI * 2);
          const reach = 10 + Math.random() * 14;
          context.beginPath();
          context.moveTo(cx, cy);
          for (let k = 1; k <= 5; k++) {
            const d = (reach * k) / 5;
            const jitter = (Math.random() - 0.5) * 6 * (k < 5 ? 1 : 0.3);
            context.lineTo(
              cx + Math.cos(angle) * d - Math.sin(angle) * jitter,
              cy + Math.sin(angle) * d + Math.cos(angle) * jitter,
            );
          }
          context.strokeStyle = `rgba(${dark ? "214,236,255" : "70,120,200"},${0.55 * envelope})`;
          context.lineWidth = 0.7;
          context.stroke();
        }
        context.filter = "none";
      }
    }

    context.globalCompositeOperation = additive;
    s.flashes = s.flashes.filter((flash) => {
      flash.age += seconds;
      const t = flash.age / 0.5;
      if (t >= 1) return false;
      const cx = ox + flash.x;
      const cy = oy + flash.y;
      const ease = 1 - Math.pow(1 - t, 3);
      context.strokeStyle = `rgba(255,${dark ? 196 : 120},${dark ? 150 : 80},${(1 - t) * 0.75})`;
      context.lineWidth = 1.4 * (1 - t) + 0.3;
      context.beginPath();
      context.arc(cx, cy, 5 + ease * 30, 0, Math.PI * 2);
      context.stroke();
      if (t < 0.4) {
        const flashGlow = context.createRadialGradient(cx, cy, 0, cx, cy, 16);
        flashGlow.addColorStop(0, `rgba(255,248,236,${(1 - t / 0.4) * 0.9})`);
        flashGlow.addColorStop(1, "rgba(255,120,70,0)");
        context.fillStyle = flashGlow;
        context.beginPath();
        context.arc(cx, cy, 16, 0, Math.PI * 2);
        context.fill();
      }
      return true;
    });

    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    s.dirty = true;
  });

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[5] h-full w-full"
    />
  );
}
