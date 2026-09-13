import { describe, expect, it } from 'vitest';
import { createInitialMatchState, reduce, STARTING_DICE, totalDiceInPlay } from './match';
import { mulberry32 } from './rng';

describe('createInitialMatchState', () => {
  it('gives both players the starting dice count and no rolled hands yet', () => {
    const state = createInitialMatchState(mulberry32(1));
    expect(state.diceCounts).toEqual({ player: STARTING_DICE, ai: STARTING_DICE });
    expect(state.hands).toEqual({ player: [], ai: [] });
    expect(state.phase).toBe('awaitingRoll');
    expect(state.winner).toBeNull();
  });

  it('picks the round starter from the seeded RNG, deterministically', () => {
    const a = createInitialMatchState(mulberry32(1)).roundStarter;
    const b = createInitialMatchState(mulberry32(1)).roundStarter;
    expect(a).toBe(b);
  });
});

describe('reduce: startRound', () => {
  it('rolls both hands matching current dice counts and enters bidding', () => {
    const rng = mulberry32(2);
    const initial = createInitialMatchState(rng);
    const started = reduce(initial, { type: 'startRound' }, rng);
    expect(started.hands.player).toHaveLength(STARTING_DICE);
    expect(started.hands.ai).toHaveLength(STARTING_DICE);
    expect(started.phase).toBe('bidding');
    expect(started.currentBid).toBeNull();
    expect(started.turn).toBe(started.roundStarter);
  });

  it('throws if a round is already in progress', () => {
    const rng = mulberry32(2);
    const started = reduce(createInitialMatchState(rng), { type: 'startRound' }, rng);
    expect(() => reduce(started, { type: 'startRound' }, rng)).toThrow();
  });
});

describe('reduce: bid', () => {
  function beginRound(seed: number) {
    const rng = mulberry32(seed);
    const initial = createInitialMatchState(rng);
    const started = reduce(initial, { type: 'startRound' }, rng);
    return { rng, started };
  }

  it('rejects a bid from the player whose turn it is not', () => {
    const { rng, started } = beginRound(3);
    const notTheirTurn = started.turn === 'player' ? 'ai' : 'player';
    expect(() =>
      reduce(started, { type: 'bid', by: notTheirTurn, bid: { quantity: 1, face: 1 } }, rng),
    ).toThrow();
  });

  it('rejects an illegal (non-raising) bid', () => {
    const { rng, started } = beginRound(3);
    const first = reduce(
      started,
      { type: 'bid', by: started.turn, bid: { quantity: 2, face: 2 } },
      rng,
    );
    const other = first.turn;
    expect(() =>
      reduce(first, { type: 'bid', by: other, bid: { quantity: 2, face: 1 } }, rng),
    ).toThrow();
  });

  it('accepts a legal raise and passes the turn to the opponent', () => {
    const { rng, started } = beginRound(3);
    const first = reduce(
      started,
      { type: 'bid', by: started.turn, bid: { quantity: 1, face: 1 } },
      rng,
    );
    expect(first.currentBid).toEqual({ quantity: 1, face: 1 });
    expect(first.turn).not.toBe(started.turn);
    expect(first.phase).toBe('bidding');
  });
});

describe('reduce: call', () => {
  it('decrements the loser dice count and hands the next round to the loser', () => {
    const rng = mulberry32(4);
    let state = createInitialMatchState(rng);
    state = reduce(state, { type: 'startRound' }, rng);

    // Force a known, unambiguous scenario: bid something guaranteed false, then call it.
    const bidder = state.turn;
    const caller = bidder === 'player' ? 'ai' : 'player';
    const impossibleBid = { quantity: totalDiceInPlay(state) + 0, face: 1 as const };
    // Use the maximum legal quantity at face 1 - guaranteed true only if every die is a 1,
    // which is astronomically unlikely for this seed; assert on the actual outcome instead
    // of assuming which side loses.
    const afterBid = reduce(state, { type: 'bid', by: bidder, bid: impossibleBid }, rng);
    const afterCall = reduce(afterBid, { type: 'call', by: caller }, rng);

    expect(afterCall.lastCallResult).not.toBeNull();
    const loser = afterCall.lastCallResult!.loser;
    expect(afterCall.diceCounts[loser]).toBe(state.diceCounts[loser] - 1);
    const winner = loser === 'player' ? 'ai' : 'player';
    expect(afterCall.diceCounts[winner]).toBe(state.diceCounts[winner]);
    expect(afterCall.roundStarter).toBe(loser);
    expect(afterCall.turn).toBe(loser);
    expect(afterCall.phase).toBe('roundOver');
  });

  it('ends the match once the loser reaches zero dice', () => {
    const rng = mulberry32(5);
    let state = createInitialMatchState(rng);
    // Manually collapse both players down to 1 die each to reach match point quickly.
    state = { ...state, diceCounts: { player: 1, ai: 1 } };
    state = reduce(state, { type: 'startRound' }, rng);

    const bidder = state.turn;
    const caller = bidder === 'player' ? 'ai' : 'player';
    const bid = { quantity: 2, face: 1 as const }; // the maximum legal bid with only 2 dice total
    const afterBid = reduce(state, { type: 'bid', by: bidder, bid }, rng);
    const afterCall = reduce(afterBid, { type: 'call', by: caller }, rng);

    expect(afterCall.phase).toBe('matchOver');
    expect(afterCall.winner).not.toBeNull();
    expect(afterCall.diceCounts[afterCall.winner!]).toBeGreaterThan(0);
    const loser = afterCall.winner === 'player' ? 'ai' : 'player';
    expect(afterCall.diceCounts[loser]).toBe(0);
  });

  it('rejects calling before any bid has been made', () => {
    const rng = mulberry32(6);
    const state = reduce(createInitialMatchState(rng), { type: 'startRound' }, rng);
    expect(() => reduce(state, { type: 'call', by: state.turn }, rng)).toThrow();
  });
});
