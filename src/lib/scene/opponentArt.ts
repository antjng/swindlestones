import { SKIN_PALETTE, lit } from './handArt';
import type { Pt } from './ink';
import { blit, blob, dot, noise2, pixelCanvas, pixelCurve, pixelShape, plotLine, shadeLayer } from './pixel';

// The opponent in low-resolution pixel art, in the manner of a game that keeps
// its characters in near-total darkness: hooded robes that fade into black,
// a lined face lit only from below by the table's candles, enormous glowing
// eyes, grizzled hair. Every part bakes its own lighting into its pixels.

export const HEAD_PX = { width: 300, height: 320 };
export const TORSO_PX = { width: 620, height: 480 };
export const COWL_PX = { width: 620, height: 208 };
export const MOUSTACHE_BOX = { x: 90, y: 190, width: 120, height: 60 };
export const BEARD_BOX = { x: 70, y: 220, width: 160, height: 140 };
export const MOUTH_PX = { width: 56, height: 28 };

/** The strip of the head sprite that the animated eyes and brows are drawn over. */
export const EYES_STRIP = { width: 300, height: 72, top: 96 };

const ROBE = ['#020201', '#080604', '#120d08', '#1f160c', '#33240f', '#4d3716'];
const HAIR = ['#060605', '#171712', '#33332a', '#5f5f4a', '#96967c', '#c9c9a6'];
const WOOD = ['#120a04', '#2e1c0b', '#5a3a17', '#94622a'];
const ROPE = '#8a6e3a';
const ROPE_LIGHT = '#c8a85a';
const DARK = '#0a0803';

const HEAD_CX = HEAD_PX.width / 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const shift = (points: readonly Pt[], dx: number, dy: number): Pt[] => points.map(([x, y]) => [x + dx, y + dy]);
const mirror = (points: readonly Pt[], axis = HEAD_CX): Pt[] => points.map(([x, y]) => [2 * axis - x, y]);

/** The head, drawn small: a deep hood, a gaunt face lit from below, and a corded neck. */
export function drawHead(seed = 11): HTMLCanvasElement {
  const { width, height } = HEAD_PX;
  const cx = HEAD_CX;
  const canvas = pixelCanvas(width, height)[0];

  const neck = shadeLayer(width, height, (ctx) => pixelShape(ctx, [[cx - 48, 236], [cx - 52, 290], [cx - 72, 320], [cx + 72, 320], [cx + 52, 290], [cx + 48, 236]], '#000', 3), {
    palette: SKIN_PALETTE,
    shade: (x, y) => 0.05 + 0.28 * clamp01((y - 250) / 70) + (noise2(x, y, 6, seed) - 0.5) * 0.18 - 0.1 * clamp01((cx - x) / 50),
  });
  blit(canvas, neck);

  const hood = shadeLayer(width, height, (ctx) => pixelShape(ctx, [
    [cx - 126, 320], [cx - 130, 200], [cx - 110, 100], [cx - 64, 34], [cx, 10], [cx + 64, 34], [cx + 110, 100], [cx + 130, 200], [cx + 126, 320],
  ], '#000', 5), {
    palette: ROBE,
    shade: (x, y, edge) => 0.07 + 0.28 * clamp01((y - 170) / 150) + (noise2(x, y, 14, seed) - 0.5) * 0.12 + (edge && y > 190 ? 0.16 : 0),
  });
  blit(canvas, hood);

  const face = shadeLayer(width, height, (ctx) => pixelShape(ctx, [
    [cx, 40], [cx + 62, 60], [cx + 82, 118], [cx + 80, 186], [cx + 52, 240], [cx + 8, 264], [cx - 30, 258], [cx - 56, 236], [cx - 78, 188], [cx - 84, 120], [cx - 64, 60],
  ], '#000', 5), {
    palette: SKIN_PALETTE,
    shade: (x, y, edge) => {
      const nx = (x - cx) / 86;
      const ny = (y - 150) / 116;
      const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
      let v = 0.08 + 0.9 * lit(nx, ny, nz);
      // The nose catches light on its underside; the eye sockets, brow and cheek hollows fall into shadow.
      v += 0.3 * blob(x, y, cx + 4, 206, 15) - 0.22 * blob(x, y, cx - 24, 172, 16);
      v *= 1 - 0.8 * Math.max(blob(x, y, cx - 44, 132, 30), blob(x, y, cx + 44, 132, 30));
      v *= 1 - 0.55 * clamp01(1 - Math.abs(y - 106) / 15) * clamp01((92 - Math.abs(x - cx)) / 40);
      v *= 1 - 0.45 * Math.max(blob(x, y, cx - 58, 198, 27), blob(x, y, cx + 58, 198, 27));
      v *= 0.5 + 0.5 * clamp01((y - 46) / 140);
      v += (noise2(x, y, 7, seed) - 0.5) * 0.22 + (noise2(x, y, 3, seed + 4) - 0.5) * 0.1;
      if (edge) v += x < cx || y > 220 ? 0.18 : -0.08;
      return v;
    },
  });
  blit(canvas, face);

  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < 3; i++) pixelCurve(ctx, [[cx - 42, 70 + i * 13], [cx, 64 + i * 13], [cx + 42, 70 + i * 13]], DARK);
  pixelCurve(ctx, [[cx - 10, 150], [cx - 16, 184], [cx - 20, 202]], DARK);
  dot(ctx, cx - 9, 210, '#050402', 2);
  dot(ctx, cx + 9, 210, '#050402', 2);
  pixelCurve(ctx, [[cx - 26, 200], [cx - 36, 226], [cx - 38, 250]], DARK);
  pixelCurve(ctx, [[cx + 26, 200], [cx + 36, 226], [cx + 34, 246]], DARK);
  pixelCurve(ctx, [[cx - 66, 168], [cx - 56, 190], [cx - 44, 198]], '#1c1608');
  pixelCurve(ctx, [[cx + 66, 168], [cx + 56, 190], [cx + 44, 198]], '#1c1608');
  pixelCurve(ctx, [[cx - 20, 268], [cx, 262], [cx + 22, 268]], DARK);
  return canvas;
}

