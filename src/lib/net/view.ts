import type { MatchState } from '../game/match';
import { opponentOf } from '../game/types';
import type { DiceHand, Face } from '../game/types';

/** Stand-ins for dice you can't see yet: the right number of them, all showing the same face. */
function hidden(count: number): DiceHand {
  return Array.from({ length: count }, () => 1 as Face);
}

/** Whether both hands are on the table: once a call has been made and the round is over. */
function revealed(state: MatchState): boolean {
  return state.phase === 'roundOver' || state.phase === 'matchOver';
}

/**
 * The match as one of the two players may see it: their own dice, the other's
 * count of dice but not their faces until a call reveals them. `from` says who
 * is looking; a guest's view is turned round so that they are always 'player'
 * and the person across the table is always 'ai', as the screen expects.
 */
export function viewFor(state: MatchState, from: 'player' | 'ai'): MatchState {
  const open = revealed(state);
  const hands = {
    player: from === 'player' || open ? state.hands.player : hidden(state.diceCounts.player),
    ai: from === 'ai' || open ? state.hands.ai : hidden(state.diceCounts.ai),
  };
  if (from === 'player') return { ...state, hands };

  return {
    diceCounts: { player: state.diceCounts.ai, ai: state.diceCounts.player },
    hands: { player: hands.ai, ai: hands.player },
    currentBid: state.currentBid,
    turn: opponentOf(state.turn),
    roundStarter: opponentOf(state.roundStarter),
    phase: state.phase,
    lastCallResult: state.lastCallResult ? { ...state.lastCallResult, loser: opponentOf(state.lastCallResult.loser) } : null,
    winner: state.winner ? opponentOf(state.winner) : null,
  };
}
