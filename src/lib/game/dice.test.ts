import { describe, expect, it } from 'vitest';
import { countFace, rollHand } from './dice';
import { mulberry32 } from './rng';

describe('rollHand', () => {
  it('returns the requested number of dice, each in [1, 4]', () => {
    const rng = mulberry32(123);
    const hand = rollHand(5, rng);
    expect(hand).toHaveLength(5);
    for (const face of hand) {
      expect(face).toBeGreaterThanOrEqual(1);
      expect(face).toBeLessThanOrEqual(4);
    }
  });

  it('is deterministic given the same seed', () => {
    expect(rollHand(5, mulberry32(99))).toEqual(rollHand(5, mulberry32(99)));
  });

  it('returns an empty hand for zero dice', () => {
    expect(rollHand(0, mulberry32(1))).toEqual([]);
  });
});

describe('countFace', () => {
  it('counts occurrences of a given face', () => {
    expect(countFace([1, 2, 2, 3, 4, 2], 2)).toBe(3);
    expect(countFace([1, 1, 1], 4)).toBe(0);
    expect(countFace([], 1)).toBe(0);
  });
});
