import { mulberry32 } from '../game/rng';
import { INK, closedSpline, createCanvas, fillShape, hatch, line, outlineShape, paperGrain, tracePath } from './ink';
import type { Pt } from './ink';

export const HEAD_PX = { width: 340, height: 440 };
export const TORSO_PX = { width: 640, height: 520 };
export const COWL_PX = { width: 640, height: 230 };
export const SLEEVE_PX = { width: 150, height: 460 };
export const MOUSTACHE_BOX = { x: 100, y: 246, width: 140, height: 70 };
export const BEARD_BOX = { x: 84, y: 284, width: 172, height: 140 };
export const MOUTH_PX = { width: 56, height: 26 };

/** The strip of the head sprite that the animated eyes and brows are drawn over. */
export const EYES_STRIP = { width: 340, height: 80, top: 158 };

const HABIT_DEEP = '#150f0b';
const HABIT_LIGHT = '#a08c70';
const SKIN_LIGHT = '#e6dabe';
const SKIN_SHADE = '#a89b80';
const HAIR = '#8f897c';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const mirror = (points: readonly Pt[], axis = 170): Pt[] => points.map(([x, y]) => [2 * axis - x, y]);

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
    spacing: 5,
    width: 1.5,
    shade: (x, y) => clamp01(((x - centerX) / span) * 0.9 + 0.12 + ((y - top) / (bottom - top)) * 0.2),
    color: HABIT_DEEP,
  }, rand);
  hatch(ctx, shape, {
    angle: 1.5,
    spacing: 7,
    width: 1.2,
    shade: (x) => clamp01(((centerX - x) / span) * 0.7 - 0.1),
    color: HABIT_LIGHT,
  }, rand);
  for (const side of [-1, 1]) {
    for (let i = 0; i < folds; i++) {
      const s = (i + 1) / folds;
      const bend = (i % 2 === 0 ? 1 : -1) * 10;
      const fold: Pt[] = [
        [centerX + side * span * 0.1 * s, top],
        [centerX + side * span * (0.28 + 0.55 * s) + bend, top + (bottom - top) * 0.35],
        [centerX + side * span * (0.4 + 0.58 * s), top + (bottom - top) * 0.7],
        [centerX + side * span * (0.44 + 0.6 * s) - bend * 0.5, bottom],
      ];
      line(ctx, fold, 3, rand, { color: HABIT_DEEP, taper: 0.9 });
      line(ctx, fold.map(([x, y]) => [x - side * 4, y] as Pt), 1.6, rand, { color: HABIT_LIGHT, taper: 0.9 });
    }
  }
  ctx.restore();
}

/** Short strokes of hair or fur inside a region, flowing away from a point. */
function hairStrokes(
  ctx: CanvasRenderingContext2D,
  region: readonly Pt[],
  rand: () => number,
  count: number,
  origin: Pt,
  length: number,
  colors: readonly string[],
): void {
  const xs = region.map((p) => p[0]);
  const ys = region.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  ctx.save();
  tracePath(ctx, region);
  ctx.clip();
  for (let i = 0; i < count; i++) {
    const x = x0 + rand() * (x1 - x0);
    const y = y0 + rand() * (y1 - y0);
    const angle = Math.atan2(y - origin[1], x - origin[0]) + (rand() - 0.5) * 0.7;
    const size = length * (0.6 + rand() * 0.8);
    line(ctx, [[x, y], [x + Math.cos(angle) * size * 0.5, y + Math.sin(angle) * size * 0.5], [x + Math.cos(angle) * size, y + Math.sin(angle) * size]], 1 + rand() * 1.1, rand, {
      color: colors[Math.floor(rand() * colors.length)],
      taper: 0.7,
    });
  }
  ctx.restore();
}

