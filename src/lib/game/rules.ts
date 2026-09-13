import { countFace } from './dice';
import type { Bid, DiceHand, PlayerId } from './types';

export interface CallResult {
  /** True if the bid was actually met by the combined hands (the caller was wrong to doubt it). */
  readonly bidWasTrue: boolean;
  readonly actualCount: number;
  readonly loser: PlayerId;
}

export function resolveCall(
  bid: Bid,
  bidder: PlayerId,
  caller: PlayerId,
  hands: Record<PlayerId, DiceHand>,
): CallResult {
  const actualCount = countFace(hands.player, bid.face) + countFace(hands.ai, bid.face);
  const bidWasTrue = actualCount >= bid.quantity;
  return {
    bidWasTrue,
    actualCount,
    loser: bidWasTrue ? caller : bidder,
  };
}
