export type Pt = readonly [number, number];

/** Vector canvases were once drawn at this multiple of their logical size; pixel canvases ignore it. */
export const ART_SCALE = 2;

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

/** Smooth curve through the points. */
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

/** Smooth closed curve through the points. */
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