/** A bald, weathered head with a fringe of grey hair, ears and a lined face, on a corded neck. */
export function drawHead(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(HEAD_PX.width, HEAD_PX.height);
  const rand = mulberry32(11);

  // Neck
  const neck = closedSpline([[124, 296], [118, 372], [106, 440], [234, 440], [222, 372], [216, 296]]);
  fillGradient(ctx, neck, '#d9cdb0', '#8f8368', 106, 234);
  hatch(ctx, neck, {
    angle: 1.3,
    spacing: 4,
    width: 1.4,
    shade: (x, y) => clamp01((x - 150) / 70) * 0.8 + clamp01((350 - y) / 40) * 0.9,
  }, rand);
  line(ctx, [[130, 330], [148, 380], [162, 430]], 2, rand, { taper: 0.9 });
  line(ctx, [[210, 330], [192, 380], [178, 430]], 2, rand, { taper: 0.9 });
  outlineShape(ctx, neck, 2.4, rand);

  // The fringe of hair at each side, behind the ears.
  const hairLeft = closedSpline([[94, 172], [70, 190], [60, 232], [70, 280], [92, 304], [104, 288], [90, 240], [92, 200]]);
  for (const shape of [hairLeft, mirror(hairLeft)]) {
    fillShape(ctx, shape, HAIR);
    hairStrokes(ctx, shape, rand, 70, [170, 110], 14, ['#d6d1c4', '#5b564b', '#aaa497', '#3f3b33']);
    outlineShape(ctx, shape, 2, rand);
  }

  // Ears
  const ear = closedSpline([[86, 196], [70, 190], [60, 214], [68, 250], [88, 256]]);
  for (const shape of [ear, mirror(ear)]) {
    fillGradient(ctx, shape, '#dcd0b3', '#a3977c', 56, 90);
    outlineShape(ctx, shape, 2, rand);
  }
  line(ctx, [[80, 200], [70, 206], [70, 232], [80, 244]], 1.6, rand);
  line(ctx, mirror([[80, 200], [70, 206], [70, 232], [80, 244]]), 1.6, rand);

  // Face, lit from the left.
  const face = closedSpline([
    [170, 76], [122, 92], [88, 146], [78, 214], [90, 274], [124, 322], [170, 348], [216, 322], [250, 274], [262, 214], [252, 146], [218, 92],
  ]);
  fillGradient(ctx, face, SKIN_LIGHT, SKIN_SHADE, 78, 262);
  hatch(ctx, face, {
    angle: 1.3,
    spacing: 3.6,
    width: 1.3,
    shade: (x, y) => {
      const right = clamp01((x - 178) / 70) * 0.75;
      const edge = clamp01((Math.abs(x - 170) - 66) / 22) * 0.8;
      const brow = clamp01((176 - y) / 12) * clamp01((y - 160) / 6);
      const socket = Math.max(0, 0.85 - Math.hypot(x - 136, y - 192) / 26) + Math.max(0, 0.85 - Math.hypot(x - 204, y - 192) / 26);
      const cheek = Math.max(0, 0.8 - Math.hypot(x - 116, y - 272) / 22) + Math.max(0, 0.8 - Math.hypot(x - 224, y - 272) / 22);
      const jaw = clamp01((y - 318) / 26);
      return clamp01(right + edge + brow + socket + cheek + jaw);
    },
  }, rand);
  hatch(ctx, face, {
    angle: 0.4,
    spacing: 4.6,
    width: 1.1,
    shade: (x, y) => clamp01((Math.abs(x - 170) - 52) / 26) * clamp01((y - 200) / 60) * 0.9 + clamp01((y - 326) / 18),
  }, rand);

  // Forehead: the shine of a bald crown, creases across the brow, and a frown line.
  line(ctx, [[126, 100], [170, 88], [214, 100]], 1.2, rand, { taper: 0.9, color: '#b6a98c' });
  for (let i = 0; i < 3; i++) line(ctx, [[130, 122 + i * 14], [170, 116 + i * 14], [210, 122 + i * 14]], 1.5, rand, { taper: 0.8 });
  line(ctx, [[160, 168], [158, 182]], 1.8, rand, { taper: 0.9 });
  line(ctx, [[180, 168], [182, 182]], 1.8, rand, { taper: 0.9 });
  // Around the eyes: the creased upper lid, bags, crow's feet
  for (const cx of [136, 204]) {
    const side = cx < 170 ? -1 : 1;
    line(ctx, [[cx - 20, 184], [cx, 176], [cx + 20, 184]], 1.6, rand, { color: '#7a6d56' });
    line(ctx, [[cx - 17, 208], [cx, 216], [cx + 17, 208]], 1.6, rand);
    line(ctx, [[cx - 13, 218], [cx, 224], [cx + 15, 218]], 1.2, rand, { color: '#7a6d56' });
    for (let i = 0; i < 3; i++) line(ctx, [[cx + side * 21, 192 + i * 5], [cx + side * (31 + i), 188 + i * 9]], 1.2, rand, { taper: 0.9 });
  }
  // Cheekbones, nose, and the lines running from nose to mouth
  line(ctx, [[104, 236], [118, 256], [138, 262]], 1.8, rand, { taper: 0.9 });
  line(ctx, mirror([[104, 236], [118, 256], [138, 262]]), 1.8, rand, { taper: 0.9 });
  line(ctx, [[163, 190], [160, 226], [154, 254]], 2, rand);
  line(ctx, [[176, 196], [180, 232], [186, 254]], 1.5, rand, { taper: 0.9 });
  line(ctx, [[146, 262], [152, 270], [170, 274], [188, 270], [194, 262]], 1.8, rand);
  line(ctx, [[150, 248], [144, 260], [151, 270]], 1.6, rand);
  line(ctx, [[190, 248], [196, 260], [189, 270]], 1.6, rand);
  fillShape(ctx, closedSpline([[154, 266], [160, 263], [166, 267], [160, 270]]), INK);
  fillShape(ctx, closedSpline([[174, 267], [180, 263], [186, 266], [180, 270]]), INK);
  line(ctx, [[148, 272], [136, 296], [130, 320]], 1.8, rand, { taper: 0.9 });
  line(ctx, [[192, 272], [204, 296], [210, 320]], 1.8, rand, { taper: 0.9 });
  outlineShape(ctx, face, 2.2, rand);

  // The collar of the habit, cut in a V.
  const collar = closedSpline([[92, 440], [100, 402], [138, 396], [170, 428], [202, 396], [240, 402], [248, 440]]);
  fillGradient(ctx, collar, '#4a3a2d', '#1c140f', 92, 248);
  hatch(ctx, collar, { angle: 1.2, spacing: 5, width: 1.4, shade: (x) => clamp01((x - 150) / 90) * 0.9, color: HABIT_DEEP }, rand);
  line(ctx, [[138, 398], [170, 430], [202, 398]], 2.4, rand, { color: HABIT_LIGHT });
  outlineShape(ctx, collar, 2.2, rand);

  paperGrain(ctx, HEAD_PX.width, HEAD_PX.height, rand);
  return canvas;
}