function boxLayer(
  box: { x: number; y: number; width: number; height: number },
  masks: readonly (readonly Pt[])[],
  samples: number,
  shade: (x: number, y: number, edge: number) => number,
): HTMLCanvasElement {
  return shadeLayer(box.width, box.height, (ctx) => masks.forEach((points) => pixelShape(ctx, shift(points, -box.x, -box.y), '#000', samples)), {
    palette: HAIR,
    shade: (x, y, edge) => shade(x + box.x, y + box.y, edge),
  });
}

/** The moustache, drawn in head coordinates and cropped to MOUSTACHE_BOX. */
export function drawMoustache(seed = 31): HTMLCanvasElement {
  const cx = HEAD_CX;
  const lobe: Pt[] = [[cx, 202], [cx + 18, 196], [cx + 40, 203], [cx + 56, 224], [cx + 50, 240], [cx + 30, 231], [cx + 12, 223]];
  return boxLayer(MOUSTACHE_BOX, [lobe, mirror(lobe)], 4, (x, y, edge) => {
    const strand = noise2(x, y * 0.3, 4, seed);
    return 0.22 + 0.4 * strand + 0.35 * clamp01((y - 208) / 30) + (edge ? 0.12 : 0) - 0.15 * clamp01((x - cx) / 60);
  });
}

/** A ragged grey beard. Drawn in head coordinates and cropped to BEARD_BOX. */
export function drawBeard(seed = 43): HTMLCanvasElement {
  const cx = HEAD_CX;
  const beard: Pt[] = [
    [cx - 64, 224], [cx - 70, 262], [cx - 58, 300], [cx - 46, 330], [cx - 30, 352], [cx - 18, 338], [cx - 6, 360], [cx + 8, 340], [cx + 22, 356],
    [cx + 34, 334], [cx + 50, 318], [cx + 62, 286], [cx + 68, 256], [cx + 62, 224], [cx + 34, 242], [cx, 248], [cx - 34, 242],
  ];
  return boxLayer(BEARD_BOX, [beard], 3, (x, y, edge) => {
    const strand = noise2(x, y * 0.22, 5, seed);
    const fine = noise2(x, y * 0.5, 2, seed + 8);
    return 0.16 + 0.34 * strand + 0.16 * fine + 0.24 * clamp01(1 - Math.abs(y - 282) / 70) - 0.24 * clamp01((x - cx - 18) / 50) + (edge ? 0.1 : 0);
  });
}

