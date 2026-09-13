import { isValidNextBid } from './bid';
import { rollHand } from './dice';
import type { Rng } from './rng';
import { resolveCall } from './rules';
import type { CallResult } from './rules';
import { opponentOf } from './types';
import type { Bid, DiceHand, PlayerId } from './types';

export type Phase = 'awaitingRoll' | 'bidding' | 'roundOver' | 'matchOver';

export interface MatchState {
  readonly diceCounts: Record<PlayerId, number>;
  readonly hands: Record<PlayerId, DiceHand>;
  readonly currentBid: Bid | null;
  readonly turn: PlayerId;
  readonly roundStarter: PlayerId;
  readonly phase: Phase;
  readonly lastCallResult: CallResult | null;
  readonly winner: PlayerId | null;
}

export type MatchAction =
  | { type: 'startRound' }
  | { type: 'bid'; by: PlayerId; bid: Bid }
  | { type: 'call'; by: PlayerId };

export const STARTING_DICE = 5;

export function createInitialMatchState(rng: Rng): MatchState {
  const roundStarter: PlayerId = rng() < 0.5 ? 'player' : 'ai';
  return {
    diceCounts: { player: STARTING_DICE, ai: STARTING_DICE },
    hands: { player: [], ai: [] },
    currentBid: null,
    turn: roundStarter,
    roundStarter,
    phase: 'awaitingRoll',
    lastCallResult: null,
    winner: null,
  };
}

export function totalDiceInPlay(state: MatchState): number {
  return state.diceCounts.player + state.diceCounts.ai;
}

export function reduce(state: MatchState, action: MatchAction, rng: Rng): MatchState {
  switch (action.type) {
    case 'startRound':
      return startRound(state, rng);
    case 'bid':
      return applyBid(state, action.by, action.bid);
    case 'call':
      return applyCall(state, action.by);
  }
}

function startRound(state: MatchState, rng: Rng): MatchState {
  if (state.phase === 'matchOver') {
    throw new Error('Cannot start a round after the match has ended.');
  }
  if (state.phase === 'bidding') {
    throw new Error('Cannot start a round while bidding is already in progress.');
  }
  return {
    ...state,
    hands: {
      player: rollHand(state.diceCounts.player, rng),
      ai: rollHand(state.diceCounts.ai, rng),
    },
    currentBid: null,
    turn: state.roundStarter,
    phase: 'bidding',
    lastCallResult: null,
  };
}

function applyBid(state: MatchState, by: PlayerId, bid: Bid): MatchState {
  if (state.phase !== 'bidding') {
    throw new Error(`Cannot bid outside the bidding phase (current phase: ${state.phase}).`);
  }
  if (by !== state.turn) {
    throw new Error(`It is not ${by}'s turn to bid.`);
  }
  if (!isValidNextBid(bid, state.currentBid, totalDiceInPlay(state))) {
    throw new Error(`Bid ${JSON.stringify(bid)} does not legally raise ${JSON.stringify(state.currentBid)}.`);
  }
  return {
    ...state,
    currentBid: bid,
    turn: opponentOf(by),
  };
}

function applyCall(state: MatchState, by: PlayerId): MatchState {
  if (state.phase !== 'bidding') {
    throw new Error(`Cannot call outside the bidding phase (current phase: ${state.phase}).`);
  }
  if (by !== state.turn) {
    throw new Error(`It is not ${by}'s turn to call.`);
  }
  if (state.currentBid === null) {
    throw new Error('Cannot call before any bid has been made.');
  }

  const bidder = opponentOf(by);
  const result = resolveCall(state.currentBid, bidder, by, state.hands);
  const diceCounts = {
    ...state.diceCounts,
    [result.loser]: state.diceCounts[result.loser] - 1,
  };
  const winner = diceCounts[result.loser] === 0 ? opponentOf(result.loser) : null;

  return {
    ...state,
    diceCounts,
    lastCallResult: result,
    roundStarter: result.loser,
    turn: result.loser,
    phase: winner ? 'matchOver' : 'roundOver',
    winner,
  };
}
