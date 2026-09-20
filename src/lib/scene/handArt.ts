import { mulberry32 } from '../game/rng';
import { closedSpline, createCanvas, fillShape, hatch, line, outlineShape } from './ink';
import type { Pt } from './ink';


// drawing units: wrist at the top of the palm, fingers hanging from the knuckle line
export const PALM_PX = { width: 170, height: 166 };
export const PALM_WRIST = { x: 85, y: 10 };
export const KNUCKLE_Y = 146;

export const FINGER_X = [39, 70, 101, 131] as const;

export const SEGMENT_WIDTH = 44;
export const SEGMENT_ANCHOR = { x: 22, y: 8 };
export const SEGMENT_LENGTHS = [62, 44, 38] as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function drawPalm(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(PALM_PX.width, PALM_PX.height);
  const rand = mulberry32(101);

  const palm = closedSpline([
    [50, 8], [85, 3], [120, 8], [140, 40], [154, 90], [152, 132], [132, 152], [85, 158], [38, 152], [18, 132], [16, 90], [30, 40],
  ]);
  const gradient = ctx.createLinearGradient(20, 0, 150, 0);
  gradient.addColorStop(0, '#dcd0b4');
  gradient.addColorStop(1, '#a89c82');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  palm.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();

  hatch(ctx, palm, {
    angle: 1.35,
    spacing: 4.6,
    width: 1.5,
    shade: (x, y) => clamp01((x - 100) / 55) * 0.8 + clamp01((y - 132) / 24) * 0.5 + clamp01((26 - y) / 20) * 0.4,
  }, rand);

  FINGER_X.forEach((x, i) => {
    line(ctx, [[85 + (i - 1.5) * 10, 38], [(85 + x) / 2 + (i - 1.5) * 3, 80], [x, 122]], 1.8, rand, { taper: 0.9, color: '#8d8269' });
  });
  line(ctx, [[58, 20], [85, 25], [112, 20]], 2, rand);
  line(ctx, [[62, 31], [85, 36], [108, 31]], 1.5, rand);
  outlineShape(ctx, closedSpline([[106, 22], [122, 21], [128, 34], [114, 40]]), 2.2, rand);
  for (const x of FINGER_X) line(ctx, [[x - 13, 142], [x, 134], [x + 13, 142]], 2, rand, { color: '#6f6552' });
  outlineShape(ctx, palm, 3.8, rand);
  return canvas;
}

/** One bone of a finger (0 proximal, 1 middle, 2 distal). Only the sides are outlined so consecutive bones read as one finger. */
export function drawSegment(kind: 0 | 1 | 2): HTMLCanvasElement {
  const length = SEGMENT_LENGTHS[kind];
  const [canvas, ctx] = createCanvas(SEGMENT_WIDTH, length + 20);
  const rand = mulberry32(120 + kind);
  const top = SEGMENT_ANCHOR.y;
  const halfTop = [15, 14.5, 14][kind];
  const halfBottom = [14.5, 14, 11][kind];
  const overlap = kind === 2 ? 0 : 3;
  const bottom = top + length + overlap;
  const cx = 22;

  const outline: Pt[] =
    kind === 2
      ? closedSpline([[cx - halfTop, top], [cx + halfTop, top], [cx + halfBottom, bottom - 8], [cx + halfBottom * 0.6, bottom + 2], [cx, bottom + 5], [cx - halfBottom * 0.6, bottom + 2], [cx - halfBottom, bottom - 8]], 6)
      : [[cx - halfTop, top], [cx + halfTop, top], [cx + halfBottom, bottom], [cx - halfBottom, bottom]];

  const gradient = ctx.createLinearGradient(cx - 15, 0, cx + 15, 0);
  gradient.addColorStop(0, '#dcd0b4');
  gradient.addColorStop(1, '#a89c82');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  outline.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();

  hatch(ctx, outline, {
    angle: 1.55,
    spacing: 3.4,
    width: 1.4,
    shade: (x, y) => clamp01((x - (cx - 2)) / 12) * 0.9 + (kind === 2 ? clamp01((y - (bottom - 10)) / 12) * 0.4 : 0),
  }, rand);

  if (kind < 2) {
    for (const y of [bottom - 8, bottom - 4]) line(ctx, [[cx - halfBottom + 3, y], [cx, y + 2], [cx + halfBottom - 3, y]], 1.5, rand, { color: '#6f6552' });
  } else {
    const nail = closedSpline([[cx - 8, bottom - 24], [cx, bottom - 27], [cx + 8, bottom - 24], [cx + 7, bottom - 9], [cx, bottom - 5], [cx - 7, bottom - 9]]);
    fillShape(ctx, nail, '#e7dfc8');
    outlineShape(ctx, nail, 2, rand);
  }

  const edge = (side: -1 | 1): Pt[] => [[cx + side * halfTop, top], [cx + side * (halfTop + halfBottom) / 2 + side * 0.6, top + length * 0.5], [cx + side * halfBottom, bottom - (kind === 2 ? 8 : 0)]];
  line(ctx, edge(-1), 3.2, rand, { taper: 0 });
  line(ctx, edge(1), 3.2, rand, { taper: 0 });
  if (kind === 2) line(ctx, [[cx - halfBottom, bottom - 8], [cx - halfBottom * 0.6, bottom + 2], [cx, bottom + 5], [cx + halfBottom * 0.6, bottom + 2], [cx + halfBottom, bottom - 8]], 3.2, rand, { taper: 0 });
  return canvas;
}