/** The moustache, drawn in head coordinates and cropped to MOUSTACHE_BOX. */
export function drawMoustache(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(MOUSTACHE_BOX.width, MOUSTACHE_BOX.height);
  ctx.translate(-MOUSTACHE_BOX.x, -MOUSTACHE_BOX.y);
  const rand = mulberry32(31);

  const lobe: Pt[] = closedSpline([[171, 266], [186, 259], [206, 261], [222, 272], [224, 292], [212, 285], [192, 280], [172, 279]]);
  for (const [shape, from, to] of [[lobe, '#d7d2c4', '#a7a293'], [mirror(lobe), '#c9c4b5', '#8d887a']] as const) {
    fillGradient(ctx, shape, from, to, 100, 240);
    hairStrokes(ctx, shape, rand, 30, [170, 266], 11, ['#efeadc', '#6b665a', '#3e3a32']);
    outlineShape(ctx, shape, 1.8, rand);
  }
  return canvas;
}

/** A short, spade-shaped beard. Drawn in head coordinates and cropped to BEARD_BOX. */
export function drawBeard(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(BEARD_BOX.width, BEARD_BOX.height);
  ctx.translate(-BEARD_BOX.x, -BEARD_BOX.y);
  const rand = mulberry32(43);

  const beard = closedSpline([
    [112, 294], [106, 326], [118, 362], [144, 390], [170, 412], [196, 390], [222, 362], [234, 326], [228, 294], [210, 312], [170, 320], [130, 312],
  ]);
  fillGradient(ctx, beard, '#cfcabb', '#807b6d', 94, 246);
  hairStrokes(ctx, beard, rand, 260, [170, 300], 15, ['#f0ebdc', '#a9a496', '#4e4a40', '#dcd7c8']);
  hatch(ctx, beard, {
    angle: 1.5,
    spacing: 5,
    width: 1.2,
    shade: (x, y) => clamp01((x - 176) / 60) * 0.7 + clamp01((y - 395) / 20) * 0.4,
    color: '#2c2820',
  }, rand);
  outlineShape(ctx, beard, 1.6, rand);
  return canvas;
}

/** The dark inside of the mouth, shown when the jaw drops. */
export function drawMouth(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(MOUTH_PX.width, MOUTH_PX.height);
  const rand = mulberry32(59);
  fillShape(ctx, closedSpline([[4, 10], [28, 3], [52, 10], [48, 20], [28, 25], [8, 20]]), '#0b0605');
  for (let i = 0; i < 5; i++) {
    const x = 14 + i * 6.4;
    fillShape(ctx, closedSpline([[x - 2.4, 6], [x + 2.4, 6], [x + 1.8, 12], [x - 1.8, 12]]), '#d3c8ae');
  }
  line(ctx, [[10, 20], [28, 24], [46, 20]], 1.6, rand, { color: '#5a2a24' });
  return canvas;
}

