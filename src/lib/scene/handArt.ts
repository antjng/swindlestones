import { mulberry32 } from '../game/rng';
import { closedSpline, createCanvas, fillShape, hatch, line, outlineShape, paperGrain } from './ink';
import type { Pt } from './ink';


// drawing units: wrist at the top of the palm, fingers hanging from the knuckle line
export const PALM_PX = { width: 150, height: 150 };
export const PALM_WRIST = { x: 75, y: 8 };
export const KNUCKLE_Y = 130;

export const FINGER_X = [34, 59, 84, 109] as const;

export const SEGMENT_WIDTH = 36;
export const SEGMENT_ANCHOR = { x: 18, y: 8 };
export const SEGMENT_LENGTHS = [50, 36, 30] as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function drawPalm(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(PALM_PX.width, PALM_PX.height);
  const rand = mulberry32(101);

  const palm = closedSpline([
    [46, 6], [75, 2], [104, 6], [124, 40], [132, 86], [129, 124], [112, 138], [75, 144], [38, 138], [21, 124], [18, 86], [26, 40],
  ]);
  const gradient = ctx.createLinearGradient(18, 0, 132, 0);
  gradient.addColorStop(0, '#e0d4b7');
  gradient.addColorStop(1, '#a99c82');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  palm.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();

  hatch(ctx, palm, {
    angle: 1.35,
    spacing: 3.8,
    width: 1.2,
    shade: (x, y) => clamp01((x - 88) / 46) * 0.8 + clamp01((y - 116) / 22) * 0.5 + clamp01((22 - y) / 18) * 0.4,
  }, rand);

  // Tendons over the back of the hand, wrist creases, the knob of the ulna.
  FINGER_X.forEach((x, i) => {
    line(ctx, [[75 + (i - 1.5) * 9, 32], [(75 + x) / 2 + (i - 1.5) * 2, 72], [x, 112]], 1.4, rand, { taper: 0.9, color: '#8d8269' });
  });
  line(ctx, [[52, 18], [75, 22], [98, 18]], 1.6, rand);
  line(ctx, [[55, 27], [75, 31], [95, 27]], 1.2, rand);
  outlineShape(ctx, closedSpline([[92, 19], [106, 18], [111, 29], [98, 34]]), 1.6, rand);
  for (const x of FINGER_X) line(ctx, [[x - 10, 126], [x, 120], [x + 10, 126]], 1.4, rand, { color: '#6f6552' });
  outlineShape(ctx, palm, 2.2, rand);
  paperGrain(ctx, PALM_PX.width, PALM_PX.height, rand);
  return canvas;
}

/** One bone of a finger (0 proximal, 1 middle, 2 distal). Only the sides are outlined so consecutive bones read as one finger. */
export function drawSegment(kind: 0 | 1 | 2): HTMLCanvasElement {
  const length = SEGMENT_LENGTHS[kind];
  const [canvas, ctx] = createCanvas(SEGMENT_WIDTH, length + 20);
  const rand = mulberry32(120 + kind);
  const top = SEGMENT_ANCHOR.y;
  const halfTop = [11.5, 11, 10.5][kind];
  const halfBottom = [11, 10.5, 8.5][kind];
  const overlap = kind === 2 ? 0 : 3;
  const bottom = top + length + overlap;
  const cx = SEGMENT_ANCHOR.x;

  const outline: Pt[] =
    kind === 2
      ? closedSpline([[cx - halfTop, top], [cx + halfTop, top], [cx + halfBottom, bottom - 7], [cx + halfBottom * 0.6, bottom + 2], [cx, bottom + 4], [cx - halfBottom * 0.6, bottom + 2], [cx - halfBottom, bottom - 7]], 6)
      : [[cx - halfTop, top], [cx + halfTop, top], [cx + halfBottom, bottom], [cx - halfBottom, bottom]];

  const gradient = ctx.createLinearGradient(cx - 12, 0, cx + 12, 0);
  gradient.addColorStop(0, '#e0d4b7');
  gradient.addColorStop(1, '#a99c82');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  outline.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();

  hatch(ctx, outline, {
    angle: 1.55,
    spacing: 3,
    width: 1.1,
    shade: (x, y) => clamp01((x - (cx - 2)) / 10) * 0.9 + (kind === 2 ? clamp01((y - (bottom - 9)) / 10) * 0.4 : 0),
  }, rand);

  // Creases across the joint at the bottom of the bone; a nail on the fingertip.
  if (kind < 2) {
    for (const y of [bottom - 7, bottom - 3.5]) line(ctx, [[cx - halfBottom + 3, y], [cx, y + 1.5], [cx + halfBottom - 3, y]], 1.1, rand, { color: '#6f6552' });
  } else {
    const nail = closedSpline([[cx - 6, bottom - 20], [cx, bottom - 22], [cx + 6, bottom - 20], [cx + 5.5, bottom - 7], [cx, bottom - 4], [cx - 5.5, bottom - 7]]);
    fillShape(ctx, nail, '#e7dfc8');
    outlineShape(ctx, nail, 1.4, rand);
  }

  // Outline the sides and the tip only, so the joints stay open.
  const edge = (side: -1 | 1): Pt[] => [[cx + side * halfTop, top], [cx + side * (halfTop + halfBottom) / 2 + side * 0.5, top + length * 0.5], [cx + side * halfBottom, bottom - (kind === 2 ? 7 : 0)]];
  line(ctx, edge(-1), 2.2, rand, { taper: 0 });
  line(ctx, edge(1), 2.2, rand, { taper: 0 });
  if (kind === 2) line(ctx, [[cx - halfBottom, bottom - 7], [cx - halfBottom * 0.6, bottom + 2], [cx, bottom + 4], [cx + halfBottom * 0.6, bottom + 2], [cx + halfBottom, bottom - 7]], 2.2, rand, { taper: 0 });
  paperGrain(ctx, SEGMENT_WIDTH, length + 20, rand);
  return canvas;
}
