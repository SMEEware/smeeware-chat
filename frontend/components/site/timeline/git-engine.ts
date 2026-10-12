export type GitKind =
  | "root"
  | "commit"
  | "fork"
  | "merge"
  | "tag"
  | "lock"
  | "head"
  | "card"
  | "pass";

export type GitPoint = { x: number; y: number; kind: GitKind };

export type GitLayout = {
  width: number;
  height: number;
  points: Record<string, GitPoint>;
};

export type GitPathSpec = {
  id: string;
  ids: string[];
  tone: "main" | "ghost";
  comet?: boolean;
};

export type GitTrace = {
  id: string;
  d: string;
  tone: GitPathSpec["tone"];
  comet: boolean;
  samples: { x: number; y: number }[];
  start: number;
  end: number;
};

const TURN = 46;
const SWEEP = 120;

type Point = { x: number; y: number };

function bezier(a: Point, c1: Point, c2: Point, b: Point, steps: number, out: Point[]) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    });
  }
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

export function buildTrace(spec: GitPathSpec, layout: GitLayout): GitTrace | null {
  const points = spec.ids
    .map((id) => layout.points[id])
    .filter((point): point is GitPoint => Boolean(point));
  if (points.length < 2) return null;

  const first = points[0];
  let d = `M ${round(first.x)} ${round(first.y)}`;
  const samples: Point[] = [{ x: first.x, y: first.y }];

  const curve = (a: Point, c1: Point, c2: Point, b: Point, steps: number) => {
    d += ` C ${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(b.x)} ${round(b.y)}`;
    bezier(a, c1, c2, b, steps, samples);
  };
  const line = (b: Point) => {
    d += ` L ${round(b.x)} ${round(b.y)}`;
    samples.push({ x: b.x, y: b.y });
  };

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = Math.max(1, b.y - a.y);

    if (Math.abs(dx) < 0.5) {
      line(b);
      continue;
    }

    if (Math.abs(dx) > SWEEP) {
      curve(a, { x: a.x, y: a.y + dy * 0.5 }, { x: b.x, y: b.y - dy * 0.5 }, b, 48);
      continue;
    }

    const turn = Math.min(TURN, dy);
    const from = dx > 0 ? a.y : b.y - turn;
    const to = from + turn;
    if (from > a.y) line({ x: a.x, y: from });
    curve(
      { x: a.x, y: from },
      { x: a.x, y: from + turn / 2 },
      { x: b.x, y: to - turn / 2 },
      { x: b.x, y: to },
      18,
    );
    if (b.y > to) line(b);
  }

  return {
    id: spec.id,
    d,
    tone: spec.tone,
    comet: Boolean(spec.comet),
    samples,
    start: first.y,
    end: points[points.length - 1].y,
  };
}

export function xAt(samples: Point[], y: number): number {
  if (y <= samples[0].y) return samples[0].x;
  const last = samples[samples.length - 1];
  if (y >= last.y) return last.x;

  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (samples[mid].y <= y) low = mid;
    else high = mid;
  }
  const a = samples[low];
  const b = samples[high];
  const span = b.y - a.y;
  return span <= 0 ? b.x : a.x + ((y - a.y) / span) * (b.x - a.x);
}

export function countBelow(sorted: number[], y: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid] <= y) low = mid + 1;
    else high = mid;
  }
  return low;
}