/** The habit's shoulders and chest, with a scapular, a wooden cross on a cord, and a bunched cowl. */
export function drawTorso(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(TORSO_PX.width, TORSO_PX.height);
  const rand = mulberry32(23);

  const habit = closedSpline([
    [290, 14], [350, 14], [432, 40], [522, 82], [590, 152], [622, 300], [632, 520], [8, 520], [18, 300], [50, 152], [118, 82], [208, 40],
  ]);
  fillGradient(ctx, habit, '#4d3d30', '#150f0b', 30, 630);
  drapeCloth(ctx, habit, rand, 320, 300, 80, 510, 6);
  line(ctx, [[208, 42], [120, 84], [52, 154], [20, 300], [10, 510]], 3.2, rand, { color: HABIT_LIGHT, taper: 0.8 });

  // The scapular hangs down the front, over the habit.
  const scapular = closedSpline([[244, 30], [396, 30], [412, 200], [420, 520], [220, 520], [228, 200]]);
  fillGradient(ctx, scapular, '#3a2d23', '#1a130e', 220, 420);
  hatch(ctx, scapular, { angle: 1.55, spacing: 5, width: 1.3, shade: (x) => clamp01((x - 300) / 110) * 0.9, color: HABIT_DEEP }, rand);
  for (const dx of [-38, 0, 40]) line(ctx, [[320 + dx, 40], [320 + dx * 1.2, 260], [320 + dx * 1.3, 510]], 2.2, rand, { color: HABIT_DEEP, taper: 0.9 });
  line(ctx, [[248, 34], [232, 200], [224, 510]], 2.2, rand, { color: HABIT_LIGHT, taper: 0.8 });
  outlineShape(ctx, scapular, 1.8, rand);

  // A wooden cross on a cord.
  line(ctx, [[262, 44], [286, 150], [320, 196]], 2, rand, { color: '#c9b892' });
  line(ctx, [[378, 44], [354, 150], [320, 196]], 2, rand, { color: '#c9b892' });
  fillShape(ctx, closedSpline([[312, 190], [328, 190], [328, 214], [346, 214], [346, 228], [328, 228], [328, 256], [312, 256], [312, 228], [294, 228], [294, 214], [312, 214]], 3), '#7b5836');
  line(ctx, [[319, 194], [319, 252]], 1.2, rand, { color: '#3d2a18' });
  line(ctx, [[298, 221], [342, 221]], 1.2, rand, { color: '#3d2a18' });
  line(ctx, [[313, 194], [313, 226], [298, 226]], 1.6, rand, { color: '#c49a62' });

  outlineShape(ctx, habit, 2.4, rand);
  paperGrain(ctx, TORSO_PX.width, TORSO_PX.height, rand);
  return canvas;
}

/** The hood, bunched into a thick roll around the neck and over the shoulders. */
export function drawCowl(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(COWL_PX.width, COWL_PX.height);
  const rand = mulberry32(71);

  const cowl = closedSpline([
    [50, 206], [104, 112], [206, 52], [320, 30], [434, 52], [536, 112], [590, 206], [488, 196], [412, 146], [320, 128], [228, 146], [152, 196],
  ]);
  fillGradient(ctx, cowl, '#5a4838', '#1a130e', 50, 590);
  ctx.save();
  tracePath(ctx, cowl);
  ctx.clip();
  // Folds following the curve of the roll.
  for (let i = 0; i < 5; i++) {
    const inset = i * 16;
    line(ctx, [[86 + inset, 200 - inset * 0.3], [210 + inset * 0.6, 62 + inset * 0.7], [320, 40 + inset * 0.9], [430 - inset * 0.6, 62 + inset * 0.7], [554 - inset, 200 - inset * 0.3]], 2.4, rand, {
      color: i % 2 ? HABIT_DEEP : HABIT_LIGHT,
      taper: 0.6,
    });
  }
  hatch(ctx, cowl, { angle: 0.4, spacing: 6, width: 1.3, shade: (x, y) => clamp01((x - 320) / 260) * 0.7 + clamp01((y - 150) / 60) * 0.6, color: HABIT_DEEP }, rand);
  ctx.restore();
  outlineShape(ctx, cowl, 2.4, rand);
  paperGrain(ctx, COWL_PX.width, COWL_PX.height, rand);
  return canvas;
}

