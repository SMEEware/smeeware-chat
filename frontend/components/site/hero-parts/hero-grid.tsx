"use client";

import * as React from "react";

type Wave = { x: number; y: number; t: number };

const SPRING = 150;
const DAMPING = 16;

export function HeroGrid({
  host,
  interactive,
}: {
  host: React.RefObject<HTMLElement | null>;
  interactive: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const root = host.current;
    if (!canvas || !root) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const ambient =
      interactive && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let ratio = 1;
    let cell = 56;
    let cols = 0;
    let rows = 0;
    let restX = new Float32Array(0);
    let restY = new Float32Array(0);
    let posX = new Float32Array(0);
    let posY = new Float32Array(0);
    let velX = new Float32Array(0);
    let velY = new Float32Array(0);
    let heat = new Float32Array(0);

    const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false, strength: 0, seen: false };
    const waves: Wave[] = [];
    let blip = 0;
    let frame = 0;
    let running = false;
    let visible = true;
    let scrolling = 0;
    let last = performance.now();

    const layout = () => {
      const box = root.getBoundingClientRect();
      width = box.width;
      height = box.height;
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      cell = width < 640 ? 44 : 56;
      cols = Math.ceil(width / cell) + 3;
      rows = Math.ceil(height / cell) + 3;
      const ox = (width - (cols - 1) * cell) / 2;
      const oy = -cell;
      const count = cols * rows;
      restX = new Float32Array(count);
      restY = new Float32Array(count);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          restX[r * cols + c] = ox + c * cell;
          restY[r * cols + c] = oy + r * cell;
        }
      }
      posX = restX.slice();
      posY = restY.slice();
      velX = new Float32Array(count);
      velY = new Float32Array(count);
      heat = new Float32Array((cols - 1) * (rows - 1));
    };

    const cellAt = (x: number, y: number) => {
      const c = Math.floor((x - restX[0]) / cell);
      const r = Math.floor((y - restY[0]) / cell);
      if (c < 0 || r < 0 || c >= cols - 1 || r >= rows - 1) return -1;
      return r * (cols - 1) + c;
    };

    const warm = (x: number, y: number, amount: number) => {
      const index = cellAt(x, y);
      if (index >= 0) heat[index] = Math.min(1, heat[index] + amount);
    };

    const step = (seconds: number) => {
      const lens = pointer.strength;
      const reach = (cell * 3) ** 2;
      let motion = 0;

      for (let i = waves.length - 1; i >= 0; i--) {
        waves[i].t += seconds;
        if (waves[i].t > 1.3) waves.splice(i, 1);
      }

      for (let i = 0; i < restX.length; i++) {
        const rx = restX[i];
        const ry = restY[i];
        let tx = rx;
        let ty = ry;

        if (lens > 0.001) {
          const dx = rx - pointer.x;
          const dy = ry - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < reach * 4) {
            const d = Math.sqrt(d2) + 0.001;
            const push = lens * Math.exp(-d2 / reach) * cell * 0.42;
            tx += (dx / d) * push;
            ty += (dy / d) * push;
          }
        }

        for (const wave of waves) {
          const dx = rx - wave.x;
          const dy = ry - wave.y;
          const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
          const band = Math.exp(-(((d - wave.t * 600) / 46) ** 2)) * (1 - wave.t / 1.3);
          if (band > 0.002) {
            tx += (dx / d) * band * cell * 0.34;
            ty += (dy / d) * band * cell * 0.34;
          }
        }

        const ax = (tx - posX[i]) * SPRING - velX[i] * DAMPING;
        const ay = (ty - posY[i]) * SPRING - velY[i] * DAMPING;
        velX[i] += ax * seconds;
        velY[i] += ay * seconds;
        posX[i] += velX[i] * seconds;
        posY[i] += velY[i] * seconds;
        const settle = Math.abs(velX[i]) + Math.abs(velY[i]) + Math.abs(tx - posX[i]) + Math.abs(ty - posY[i]);
        if (settle > motion) motion = settle;
      }

      let warmth = 0;
      const decay = Math.exp(-1.6 * seconds);
      for (let i = 0; i < heat.length; i++) {
        heat[i] *= decay;
        if (heat[i] < 0.004) heat[i] = 0;
        if (heat[i] > warmth) warmth = heat[i];
      }
      return { motion, warmth };
    };

    const draw = () => {
      const dark = document.documentElement.classList.contains("dark");
      const red = dark ? "236,58,52" : "206,36,32";
      const ink = dark ? "255,246,240" : "28,20,18";
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const h = heat[r * (cols - 1) + c];
          if (h <= 0) continue;
          const a = r * cols + c;
          context.fillStyle = `rgba(${red},${h * (dark ? 0.15 : 0.09)})`;
          context.beginPath();
          context.moveTo(posX[a], posY[a]);
          context.lineTo(posX[a + 1], posY[a + 1]);
          context.lineTo(posX[a + cols + 1], posY[a + cols + 1]);
          context.lineTo(posX[a + cols], posY[a + cols]);
          context.closePath();
          context.fill();
        }
      }

      context.lineWidth = 1;
      context.strokeStyle = `rgba(${ink},${dark ? 0.034 : 0.05})`;
      context.beginPath();
      for (let r = 0; r < rows; r++) {
        const base = r * cols;
        context.moveTo(posX[base], posY[base]);
        for (let c = 1; c < cols; c++) context.lineTo(posX[base + c], posY[base + c]);
      }
      for (let c = 0; c < cols; c++) {
        context.moveTo(posX[c], posY[c]);
        for (let r = 1; r < rows; r++) context.lineTo(posX[r * cols + c], posY[r * cols + c]);
      }
      context.stroke();

      const lens = pointer.strength;
      if (lens < 0.01) return;

      const radius = cell * 3.4;
      const reach = radius * radius;
      const glow = (x: number, y: number) =>
        lens * Math.exp(-((x - pointer.x) ** 2 + (y - pointer.y) ** 2) / reach);
      const span = Math.ceil(radius / cell) + 2;
      const pc = Math.round((pointer.x - restX[0]) / cell);
      const pr = Math.round((pointer.y - restY[0]) / cell);

      const segment = (a: number, b: number) => {
        const g = glow((posX[a] + posX[b]) / 2, (posY[a] + posY[b]) / 2);
        if (g < 0.02) return;
        context.strokeStyle = `rgba(${ink},${g * (dark ? 0.12 : 0.14)})`;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(posX[a], posY[a]);
        context.lineTo(posX[b], posY[b]);
        context.stroke();
        context.strokeStyle = `rgba(${red},${g * 0.7})`;
        context.stroke();
      };

      for (let r = Math.max(0, pr - span); r <= Math.min(rows - 1, pr + span); r++) {
        for (let c = Math.max(0, pc - span); c <= Math.min(cols - 1, pc + span); c++) {
          const i = r * cols + c;
          if (c < cols - 1) segment(i, i + 1);
          if (r < rows - 1) segment(i, i + cols);
        }
      }
      for (let r = Math.max(0, pr - span); r <= Math.min(rows - 1, pr + span); r++) {
        for (let c = Math.max(0, pc - span); c <= Math.min(cols - 1, pc + span); c++) {
          const i = r * cols + c;
          const g = glow(posX[i], posY[i]);
          if (g < 0.1) continue;
          context.fillStyle = `rgba(${dark ? "255,222,212" : red},${g * 0.9})`;
          context.beginPath();
          context.arc(posX[i], posY[i], 1.2 + g * 0.8, 0, Math.PI * 2);
          context.fill();
        }
      }

      const index = cellAt(pointer.x, pointer.y);
      if (index < 0) return;
      const cr = Math.floor(index / (cols - 1));
      const cc = index % (cols - 1);
      const a = cr * cols + cc;
      const corners: [number, number, number][] = [
        [a, 1, 1],
        [a + 1, -1, 1],
        [a + cols, 1, -1],
        [a + cols + 1, -1, -1],
      ];
      context.strokeStyle = `rgba(${red},${0.9 * lens})`;
      context.lineWidth = 1.5;
      context.beginPath();
      for (const [v, sx, sy] of corners) {
        const x = posX[v] + sx * 3;
        const y = posY[v] + sy * 3;
        context.moveTo(x + sx * 8, y);
        context.lineTo(x, y);
        context.lineTo(x, y + sy * 8);
      }
      context.stroke();
    };

    const loop = (now: number) => {
      const seconds = Math.min(0.033, (now - last) / 1000);
      last = now;
      frame = 0;

      const target = pointer.active ? 1 : 0;
      pointer.strength +=
        (target - pointer.strength) * (1 - Math.exp(-(pointer.active ? 6 : 2.4) * seconds));
      const follow = 1 - Math.exp(-16 * seconds);
      pointer.x += (pointer.tx - pointer.x) * follow;
      pointer.y += (pointer.ty - pointer.y) * follow;
      if (pointer.active) warm(pointer.x, pointer.y, seconds * 2.2);

      const calm = now > scrolling;
      blip -= seconds;
      if (ambient && calm && blip <= 0 && !pointer.active) {
        blip = 0.25 + Math.random() * 0.6;
        warm(
          width * (0.06 + Math.random() * 0.88),
          height * (0.04 + Math.random() * 0.78),
          0.28 + Math.random() * 0.3,
        );
      }

      const { motion, warmth } = step(seconds);
      draw();

      const active =
        pointer.active ||
        pointer.strength > 0.01 ||
        waves.length > 0 ||
        motion > 0.05 ||
        (warmth > 0 && calm);
      if (visible && (active || (ambient && calm))) frame = requestAnimationFrame(loop);
      else running = false;
    };

    const wake = () => {
      if (running || !visible) return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };

    const local = (clientX: number, clientY: number) => {
      const box = root.getBoundingClientRect();
      return { x: clientX - box.left, y: clientY - box.top };
    };

    const move = (clientX: number, clientY: number) => {
      const point = local(clientX, clientY);
      pointer.tx = point.x;
      pointer.ty = point.y;
      if (!pointer.seen) {
        pointer.x = point.x;
        pointer.y = point.y;
        pointer.seen = true;
      }
      pointer.active = true;
      wake();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch") move(event.clientX, event.clientY);
    };
    const onPointerLeave = () => {
      pointer.active = false;
      pointer.seen = false;
      wake();
    };
    const onPointerDown = (event: PointerEvent) => {
      const point = local(event.clientX, event.clientY);
      waves.push({ x: point.x, y: point.y, t: 0 });
      warm(point.x, point.y, 1);
      for (let k = 0; k < 8; k++) {
        const angle = (k / 8) * Math.PI * 2;
        warm(point.x + Math.cos(angle) * cell, point.y + Math.sin(angle) * cell, 0.5);
      }
      wake();
    };
    const onTouch = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) move(touch.clientX, touch.clientY);
    };
    const onScroll = () => {
      scrolling = performance.now() + 260;
      if (!pointer.active && pointer.strength < 0.01 && waves.length === 0) return;
      wake();
    };
    const onScrollEnd = () => {
      scrolling = 0;
      wake();
    };

    layout();
    draw();

    const resize = new ResizeObserver(() => {
      layout();
      draw();
      wake();
    });
    resize.observe(root);

    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) wake();
    });
    seen.observe(root);

    let idle: ReturnType<typeof setTimeout> | null = null;
    const scrollWatch = () => {
      onScroll();
      if (idle) clearTimeout(idle);
      idle = setTimeout(onScrollEnd, 280);
    };

    if (ambient) {
      root.addEventListener("pointermove", onPointerMove);
      root.addEventListener("pointerleave", onPointerLeave);
      root.addEventListener("pointerdown", onPointerDown);
      root.addEventListener("touchstart", onTouch, { passive: true });
      root.addEventListener("touchmove", onTouch, { passive: true });
      root.addEventListener("touchend", onPointerLeave);
      window.addEventListener("scroll", scrollWatch, { passive: true });
      wake();
    }

    return () => {
      cancelAnimationFrame(frame);
      if (idle) clearTimeout(idle);
      resize.disconnect();
      seen.disconnect();
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", onPointerLeave);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("touchstart", onTouch);
      root.removeEventListener("touchmove", onTouch);
      root.removeEventListener("touchend", onPointerLeave);
      window.removeEventListener("scroll", scrollWatch);
    };
  }, [host, interactive]);

  return (
    <canvas ref={canvasRef} aria-hidden className="hero-grid-canvas absolute inset-0 size-full" />
  );
}
