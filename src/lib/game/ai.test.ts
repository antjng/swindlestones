import { describe, expect, it } from 'vitest';
import { AiMemory, DEFAULT_AI_CONFIG, decideAiAction, probabilityBidIsTrue } from './ai';
import { mulberry32 } from './rng';
import type { DiceHand, Face } from './types';

function randomHand(size: number, rng: () => number): DiceHand {
  return Array.from({ length: size }, () => (1 + Math.floor(rng() * 4)) as Face);
}

describe('probabilityBidIsTrue', () => {
  it('is 1 when the AI already holds enough of the face itself', () => {
    expect(probabilityBidIsTrue({ quantity: 2, face: 3 }, [3, 3, 1], 5)).toBe(1);
  });

  it('is 0 when the shortfall exceeds the unseen dice count', () => {
    expect(probabilityBidIsTrue({ quantity: 5, face: 3 }, [1, 1], 2)).toBe(0);
  });

  it('matches a hand-computed binomial probability for the remaining shortfall', () => {
    // Own hand has zero 3s; need 1 of 2 unseen dice to be a 3.
    // P(X>=1 | n=2, p=0.25) = 1 - 0.75^2 = 0.4375
    expect(probabilityBidIsTrue({ quantity: 1, face: 3 }, [1, 2], 2)).toBeCloseTo(0.4375, 10);
  });
});

describe('decideAiAction', () => {
  it('calls when the current bid is very unlikely to be true', () => {
    // Bid claims five 4s exist; AI holds none, and only 1 unseen die remains.
    const decision = decideAiAction({ quantity: 5, face: 4 }, [1, 1, 1, 1], 1, DEFAULT_AI_CONFIG, mulberry32(1));
    expect(decision.type).toBe('call');
  });

  it('raises with a bid that is likely true when its own hand already guarantees the current one', () => {
    const hand: DiceHand = [2, 2, 2, 2];
    for (let seed = 1; seed <= 20; seed++) {
      const decision = decideAiAction({ quantity: 1, face: 2 }, hand, 1, DEFAULT_AI_CONFIG, mulberry32(seed));
      expect(decision.type).toBe('bid');
      if (decision.type === 'bid') expect(probabilityBidIsTrue(decision.bid, hand, 1)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('always opens the bidding with a legal bid when there is no current bid', () => {
    const decision = decideAiAction(null, [1, 2, 3, 4], 4, DEFAULT_AI_CONFIG, mulberry32(5));
    expect(decision.type).toBe('bid');
  });

  it('calls when the maximum possible bid is already on the table and no raise exists', () => {
    const decision = decideAiAction({ quantity: 2, face: 4 }, [4, 4], 0, DEFAULT_AI_CONFIG, mulberry32(1));
    expect(decision.type).toBe('call');
  });

  it('does not open with the same bid every time', () => {
    const hand: DiceHand = [1, 2, 3, 4, 2];
    const openings = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const decision = decideAiAction(null, hand, 5, DEFAULT_AI_CONFIG, mulberry32(seed));
      if (decision.type === 'bid') openings.add(`${decision.bid.quantity}x${decision.bid.face}`);
    }
    expect(openings.size).toBeGreaterThanOrEqual(6);
  });

  it('mostly opens on the face it holds a lot of', () => {
    const hand: DiceHand = [3, 3, 3, 3, 3];
    let onThrees = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const decision = decideAiAction(null, hand, 5, DEFAULT_AI_CONFIG, mulberry32(seed));
      if (decision.type === 'bid' && decision.bid.face === 3) onThrees++;
    }
    expect(onThrees).toBeGreaterThan(120);
  });

  it('is quicker to call a player it has caught bluffing', () => {
    const suspicious = new AiMemory();
    const trusting = new AiMemory();
    for (const memory of [suspicious, trusting]) {
      memory.recordPlayerBid({ quantity: 1, face: 2 });
      memory.recordPlayerBid({ quantity: 2, face: 2 });
    }
    for (let i = 0; i < 20; i++) {
      suspicious.recordPlayerBidTested(false);
      trusting.recordPlayerBidTested(true);
    }

    const handRng = mulberry32(11);
    let callsWhenSuspicious = 0;
    let callsWhenTrusting = 0;
    for (let i = 0; i < 400; i++) {
      const hand = randomHand(4, handRng);
      const bid = { quantity: 3, face: 2 as Face };
      if (decideAiAction(bid, hand, 4, DEFAULT_AI_CONFIG, mulberry32(i), suspicious).type === 'call') callsWhenSuspicious++;
      if (decideAiAction(bid, hand, 4, DEFAULT_AI_CONFIG, mulberry32(i), trusting).type === 'call') callsWhenTrusting++;
    }
    expect(callsWhenSuspicious).toBeGreaterThan(callsWhenTrusting);
  });
});

describe('AiMemory', () => {
  it('learns how honest the player is from called bids', () => {
    const memory = new AiMemory();
    const start = memory.playerHonesty;
    memory.recordPlayerBidTested(false);
    memory.recordPlayerBidTested(false);
    expect(memory.playerHonesty).toBeLessThan(start);
  });

  it('forgets this round\'s bids when a new round starts', () => {
    const memory = new AiMemory();
    memory.recordPlayerBid({ quantity: 2, face: 3 });
    memory.startRound();
    expect(memory.playerBids).toHaveLength(0);
  });

  it('tracks how often the player calls the AI\'s bids', () => {
    const memory = new AiMemory();
    const start = memory.playerCallRate;
    for (let i = 0; i < 10; i++) memory.recordPlayerResponse(true);
    expect(memory.playerCallRate).toBeGreaterThan(start);
  });
});
