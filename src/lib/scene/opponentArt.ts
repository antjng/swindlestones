import { mulberry32 } from '../game/rng';
import { INK, closedSpline, createCanvas, fillShape, hatch, line, outlineShape, tracePath } from './ink';
import type { Pt } from './ink';

export const HEAD_PX = { width: 480, height: 640 };
const TORSO_PX = { width: 640, height: 560 };
const MANTLE_PX = { width: 640, height: 260 };
export const SLEEVE_PX = { width: 130, height: 440 };
export const MOUSTACHE_BOX = { x: 140, y: 372, width: 200, height: 100 };
export const BEARD_BOX = { x: 110, y: 420, width: 260, height: 250 };
const MOUTH_PX = { width: 64, height: 32 };

/** The strip of the head sprite that the animated eyes and brows are drawn over. */
export const EYES_STRIP = { width: 480, height: 110, top: 262 };

const CLOTH = '#2b2420';
const CLOTH_DEEP = '#100c0a';
const CLOTH_LIGHT = '#8a7c69';
const HOLLOW = '#070504';
const FUR = '#7a6f60';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function fillGradient(ctx: CanvasRenderingContext2D, shape: readonly Pt[], from: string, to: string, x0: number, x1: number): void {
  const gradient = ctx.createLinearGradient(x0, 0, x1, 0);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  tracePath(ctx, shape);
  ctx.fill();
}

/** Cloth lit from the upper left: pale ridges on the left of each fold, deep valleys and hatching on the right. */
function drapeCloth(
  ctx: CanvasRenderingContext2D,
  shape: readonly Pt[],
  rand: () => number,
  centerX: number,
  span: number,
  top: number,
  bottom: number,
  folds: number,
): void {
  ctx.save();
  tracePath(ctx, shape);
  ctx.clip();
  hatch(ctx, shape, {
    angle: 1.5,
    spacing: 6,
    width: 2,
    shade: (x, y) => clamp01(((x - centerX) / span) * 0.9 + 0.1 + (y - top) / (bottom - top) * 0.25),
    color: CLOTH_DEEP,
  }, rand);
  hatch(ctx, shape, {
    angle: 1.5,
    spacing: 8,
    width: 1.6,
    shade: (x) => clamp01(((centerX - x) / span) * 0.75 - 0.1),
    color: CLOTH_LIGHT,
  }, rand);
  for (const side of [-1, 1]) {
    for (let i = 0; i < folds; i++) {
      const s = (i + 1) / folds;
      const bend = (i % 2 === 0 ? 1 : -1) * 14;
      const fold: Pt[] = [
        [centerX + side * span * 0.12 * s, top],
        [centerX + side * span * (0.3 + 0.55 * s) + bend, top + (bottom - top) * 0.35],
        [centerX + side * span * (0.4 + 0.6 * s), top + (bottom - top) * 0.7],
        [centerX + side * span * (0.45 + 0.62 * s) - bend * 0.5, bottom],
      ];
      line(ctx, fold, 4.2, rand, { color: CLOTH_DEEP, taper: 0.9 });
      line(ctx, fold.map(([x, y]) => [x - side * 5, y] as Pt), 2.4, rand, { color: CLOTH_LIGHT, taper: 0.9 });
    }
  }
  ctx.restore();
}

function furStrokes(
  ctx: CanvasRenderingContext2D,
  region: readonly Pt[],
  rand: () => number,
  count: number,
  origin: Pt,
  length: number,
): void {
  const xs = region.map((p) => p[0]);
  const ys = region.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  ctx.save();
  tracePath(ctx, region);
  ctx.clip();
  const colors = ['#b0a48c', '#463e34', '#d6cab2', '#5e5446', '#8f846f'];
  for (let i = 0; i < count; i++) {
    const x = x0 + rand() * (x1 - x0);
    const y = y0 + rand() * (y1 - y0);
    const away = Math.atan2(y - origin[1], x - origin[0]);
    const angle = away + (rand() - 0.5) * 0.9;
    const size = length * (0.6 + rand() * 0.8);
    line(ctx, [[x, y], [x + Math.cos(angle) * size * 0.5 + (rand() - 0.5) * 3, y + Math.sin(angle) * size * 0.5], [x + Math.cos(angle) * size, y + Math.sin(angle) * size]], 1.3 + rand() * 1.4, rand, { color: colors[Math.floor(rand() * colors.length)], taper: 0.7 });
  }
  ctx.restore();
}

