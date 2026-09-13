import { FACES } from './types';
import type { Bid, Face } from './types';

/**
 * Bids order by quantity first, then by face at equal quantity —
 * matches the encoding `quantity * 10 + face` used in the original
 * game's own bid-comparison logic.
 */
export function compareBids(a: Bid, b: Bid): number {
  if (a.quantity !== b.quantity) return a.quantity - b.quantity;
  return a.face - b.face;
}

export function isHigherBid(candidate: Bid, previous: Bid): boolean {
  return compareBids(candidate, previous) > 0;
}

export function isValidNextBid(candidate: Bid, previous: Bid | null, totalDiceInPlay: number): boolean {
  if (candidate.quantity < 1 || candidate.quantity > totalDiceInPlay) return false;
  if (!FACES.includes(candidate.face)) return false;
  if (previous === null) return true;
  return isHigherBid(candidate, previous);
}

export function listLegalNextBids(previous: Bid | null, totalDiceInPlay: number): Bid[] {
  const all: Bid[] = [];
  for (let quantity = 1; quantity <= totalDiceInPlay; quantity++) {
    for (const face of FACES) {
      all.push({ quantity, face });
    }
  }
  all.sort(compareBids);
  if (previous === null) return all;
  return all.filter((bid) => isHigherBid(bid, previous));
}

export function maxPossibleBid(totalDiceInPlay: number): Bid {
  return { quantity: totalDiceInPlay, face: 4 as Face };
}
