import type { MatchState } from '../game/match';
import type { CallResult } from '../game/rules';
import type { Bid, DiceHand, PlayerId } from '../game/types';

/** What the screen needs to read about the match, whether it is played against the computer or another person. */
export interface MatchReader {
  readonly state: MatchState;
  readonly phase: MatchState['phase'];
  readonly turn: PlayerId;
  readonly currentBid: Bid | null;
  readonly diceCounts: MatchState['diceCounts'];
  readonly winner: PlayerId | null;
  readonly lastCallResult: CallResult | null;
  readonly playerHand: DiceHand;
  readonly isPlayerTurn: boolean;
  readonly legalNextBids: Bid[];
}
