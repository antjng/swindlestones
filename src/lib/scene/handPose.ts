// Shared hand poses and proportions.

export interface HandPose {
  /** How far each finger (index to little) is curled, 0 straight to 1 fist. */
  readonly flex: readonly [number, number, number, number];
  readonly spread: number;
  /** 0 thumb out to the side, 1 tucked across the palm. */
  readonly thumb: number;
}

export const HAND_POSES = {
  flat: { flex: [0.04, 0.04, 0.04, 0.05], spread: 0.35, thumb: 0.2 },
  relaxed: { flex: [0.3, 0.36, 0.42, 0.5], spread: 0.55, thumb: 0.45 },
  // Lying on the table: fingers loosely curled so the heel of the palm and the fingertips both touch it.
  resting: { flex: [0.34, 0.4, 0.46, 0.52], spread: 0.22, thumb: 0.45 },
  cover: { flex: [0.12, 0.08, 0.1, 0.16], spread: 0.18, thumb: 0.25 },
  cup: { flex: [0.34, 0.4, 0.42, 0.48], spread: 0.3, thumb: 0.4 },
  press: { flex: [0, 0, 0, 0], spread: 0.9, thumb: 0 },
  fist: { flex: [0.95, 0.98, 1, 1], spread: 0, thumb: 0.9 },
  point: { flex: [0, 0.98, 1, 1], spread: 0, thumb: 0.85 },
  claw: { flex: [0.5, 0.55, 0.55, 0.6], spread: 0.9, thumb: 0.1 },
} as const satisfies Record<string, HandPose>;

export type HandPoseName = keyof typeof HAND_POSES;

// Real proportions, scaled so the palm is 2.6 units wide: a palm as long as it
// is wide plus a fifth, a middle finger four fifths of a palm, and phalanges in
// the ratio 4.4 : 2.6 : 1.8.
export const HAND_SIZE = {
  palmWidth: 2.6,
  palmLength: 3.3,
  fingerLength: 2.8,
};
