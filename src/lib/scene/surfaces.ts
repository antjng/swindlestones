import * as THREE from 'three';
import { hash2, noise2, pixelCanvas, plotLine, shadeLayer } from './pixel';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A pixel-art canvas as a repeating, nearest-filtered texture: crisp, crunchy, and never smoothed. */
export function pixelTexture(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

export const WOOD_PALETTE = ['#070403', '#170c07', '#2e180c', '#4c2a14', '#6f4020', '#966032'];

/**
 * A small grainy pixel texture from a palette: noise, dithered through the
 * palette, optionally streaked along one axis (wood, cloth) and darkened toward
 * the edges of the tile.
 */
export function pixelSurface(
  palette: readonly string[],
  seed: number,
  options: { size?: number; base?: number; contrast?: number; streak?: number } = {},
): THREE.CanvasTexture {
  const { size = 64, base = 0.5, contrast = 0.5, streak = 1 } = options;
  const layer = shadeLayer(size * 4, size * 4, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
  }, {
    palette,
    shade: (x, y) => base + (noise2(x, y * streak, 20, seed) - 0.5) * contrast + (noise2(x, y * streak, 7, seed + 3) - 0.5) * contrast * 0.6 + (hash2(x >> 2, y >> 2, seed) - 0.5) * 0.12,
  });
  return pixelTexture(layer);
}

/** A dark red-brown tabletop of heavy planks, with knots, cracks, and scuffed grain, all in chunky pixels. */
export function pixelWood(seed: number, width = 1024, height = 256, planks = 5): THREE.CanvasTexture {
  const plankHeight = height / planks;
  const layer = shadeLayer(width, height, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
  }, {
    palette: WOOD_PALETTE,
    shade: (x, y) => {
      const p = Math.floor(y / plankHeight);
      const within = (y % plankHeight) / plankHeight;
      const plankTone = (hash2(p, 1, seed) - 0.5) * 0.24;
      const grain = noise2(x * 0.09, y * 2.4, 5, seed + p) - 0.5;
      const fine = noise2(x * 0.3, y * 3, 3, seed + 20 + p) - 0.5;
      const wear = noise2(x, y, 60, seed + 9);
      let v = 0.44 + plankTone + grain * 0.4 + fine * 0.2 - 0.25 * clamp01(wear - 0.55) * 2;
      // The seam between planks, and a bevelled edge either side of it.
      if (within < 0.03 || within > 0.985) v -= 0.5;
      else if (within < 0.07) v += 0.08;
      return v;
    },
  });
  const ctx = layer.getContext('2d')!;
  // Cracks and knots picked out in black.
  for (let i = 0; i < 9; i++) {
    let x = hash2(i, 2, seed) * width;
    let y = hash2(i, 3, seed) * height;
    const heading = hash2(i, 4, seed) * Math.PI * 2;
    for (let s = 0; s < 8; s++) {
      const nx = x + Math.cos(heading + (hash2(i, s + 10, seed) - 0.5) * 1.4) * (14 + hash2(i, s + 30, seed) * 22);
      const ny = y + Math.sin(heading + (hash2(i, s + 20, seed) - 0.5) * 1.4) * (14 + hash2(i, s + 40, seed) * 22);
      plotLine(ctx, [x, y], [nx, ny], '#050202');
      [x, y] = [nx, ny];
    }
  }
  return pixelTexture(layer);
}