/** The dark inside of the mouth, shown when the jaw drops. */
export function drawMouth(): HTMLCanvasElement {
  const [canvas, ctx] = pixelCanvas(MOUTH_PX.width, MOUTH_PX.height);
  pixelShape(ctx, [[4, 10], [28, 3], [52, 10], [48, 22], [28, 27], [8, 22]], '#050302', 3);
  for (let i = 0; i < 5; i++) dot(ctx, 14 + i * 7, 8, '#c9c9a6', 1);
  for (let i = 0; i < 4; i++) dot(ctx, 17 + i * 7, 22, '#96967c', 1);
  dot(ctx, 24, 15, '#3a0f0a', 2);
  return canvas;
}

/** The habit: a black bell of cloth fading upward into shadow, a scapular, a rope cinch and a wooden cross. */
export function drawTorso(seed = 23): HTMLCanvasElement {
  const { width, height } = TORSO_PX;
  const cx = width / 2;
  const canvas = pixelCanvas(width, height)[0];

  const folds = (x: number, y: number) => 0.13 * Math.sin(x * 0.045 + noise2(x, y, 70, seed) * 5) * clamp01((y - 60) / 120);
  const robe = shadeLayer(width, height, (ctx) => pixelShape(ctx, [
    [cx - 40, 14], [cx + 40, 14], [cx + 130, 60], [cx + 224, 160], [cx + 268, 300], [cx + 288, 470], [cx - 288, 470], [cx - 268, 300], [cx - 224, 160], [cx - 130, 60],
  ], '#000', 6), {
    palette: ROBE,
    shade: (x, y, edge) => 0.05 + 0.34 * clamp01((y - 180) / 290) + folds(x, y) + (noise2(x, y, 10, seed) - 0.5) * 0.1 + (edge ? (x < cx ? 0.22 : 0.05) : 0),
  });
  blit(canvas, robe);

  const scapular = shadeLayer(width, height, (ctx) => pixelShape(ctx, [[cx - 66, 20], [cx + 66, 20], [cx + 80, 200], [cx + 88, 470], [cx - 88, 470], [cx - 80, 200]], '#000', 3), {
    palette: ROBE,
    shade: (x, y, edge) => 0.03 + 0.24 * clamp01((y - 220) / 250) + (noise2(x, y, 8, seed + 2) - 0.5) * 0.09 + (edge && x < cx ? 0.14 : 0),
  });
  blit(canvas, scapular);

  const ctx = canvas.getContext('2d')!;
  pixelCurve(ctx, [[cx - 190, 300], [cx - 60, 322], [cx + 60, 318], [cx + 200, 296]], ROPE, 2);
  pixelCurve(ctx, [[cx - 190, 296], [cx - 60, 318], [cx + 60, 314], [cx + 200, 292]], ROPE_LIGHT, 1);
  pixelCurve(ctx, [[cx - 46, 30], [cx - 18, 140], [cx, 176]], ROPE);
  pixelCurve(ctx, [[cx + 46, 30], [cx + 18, 140], [cx, 176]], ROPE);

  const cross = shadeLayer(width, height, (c) => {
    pixelShape(c, [[cx - 8, 172], [cx + 8, 172], [cx + 8, 240], [cx - 8, 240]], '#000', 1);
    pixelShape(c, [[cx - 26, 196], [cx + 26, 196], [cx + 26, 212], [cx - 26, 212]], '#000', 1);
  }, {
    palette: WOOD,
    shade: (x, y, edge) => 0.42 + 0.3 * clamp01((y - 172) / 68) - 0.18 * clamp01((x - cx) / 20) + (noise2(x, y, 4, seed + 6) - 0.5) * 0.3 - (edge ? 0.12 : 0),
  });
  blit(canvas, cross);
  return canvas;
}

