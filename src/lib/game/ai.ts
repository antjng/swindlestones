import { listLegalNextBids } from './bid';
import { countFace } from './dice';
import { probAtLeast } from './probability';
import type { Rng } from './rng';
import type { Bid, DiceHand } from './types';

export interface AiConfig {
  /** Call when the current bid's probability of being true drops below this. */
  readonly callThreshold: number;
  /** Prefer to raise to any legal bid whose probability of being true is at least this. */
  readonly comfortThreshold: number;
  /** When no comfortable raise exists, bluff with a raise anyway this often instead of calling. */
  readonly bluffRate: number;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  callThreshold: 0.5,
  comfortThreshold: 0.6,
  bluffRate: 0.15,
};

export type AiDecision = { readonly type: 'bid'; readonly bid: Bid } | { readonly type: 'call' };

/** Faces of unseen opponent dice are assumed uniform over 1-4. */
const FACE_PROBABILITY = 0.25;

export function probabilityBidIsTrue(bid: Bid, ownHand: DiceHand, opponentDiceCount: number): number {
  const known = countFace(ownHand, bid.face);
  const needed = bid.quantity - known;
  if (needed <= 0) return 1;
  if (needed > opponentDiceCount) return 0;
  return probAtLeast(opponentDiceCount, needed, FACE_PROBABILITY);
}

export function decideAiAction(
  currentBid: Bid | null,
  ownHand: DiceHand,
  opponentDiceCount: number,
  config: AiConfig,
  rng: Rng,
): AiDecision {
  const totalDice = ownHand.length + opponentDiceCount;
  const legalBids = listLegalNextBids(currentBid, totalDice);

  if (currentBid !== null) {
    const pCurrentBidTrue = probabilityBidIsTrue(currentBid, ownHand, opponentDiceCount);
    if (pCurrentBidTrue < config.callThreshold) {
      return { type: 'call' };
    }
  }

  const comfortableRaise = legalBids.find(
    (bid) => probabilityBidIsTrue(bid, ownHand, opponentDiceCount) >= config.comfortThreshold,
  );
  if (comfortableRaise) {
    return { type: 'bid', bid: comfortableRaise };
  }

  if (legalBids.length > 0 && (currentBid === null || rng() < config.bluffRate)) {
    return { type: 'bid', bid: legalBids[0] };
  }

  return { type: 'call' };
}