/** Hood and face. The moustache, beard, eyes and mouth are separate layers. */
export function drawHead(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(HEAD_PX.width, HEAD_PX.height);
  const rand = mulberry32(11);

  const hood = closedSpline([
    [240, 10], [258, 52], [308, 128], [372, 252], [410, 402], [436, 542], [424, 622],
    [240, 638], [56, 622], [44, 542], [70, 402], [108, 252], [172, 128], [222, 52],
  ]);
  fillGradient(ctx, hood, '#3a312b', CLOTH_DEEP, 60, 420);
  drapeCloth(ctx, hood, rand, 240, 190, 40, 620, 6);
  line(ctx, [[222, 52], [172, 128], [108, 252], [70, 402], [46, 542]], 4, rand, { color: CLOTH_LIGHT, taper: 0.8 });
  outlineShape(ctx, hood, 6, rand);

  const opening = closedSpline([
    [240, 166], [292, 208], [320, 300], [314, 402], [282, 474], [240, 506], [198, 474], [166, 402], [160, 300], [188, 208],
  ]);
  fillShape(ctx, opening, HOLLOW);
  line(ctx, [...opening.slice(opening.length * 0.62 | 0), ...opening.slice(0, opening.length * 0.1 | 0)], 7, rand, { color: '#5d5142', taper: 0.7 });
  line(ctx, opening.slice(opening.length * 0.1 | 0, opening.length * 0.45 | 0), 5, rand, { color: '#3f352c', taper: 0.7 });

  const face = closedSpline([
    [240, 192], [286, 226], [304, 304], [296, 398], [268, 458], [240, 486], [212, 458], [184, 398], [176, 304], [194, 226],
  ]);
  fillGradient(ctx, face, '#e0d4b8', '#9a8e76', 176, 304);
  hatch(ctx, face, {
    angle: 1.25,
    spacing: 4.2,
    width: 2,
    shade: (x, y) => {
      const edge = clamp01(Math.pow(Math.abs(x - 240) / 64, 2) * 1.15);
      const brow = clamp01((272 - y) / 52);
      const hollow =
        Math.max(0, 0.95 - Math.hypot(x - 204, y - 394) / 30) + Math.max(0, 0.95 - Math.hypot(x - 278, y - 394) / 30);
      const right = clamp01((x - 250) / 40) * 0.5;
      return clamp01(edge * 0.9 + brow + hollow + right);
    },
  }, rand);
  hatch(ctx, face, {
    angle: 0.35,
    spacing: 5,
    width: 1.5,
    shade: (x, y) => clamp01((Math.hypot(x - 280, y - 400) < 34 ? 1 : 0) + clamp01((y - 300) / 40) * clamp01((x - 270) / 26)),
  }, rand);

  for (const cx of [212, 268]) {
    fillShape(ctx, closedSpline([[cx - 22, 322], [cx - 6, 308], [cx + 16, 310], [cx + 24, 324], [cx + 4, 338], [cx - 16, 335]]), HOLLOW);
    line(ctx, [[cx - 26, 316], [cx - 4, 300], [cx + 22, 304], [cx + 28, 320]], 3, rand);
    line(ctx, [[cx - 20, 346], [cx, 354], [cx + 22, 346]], 2.2, rand);
    line(ctx, [[cx - 14, 356], [cx + 2, 362], [cx + 20, 356]], 1.6, rand);
    const side = cx < 240 ? -1 : 1;
    for (let i = 0; i < 3; i++) line(ctx, [[cx + side * 26, 322 + i * 5], [cx + side * (36 + i * 2), 318 + i * 9]], 1.5, rand, { taper: 0.9 });
  }
  for (let i = 0; i < 4; i++) line(ctx, [[202, 238 + i * 9], [240, 232 + i * 9 - (i === 3 ? 0 : 2)], [278, 238 + i * 9]], 2.2, rand, { taper: 0.8 });
  line(ctx, [[232, 272], [230, 296]], 2.4, rand, { taper: 0.9 });
  line(ctx, [[248, 272], [250, 296]], 2.4, rand, { taper: 0.9 });
  line(ctx, [[184, 352], [198, 386], [220, 402]], 3, rand);
  line(ctx, [[296, 352], [282, 386], [262, 402]], 3, rand);
  line(ctx, [[226, 410], [212, 430], [206, 452]], 2.4, rand, { taper: 0.9 });
  line(ctx, [[254, 410], [268, 430], [274, 452]], 2.4, rand, { taper: 0.9 });
  line(ctx, [[236, 322], [232, 356], [224, 392], [236, 410]], 3.4, rand);
  line(ctx, [[246, 332], [252, 368], [260, 398], [246, 412]], 2.8, rand);
  fillShape(ctx, closedSpline([[230, 404], [240, 398], [250, 404], [240, 414]]), HOLLOW);
  line(ctx, [[222, 398], [228, 408], [238, 412]], 2.2, rand);
  line(ctx, [[258, 398], [252, 408], [244, 412]], 2.2, rand);
  outlineShape(ctx, face, 4, rand);
  return canvas;
}

