// Shared skin colours and lighting for the figures' pixel art.

export const SKIN_PALETTE = ['#0b0904', '#241c0a', '#4a3a14', '#7c6522', '#b39336', '#e6cf6a'];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Brightness of a surface facing (nx, ny, nz) lit from the lower left and front, like a table of candles. */
export function lit(nx: number, ny: number, nz: number): number {
  return clamp01(nx * -0.35 + ny * 0.5 + nz * 0.78);
}
