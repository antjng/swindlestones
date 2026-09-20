import { listLegalNextBids } from '../game/bid';
import { createInitialMatchState, reduce, totalDiceInPlay } from '../game/match';
import type { MatchState } from '../game/match';
import { mulberry32, randomSeed } from '../game/rng';
import type { Rng } from '../game/rng';
import type { Bid, DiceHand, PlayerId } from '../game/types';

/** Reactive wrapper around match.ts's reduce(); owns the match's seeded RNG. */
export class GameStore {
  #rng: Rng;
  #state = $state<MatchState>(undefined as unknown as MatchState);

  constructor(seed: number = randomSeed()) {
    this.#rng = mulberry32(seed);
    this.#state = createInitialMatchState(this.#rng);
  }

  get state(): MatchState {
    return this.#state;
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

  startRound(): void {
    this.#state = reduce(this.#state, { type: 'startRound' }, this.#rng);
  }

  submitBid(by: PlayerId, bid: Bid): void {
    this.#state = reduce(this.#state, { type: 'bid', by, bid }, this.#rng);
  }

  call(by: PlayerId): void {
    this.#state = reduce(this.#state, { type: 'call', by }, this.#rng);
  }

  /** Starts a new match with a fresh RNG stream. */
  reset(seed: number = randomSeed()): void {
    this.#rng = mulberry32(seed);
    this.#state = createInitialMatchState(this.#rng);
  }
}