/** A wide habit sleeve with a dark opening at the cuff; stretched to reach the hand. */
export function drawSleeve(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(SLEEVE_PX.width, SLEEVE_PX.height);
  const rand = mulberry32(37);

  const sleeve = closedSpline([
    [30, 44], [75, 16], [120, 44], [128, 180], [140, 330], [148, 428], [75, 440], [2, 428], [10, 330], [22, 180],
  ]);
  fillGradient(ctx, sleeve, '#4d3d30', '#150f0b', 10, 140);
  drapeCloth(ctx, sleeve, rand, 75, 70, 40, 430, 3);
  line(ctx, [[30, 46], [22, 180], [10, 330], [4, 426]], 2.6, rand, { color: HABIT_LIGHT, taper: 0.8 });
  outlineShape(ctx, sleeve, 2.2, rand);

  const opening = closedSpline([[8, 424], [75, 412], [144, 424], [132, 446], [75, 454], [20, 446]]);
  fillShape(ctx, opening, '#0d0806');
  line(ctx, [[10, 428], [75, 416], [142, 428]], 2, rand, { color: HABIT_LIGHT, taper: 0.7 });
  outlineShape(ctx, opening, 1.8, rand);
  paperGrain(ctx, SLEEVE_PX.width, SLEEVE_PX.height, rand);
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

/** Draws the eyes and brows into a strip that overlays the head sprite. */
export function drawEyes(ctx: CanvasRenderingContext2D, state: EyeState): void {
  const rand = mulberry32(67);
  ctx.clearRect(0, 0, EYES_STRIP.width, EYES_STRIP.height);

  for (const side of [-1, 1] as const) {
    const cx = 170 + side * 34;
    const cy = 32;
    const open = Math.max(state.open, 0.04);
    const upper = 11 * open;
    const lower = 5 * Math.min(open, 1);

    ctx.beginPath();
    ctx.moveTo(cx - 17, cy + 2);
    ctx.quadraticCurveTo(cx, cy + 2 - upper * 1.6, cx + 17, cy + 2);
    ctx.quadraticCurveTo(cx, cy + 2 + lower * 1.5, cx - 17, cy + 2);
    ctx.closePath();
    ctx.fillStyle = '#f0ead8';
    ctx.fill();
    ctx.save();
    ctx.clip();
    const ix = cx + state.gazeX * 5;
    const iy = cy + 2 + state.gazeY * 2.5;
    ctx.fillStyle = '#5b4e3a';
    ctx.beginPath();
    ctx.arc(ix, iy, 7.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(ix, iy, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0ead8';
    ctx.beginPath();
    ctx.arc(ix - 2, iy - 2.4, 1.3, 0, Math.PI * 2);
    ctx.fill();
    // The upper lid shadows the top of the eye.
    ctx.fillStyle = 'rgba(40,28,16,0.35)';
    ctx.fillRect(cx - 20, cy - 12, 40, 9 + (1 - Math.min(open, 1)) * 6);
    ctx.restore();

    line(ctx, [[cx - 19, cy + 2], [cx - 4, cy + 2 - upper * 1.5], [cx + 19, cy + 3]], 2.8, rand, { taper: 0.5 });
    line(ctx, [[cx - 14, cy + 4], [cx, cy + 4 + lower * 1.4], [cx + 15, cy + 4]], 1.1, rand, { taper: 0.8 });

    const asym = side === 1 ? state.browAsym : 0;
    const lift = (state.browRaise + asym) * 8;
    const innerDrop = state.browTilt * 7;
    const outer: Pt = [170 + side * 62, 13 - lift - innerDrop * 0.3];
    const middle: Pt = [170 + side * 38, 5 - lift - 2];
    const inner: Pt = [170 + side * 11, 10 - lift + innerDrop];
    line(ctx, [outer, middle, inner], 6, rand, { color: '#4f483c', taper: 0.6, wobble: 0.4 });
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const x = outer[0] + (inner[0] - outer[0]) * t;
      const y = outer[1] + (inner[1] - outer[1]) * t - Math.sin(t * Math.PI) * 6;
      line(ctx, [[x, y + 3], [x - side * 3, y - 6 - rand() * 3]], 1.1, rand, { color: i % 2 ? '#8f887a' : INK, taper: 0.5 });
    }
  }
}