/** The moustache, drawn in head coordinates and cropped to MOUSTACHE_BOX. */
export function drawMoustache(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(MOUSTACHE_BOX.width, MOUSTACHE_BOX.height);
  ctx.translate(-MOUSTACHE_BOX.x, -MOUSTACHE_BOX.y);
  const rand = mulberry32(31);

  for (const side of [-1, 1]) {
    const lobe = closedSpline([
      [240 + side * 2, 404], [240 + side * 30, 392], [240 + side * 70, 400], [240 + side * 98, 428], [240 + side * 104, 462],
      [240 + side * 86, 452], [240 + side * 60, 436], [240 + side * 30, 432],
    ]);
    fillGradient(ctx, lobe, '#d8cfb8', '#8f8672', 140, 340);
    ctx.save();
    tracePath(ctx, lobe);
    ctx.clip();
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      line(ctx, [
        [240 + side * (6 + t * 44), 402 + t * 14],
        [240 + side * (30 + t * 56), 416 + t * 10 + (rand() - 0.5) * 4],
        [240 + side * (60 + t * 44), 440 + t * 22],
      ], 1.6 + rand() * 1.2, rand, { color: i % 3 === 0 ? '#f0e8d4' : i % 3 === 1 ? '#6a6252' : '#3a342b', taper: 0.7 });
    }
    ctx.restore();
    outlineShape(ctx, lobe, 3.4, rand);
  }
  return canvas;
}

