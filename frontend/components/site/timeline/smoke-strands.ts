export type Wisp = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  carry: number;
  drift: number;
  age: number;
  life: number;
  seed: number;
  power: number;
};

export type Strand = { id: number; head: string; born: number; points: Wisp[] };

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number) => Math.min(1, Math.max(0, v));

export function spawnWisp(
  x: number,
  y: number,
  carry: number,
  power: number,
  drift = 0,
  lift = 1,
): Wisp {
  return {
    x: x + (Math.random() - 0.5) * 3,
    y: y - 3,
    vx: (Math.random() - 0.5) * 6,
    vy: -(30 + Math.random() * 14) * lift,
    carry: carry * (0.62 + Math.random() * 0.1),
    drift: drift * (0.62 + Math.random() * 0.1),
    age: 0,
    life: 1.5 + Math.random() * 1.1,
    seed: Math.random() * Math.PI * 2,
    power,
  };
}

export function stepStrands(strands: Strand[], seconds: number, time: number): Strand[] {
  return strands.filter((strand) => {
    strand.points = strand.points.filter((p) => {
      p.age += seconds;
      if (p.age >= p.life) return false;
      const n =
        Math.sin(p.y * 0.021 + time * 1.1 + strand.id * 1.9) +
        0.55 * Math.sin(p.y * 0.052 - time * 1.7 + strand.id * 0.7) +
        0.25 * Math.sin(p.x * 0.09 + time * 2.3 + p.seed);
      p.vx += n * (26 + p.age * 46) * seconds;
      p.vx *= 1 - 0.9 * seconds;
      p.vy -= 7 * seconds;
      p.carry *= Math.exp(-2.8 * seconds);
      p.drift *= Math.exp(-2.8 * seconds);
      p.x += (p.vx + p.drift) * seconds;
      p.y += (p.vy + p.carry) * seconds;
      return true;
    });
    return strand.points.length > 0;
  });
}

export function drawStrands(
  context: CanvasRenderingContext2D,
  strands: Strand[],
  ox: number,
  oy: number,
  dark: boolean,
) {
  context.globalCompositeOperation = "source-over";
  context.lineCap = "round";
  for (const strand of strands) {
    const points = strand.points;
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1];
      const b = points[i];
      const c = points[i + 1];
      if (Math.abs(a.y - c.y) > 70 || Math.abs(a.x - c.x) > 90) continue;
      const t = b.age / b.life;
      const fade = t < 0.06 ? t / 0.06 : Math.pow(1 - (t - 0.06) / 0.94, 1.5);
      const warm = clamp(1 - t / 0.3);
      const color = dark
        ? [mix(132, 255, warm), mix(124, 132, warm), mix(140, 100, warm)]
        : [mix(96, 150, warm), mix(90, 82, warm), mix(92, 60, warm)];
      const alpha = fade * b.power * (dark ? 0.58 : 0.42);
      const thickness = 0.6 + t * 2.8;
      const rgb = `${color[0] | 0},${color[1] | 0},${color[2] | 0}`;
      context.beginPath();
      context.moveTo(ox + (a.x + b.x) / 2, oy + (a.y + b.y) / 2);
      context.quadraticCurveTo(ox + b.x, oy + b.y, ox + (b.x + c.x) / 2, oy + (b.y + c.y) / 2);
      context.strokeStyle = `rgba(${rgb},${alpha * 0.2})`;
      context.lineWidth = thickness * 3.6;
      context.stroke();
      context.strokeStyle = `rgba(${rgb},${alpha})`;
      context.lineWidth = thickness;
      context.stroke();
    }
  }
}
