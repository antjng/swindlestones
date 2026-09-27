import { listLegalNextBids } from '../game/bid';
import { createInitialMatchState, totalDiceInPlay } from '../game/match';
import type { MatchState } from '../game/match';
import { mulberry32 } from '../game/rng';
import type { Bid, DiceHand, PlayerId } from '../game/types';
import type { MatchReader } from './matchReader';

/**
 * The match as this player is told about it in an online game. What the other
 * player did arrives here first without being shown, so the screen can play it
 * out (the knock, the reveal) and only then let the numbers change.
 */
export class ViewStore implements MatchReader {
  #state = $state<MatchState>(createInitialMatchState(mulberry32(1)));
  #incoming: MatchState | null = null;

  get state(): MatchState {
    return this.#state;
  }

  /** The newest state that has arrived, shown or not. */
  get latest(): MatchState {
    return this.#incoming ?? this.#state;
  }

  get phase() {
    return this.#state.phase;
  }

  get turn(): PlayerId {
    return this.#state.turn;
  }

  get currentBid(): Bid | null {
    return this.#state.currentBid;
  }

  get diceCounts() {
    return this.#state.diceCounts;
  }

  get winner(): PlayerId | null {
    return this.#state.winner;
  }

  get lastCallResult() {
    return this.#state.lastCallResult;
  }

  get playerHand(): DiceHand {
    return this.#state.hands.player;
  }

  get isPlayerTurn(): boolean {
    return this.#state.phase === 'bidding' && this.#state.turn === 'player';
  }

  get legalNextBids(): Bid[] {
    return listLegalNextBids(this.#state.currentBid, totalDiceInPlay(this.#state));
  }

  /** Takes note of a new state without showing it yet. */
  receive(state: MatchState): void {
    this.#incoming = state;
  }

  /** Shows the state that has arrived. */
  apply(): void {
    if (this.#incoming) {
      this.#state = this.#incoming;
      this.#incoming = null;
    }
  }
}