/** The beard, drawn in head coordinates and cropped to BEARD_BOX. */
export function drawBeard(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(BEARD_BOX.width, BEARD_BOX.height);
  ctx.translate(-BEARD_BOX.x, -BEARD_BOX.y);
  const rand = mulberry32(43);

  const beard = closedSpline([
    [188, 426], [176, 470], [168, 530], [182, 590], [212, 634], [226, 668], [240, 640], [254, 670], [268, 634], [298, 590],
    [312, 530], [304, 470], [292, 426], [268, 448], [240, 454], [212, 448],
  ]);
  fillGradient(ctx, beard, '#cfc6b0', '#7d7565', 170, 312);

  ctx.save();
  tracePath(ctx, beard);
  ctx.clip();
  for (let lock = 0; lock < 9; lock++) {
    const startX = 186 + lock * 13.5;
    const sway = (lock - 4) * 5;
    for (let i = 0; i < 20; i++) {
      const x = startX + (rand() - 0.5) * 12;
      const endX = 240 + (x - 240) * (0.3 + rand() * 0.2) + sway * 0.5 + (rand() - 0.5) * 8;
      const endY = 600 + rand() * 66 - Math.abs(x - 240) * 0.5;
      line(ctx, [[x, 440 + rand() * 10], [x + sway * 0.4 + (rand() - 0.5) * 8, 520 + rand() * 20], [endX, endY]], 1.2 + rand() * 1.5, rand, {
        color: ['#f2ead6', '#a89f8b', '#514a3f', '#e0d7c2'][Math.floor(rand() * 4)],
        taper: 0.6,
      });
    }
    line(ctx, [[startX + 6, 452], [startX + 6 + sway * 0.4, 540], [240 + (startX - 240) * 0.4, 620]], 2.2, rand, { color: '#2e2921', taper: 0.9 });
  }
  hatch(ctx, beard, {
    angle: 1.6,
    spacing: 6,
    width: 1.6,
    shade: (x, y) => clamp01((x - 250) / 60) * 0.7 + clamp01((y - 600) / 50) * 0.3,
    color: '#2a251d',
  }, rand);
  ctx.restore();
  outlineShape(ctx, beard, 3.6, rand);
  return canvas;
}

export function drawMouth(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(MOUTH_PX.width, MOUTH_PX.height);
  const rand = mulberry32(59);
  const mouth = closedSpline([[6, 12], [32, 4], [58, 12], [54, 24], [32, 30], [10, 24]]);
  fillShape(ctx, mouth, '#0b0605');
  for (let i = 0; i < 6; i++) {
    const x = 16 + i * 6.5;
    fillShape(ctx, closedSpline([[x - 2.6, 8], [x + 2.6, 8], [x + 2, 14], [x - 2, 14]]), '#d6cdb6');
  }
  line(ctx, [[12, 24], [32, 28], [52, 24]], 2, rand, { color: '#5a2a24' });
  return canvas;
}

export function drawTorso(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(TORSO_PX.width, TORSO_PX.height);
  const rand = mulberry32(23);

  const robe = closedSpline([
    [320, 16], [400, 30], [486, 96], [566, 210], [606, 360], [620, 548], [320, 556], [20, 548], [34, 360], [74, 210], [154, 96], [240, 30],
  ]);
  fillGradient(ctx, robe, '#3a312b', CLOTH_DEEP, 40, 560);
  drapeCloth(ctx, robe, rand, 320, 300, 90, 550, 6);
  line(ctx, [[240, 32], [156, 98], [78, 210], [38, 360], [24, 540]], 4.4, rand, { color: CLOTH_LIGHT, taper: 0.8 });
  return canvas;
}

export function drawMantle(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(MANTLE_PX.width, MANTLE_PX.height);
  const rand = mulberry32(71);

  const mantle = closedSpline([
    [100, 130], [190, 56], [320, 32], [450, 56], [540, 130], [572, 208], [480, 244], [320, 208], [160, 244], [68, 208],
  ]);
  fillGradient(ctx, mantle, '#8a7f6e', '#4a4237', 60, 580);
  furStrokes(ctx, mantle, rand, 900, [320, 60], 34);
  hatch(ctx, mantle, {
    angle: 0.5,
    spacing: 7,
    width: 1.8,
    shade: (x, y) => clamp01((x - 330) / 200) * 0.6 + clamp01((y - 190) / 50) * 0.7,
    color: '#1d1813',
  }, rand);
  outlineShape(ctx, mantle, 4.5, rand);

  const [bx, by] = [320, 200];
  ctx.beginPath();
  ctx.arc(bx, by, 24, 0, Math.PI * 2);
  ctx.fillStyle = '#b8923d';
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bx, by, 15, 0, Math.PI * 2);
  ctx.strokeStyle = '#6b5420';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bx, by, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#8a1f1f';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bx - 9, by - 10, 5, Math.PI, Math.PI * 1.6);
  ctx.strokeStyle = '#f3dc96';
  ctx.lineWidth = 3;
  ctx.stroke();
  return canvas;
}