/** The hood, bunched into a thick roll over the shoulders. */
export function drawCowl(seed = 71): HTMLCanvasElement {
  const { width, height } = COWL_PX;
  const cx = width / 2;
  const canvas = shadeLayer(width, height, (ctx) => pixelShape(ctx, [
    [cx - 280, 188], [cx - 240, 100], [cx - 130, 40], [cx, 22], [cx + 130, 40], [cx + 240, 100], [cx + 280, 188], [cx + 190, 180], [cx + 90, 130], [cx, 112], [cx - 90, 130], [cx - 190, 180],
  ], '#000', 5), {
    palette: ROBE,
    shade: (x, y, edge) => 0.06 + 0.18 * clamp01((y - 60) / 130) + 0.1 * Math.sin(x * 0.05 + noise2(x, y, 50, seed) * 4) + (noise2(x, y, 9, seed) - 0.5) * 0.1 + (edge ? (y < 110 ? 0.2 : 0.06) : 0),
  });
  const ctx = canvas.getContext('2d')!;
  pixelShape(ctx, [[cx - 90, 130], [cx, 112], [cx + 90, 130], [cx + 40, 152], [cx, 146], [cx - 40, 152]], '#010100', 3);
  return canvas;
}

export interface EyeState {
  /** 0 closed to 1 fully open (values above 1 are wide-eyed). */
  open: number;
  browRaise: number;
  /** Positive slopes the brows down toward the nose. */
  browTilt: number;
  browAsym: number;
  /** Pupil offset, each -1 to 1. */
  gazeX: number;
  gazeY: number;
}

function fillEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  const [x0, x1] = [Math.floor((cx - rx) / 4), Math.ceil((cx + rx) / 4)];
  const [y0, y1] = [Math.floor((cy - ry) / 4), Math.ceil((cy + ry) / 4)];
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = (px * 4 + 2 - cx) / rx;
      const dy = (py * 4 + 2 - cy) / ry;
      if (dx * dx + dy * dy <= 1) ctx.fillRect(px, py, 1, 1);
    }
  }
}

/** Draws huge, pale, glowing eyes with tiny pupils, heavy lids, and brows. */
export function drawEyes(ctx: CanvasRenderingContext2D, state: EyeState): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const cx = EYES_STRIP.width / 2;

  for (const side of [-1, 1] as const) {
    const ex = cx + side * 44;
    const ey = 36;
    const open = Math.max(state.open, 0.06);
    const halfH = 15 * Math.min(open, 1.25);

    fillEllipse(ctx, ex, ey, 26, halfH + 5, '#3d4a12');
    fillEllipse(ctx, ex, ey, 22, halfH, '#e8e6b4');
    fillEllipse(ctx, ex, ey, 12, Math.max(2, halfH - 5), '#fbf8d8');

    const px = ex + state.gazeX * 8 - 4;
    const py = ey + state.gazeY * 4 - 4;
    ctx.fillStyle = '#050402';
    ctx.fillRect(Math.floor(px / 4), Math.floor(py / 4), 2, 2);

    // Heavy upper lid, slanted by the brow.
    const innerDrop = state.browTilt * 7;
    const lidY = ey - halfH * 0.42;
    ctx.fillStyle = '#0d0a04';
    for (let dx = -28; dx <= 28; dx += 4) {
      const inner = side === 1 ? -dx : dx;
      const y = lidY + Math.max(0, inner / 28) * innerDrop * 0.8 - 1;
      const bottom = Math.floor(y / 4);
      for (let row = Math.floor((ey - halfH - 8) / 4); row <= bottom; row++) ctx.fillRect(Math.floor((ex + dx) / 4), row, 1, 1);
    }

    const asym = side === 1 ? state.browAsym : 0;
    const lift = (state.browRaise + asym) * 9;
    const outer: Pt = [ex + side * 26, ey - 22 - lift - innerDrop * 0.3];
    const inner: Pt = [ex - side * 22, ey - 16 - lift + innerDrop];
    plotLine(ctx, outer, inner, '#0d0a04', 2);
    plotLine(ctx, [outer[0], outer[1] - 4], [inner[0], inner[1] - 4], '#5f5f4a', 1);
  }
}
