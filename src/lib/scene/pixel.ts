import { ART_SCALE, closedSpline, spline } from './ink';
import type { Pt } from './ink';

/**
 * Pixel-art drawing for the figures. Shapes are described in the same logical
 * drawing units as the rest of the scene, then rasterised onto a canvas one
 * art pixel per PIXEL units, with no anti-aliasing, and shaded with an ordered
 * dither through a small fixed palette: the chunky, candle-lit look of a
 * low-resolution 3D game rather than clean vector illustration.
 */
export const PIXEL = 4;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A canvas holding one pixel per PIXEL logical units. */
export function pixelCanvas(logicalWidth: number, logicalHeight: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(logicalWidth / PIXEL));
  canvas.height = Math.max(1, Math.round(logicalHeight / PIXEL));
  canvas.dataset.pixel = '1';
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

/** A canvas's size in logical drawing units, whether it is a pixel-art canvas or a scaled vector one. */
export function logicalSize(canvas: HTMLCanvasElement): { width: number; height: number } {
  return canvas.dataset.pixel
    ? { width: canvas.width * PIXEL, height: canvas.height * PIXEL }
    : { width: canvas.width / ART_SCALE, height: canvas.height / ART_SCALE };
}

/** Deterministic 2D hash in [0, 1). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1), with features about `scale` logical units across. */
export function noise2(x: number, y: number, scale: number, seed = 0): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** How strongly a point sits inside a soft round blob: 1 at its center, 0 at the edge. */
export function blob(x: number, y: number, cx: number, cy: number, radius: number): number {
  return clamp01(1 - Math.hypot(x - cx, y - cy) / radius);
}

function parseColor(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Fills a smooth closed shape; used for masks, which are recoloured by shadeLayer(). */
export function pixelShape(ctx: CanvasRenderingContext2D, controls: readonly Pt[], color = '#000', samples = 6): void {
  const points = closedSpline(controls, samples);
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x / PIXEL, y / PIXEL) : ctx.lineTo(x / PIXEL, y / PIXEL)));
  ctx.closePath();
  ctx.fill();
}

/** Fills a polygon with sharp corners. */
export function pixelPolygon(ctx: CanvasRenderingContext2D, points: readonly Pt[], color = '#000'): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x / PIXEL, y / PIXEL) : ctx.lineTo(x / PIXEL, y / PIXEL)));
  ctx.closePath();
  ctx.fill();
}

/** Snaps every pixel to fully opaque or fully clear, so shapes have hard edges. */
export function harden(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = image.data[i] > 110 ? 255 : 0;
  ctx.putImageData(image, 0, 0);
}

export interface ShadeOptions {
  /** Colors from darkest to lightest. */
  palette: readonly string[];
  /** Brightness 0-1 at a point in logical units; `edge` is 1 on pixels that touch the shape's outline. */
  shade: (x: number, y: number, edge: number) => number;
}

/**
 * Draws a mask, then colours every pixel of it by `shade`, dithering between
 * palette steps with an ordered pattern. Returns the shaded layer.
 */
export function shadeLayer(
  logicalWidth: number,
  logicalHeight: number,
  drawMask: (ctx: CanvasRenderingContext2D) => void,
  { palette, shade }: ShadeOptions,
): HTMLCanvasElement {
  const [canvas, ctx] = pixelCanvas(logicalWidth, logicalHeight);
  drawMask(ctx);
  harden(canvas);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = image;
  const colors = palette.map(parseColor);
  const alphaAt = (px: number, py: number) => (px < 0 || py < 0 || px >= width || py >= height ? 0 : data[(py * width + px) * 4 + 3]);

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      if (data[i + 3] === 0) continue;
      const edge = alphaAt(px - 1, py) === 0 || alphaAt(px + 1, py) === 0 || alphaAt(px, py - 1) === 0 || alphaAt(px, py + 1) === 0 ? 1 : 0;
      const t = clamp01(shade((px + 0.5) * PIXEL, (py + 0.5) * PIXEL, edge)) * (colors.length - 1);
      const base = Math.floor(t);
      const step = t - base > BAYER[(py & 3) * 4 + (px & 3)] ? 1 : 0;
      const [r, g, b] = colors[Math.min(colors.length - 1, base + step)];
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Composites one canvas over another at the same origin. */
export function blit(target: HTMLCanvasElement, layer: HTMLCanvasElement): void {
  target.getContext('2d')!.drawImage(layer, 0, 0);
}

/** A single art pixel (or a square of them). */
export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size = 1): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x / PIXEL), Math.floor(y / PIXEL), size, size);
}

/** A pixel-exact line between two logical points. */
export function plotLine(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, color: string, size = 1): void {
  let x0 = Math.floor(from[0] / PIXEL);
  let y0 = Math.floor(from[1] / PIXEL);
  const x1 = Math.floor(to[0] / PIXEL);
  const y1 = Math.floor(to[1] / PIXEL);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  ctx.fillStyle = color;
  for (;;) {
    ctx.fillRect(x0, y0, size, size);
    if (x0 === x1 && y0 === y1) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x0 += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y0 += sy;
    }
  }
}

/** A pixel-exact smooth curve through control points. */
export function pixelCurve(ctx: CanvasRenderingContext2D, controls: readonly Pt[], color: string, size = 1): void {
  const points = spline(controls, 6);
  for (let i = 1; i < points.length; i++) plotLine(ctx, points[i - 1], points[i], color, size);
}
