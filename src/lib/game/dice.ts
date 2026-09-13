import type { Rng } from './rng';
import { randInt } from './rng';
import type { DiceHand, Face } from './types';

export function rollHand(count: number, rng: Rng): DiceHand {
  const hand: Face[] = [];
  for (let i = 0; i < count; i++) {
    hand.push(randInt(rng, 1, 4) as Face);
  }
  return hand;
}

export function countFace(hand: DiceHand, face: Face): number {
  return hand.filter((d) => d === face).length;
}
