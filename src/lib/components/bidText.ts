import type { Bid, Face } from '../game/types';

const FACE_WORDS: Record<Face, string> = { 1: 'one', 2: 'two', 3: 'three', 4: 'four' };

/** "2 fours", "1 three", or "no twos". */
export function describeCount(quantity: number, face: Face): string {
  if (quantity === 0) return `no ${FACE_WORDS[face]}s`;
  return `${quantity} ${FACE_WORDS[face]}${quantity === 1 ? '' : 's'}`;
}

export function describeBid(bid: Bid): string {
  return describeCount(bid.quantity, bid.face);
}
