import type { Rng } from '../game/rng';

export type Pt = readonly [number, number];

export const INK = '#1b1510';

/** Sprites are drawn at this multiple of their logical size. */
export const ART_SCALE = 2;

export function createCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width * ART_SCALE;
  canvas.height = height * ART_SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(ART_SCALE, ART_SCALE);
  return [canvas, ctx];
}

function catmull(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const t2 = t * t;
  const t3 = t2 * t;
  const axis = (i: 0 | 1) =>
    0.5 *
    (2 * p1[i] +
      (-p0[i] + p2[i]) * t +
      (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
      (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
  return [axis(0), axis(1)];
}

export function spline(points: readonly Pt[], samples = 8): Pt[] {
  const out: Pt[] = [];
  const last = points.length - 1;
  for (let i = 0; i < last; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p3 = points[Math.min(i + 2, last)];
    for (let s = 0; s < samples; s++) out.push(catmull(p0, points[i], points[i + 1], p3, s / samples));
  }
  out.push(points[last]);
  return out;
}

export function closedSpline(points: readonly Pt[], samples = 8): Pt[] {
  const n = points.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < samples; s++) {
      out.push(catmull(points[(i + n - 1) % n], points[i], points[(i + 1) % n], points[(i + 2) % n], s / samples));
    }
  }
  return out;
}

export function tracePath(ctx: CanvasRenderingContext2D, points: readonly Pt[]): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

export function fillShape(ctx: CanvasRenderingContext2D, points: readonly Pt[], color: string): void {
  tracePath(ctx, points);
  ctx.fillStyle = color;
  ctx.fill();
}

interface StrokeOptions {
  color?: string;
  taper?: number;
  wobble?: number;
}

/** Variable-width pen stroke, drawn as a filled ribbon. */
export function penStroke(
  ctx: CanvasRenderingContext2D,
  points: readonly Pt[],
  width: number,
  rand: Rng,
  { color = INK, taper = 0.6, wobble = 0.5 }: StrokeOptions = {},
): void {
  const n = points.length;
  if (n < 2) return;
  const left: Pt[] = [];
  const right: Pt[] = [];
  const phase = rand() * 10;
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(i - 1, 0)];
    const next = points[Math.min(i + 1, n - 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const t = i / (n - 1);
    const profile = taper === 0 ? 1 : 0.2 + 0.8 * Math.pow(Math.sin(Math.PI * t), taper);
    const half = (width * profile) / 2;
    const drift = Math.sin(i * 0.5 + phase) * wobble;
    const [x, y] = points[i];
    left.push([x + nx * (half + drift), y + ny * (half + drift)]);
    right.push([x - nx * (half - drift), y - ny * (half - drift)]);
  }
  ctx.beginPath();
  left.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function outlineShape(
  ctx: CanvasRenderingContext2D,
  points: readonly Pt[],
  width: number,
  rand: Rng,
): void {
  penStroke(ctx, [...points, points[0], points[1]], width, rand, { taper: 0, wobble: 0.7 });
}

export function line(
  ctx: CanvasRenderingContext2D,
  controls: readonly Pt[],
  width: number,
  rand: Rng,
  options?: StrokeOptions,
): void {
  penStroke(ctx, spline(controls, 8), width, rand, options);
}

interface HatchOptions {
  angle: number;
  spacing: number;
  width: number;
  shade: (x: number, y: number) => number;
  color?: string;
}

/** Hatching inside a region: each line only inks where the shade exceeds its own random threshold. */
export function hatch(
  ctx: CanvasRenderingContext2D,
  region: readonly Pt[],
  { angle, spacing, width, shade, color = INK }: HatchOptions,
  rand: Rng,
): void {
  const xs = region.map((p) => p[0]);
  const ys = region.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const reach = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
  const dir: Pt = [Math.cos(angle), Math.sin(angle)];
  const nrm: Pt = [-dir[1], dir[0]];

  ctx.save();
  tracePath(ctx, region);
  ctx.clip();

  for (let offset = -reach; offset < reach; offset += spacing * (0.8 + rand() * 0.4)) {
    const threshold = rand();
    let run: Pt[] = [];
    const flush = () => {
      if (run.length > 1) penStroke(ctx, run, width * (0.7 + rand() * 0.6), rand, { color, taper: 0.8, wobble: 0.4 });
      run = [];
    };
    for (let s = -reach; s < reach; s += 5) {
      const x = cx + dir[0] * s + nrm[0] * offset;
      const y = cy + dir[1] * s + nrm[1] * offset;
      if (shade(x, y) > threshold * 0.95) {
        run.push([x + (rand() - 0.5) * 0.8, y + (rand() - 0.5) * 0.8]);
      } else {
        flush();
      }
    }
    flush();
  }
  ctx.restore();
}