/** A bell sleeve with a fur cuff; stretched to reach the hand. */
export function drawSleeve(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(SLEEVE_PX.width, SLEEVE_PX.height);
  const rand = mulberry32(37);

  const sleeve = closedSpline([
    [28, 60], [65, 16], [102, 60], [104, 200], [112, 330], [124, 388], [65, 396], [6, 388], [18, 330], [26, 200],
  ]);
  fillGradient(ctx, sleeve, '#3a312b', CLOTH_DEEP, 10, 120);
  drapeCloth(ctx, sleeve, rand, 65, 60, 40, 390, 3);
  line(ctx, [[30, 60], [22, 200], [12, 330], [8, 388]], 3.6, rand, { color: CLOTH_LIGHT, taper: 0.8 });
  outlineShape(ctx, sleeve, 4, rand);

  const cuff = closedSpline([[4, 384], [65, 392], [126, 384], [130, 420], [98, 436], [65, 432], [30, 436], [2, 420]]);
  fillGradient(ctx, cuff, '#8a7f6e', '#4a4237', 0, 130);
  furStrokes(ctx, cuff, rand, 160, [65, 340], 16);
  outlineShape(ctx, cuff, 3.6, rand);
  return canvas;
}

export interface EyeState {
  open: number;
  browRaise: number;
  /** Positive slopes the brows down toward the nose. */
  browTilt: number;
  browAsym: number;
  gazeX: number;
  gazeY: number;
}

export function drawEyes(ctx: CanvasRenderingContext2D, state: EyeState): void {
  const rand = mulberry32(67);
  ctx.clearRect(0, 0, EYES_STRIP.width, EYES_STRIP.height);

  for (const side of [-1, 1] as const) {
    const cx = 240 + side * 28;
    const cy = 60;
    const open = Math.max(state.open, 0.05);
    const height = 10 * open;

    ctx.beginPath();
    ctx.moveTo(cx - 15, cy + 6);
    ctx.quadraticCurveTo(cx, cy + 6 - height * 1.7, cx + 15, cy + 6);
    ctx.quadraticCurveTo(cx, cy + 6 + height * 1.0, cx - 15, cy + 6);
    ctx.closePath();
    ctx.fillStyle = '#efe8d2';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(cx + state.gazeX * 6, cy + 6 + state.gazeY * 3, 4.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#efe8d2';
    ctx.beginPath();
    ctx.arc(cx + state.gazeX * 6 - 1.6, cy + 4 + state.gazeY * 3, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const asym = side === 1 ? state.browAsym : 0;
    const lift = (state.browRaise + asym) * 12;
    const innerDrop = state.browTilt * 11;
    const outer: Pt = [240 + side * 56, 26 - lift - innerDrop * 0.3];
    const middle: Pt = [240 + side * 32, 13 - lift - 3];
    const inner: Pt = [240 + side * 10, 21 - lift + innerDrop];
    line(ctx, [outer, middle, inner], 8, rand, { color: '#3b342b', taper: 0.6, wobble: 0.6 });
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const x = outer[0] + (inner[0] - outer[0]) * t;
      const y = outer[1] + (inner[1] - outer[1]) * t - Math.sin(t * Math.PI) * 10;
      line(ctx, [[x, y + 4], [x - side * 4, y - 8 - rand() * 4]], 1.5, rand, { color: i % 2 ? '#8f8674' : INK, taper: 0.5 });
    }
  }
}
