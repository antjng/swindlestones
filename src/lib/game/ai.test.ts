import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_CONFIG, decideAiAction, probabilityBidIsTrue } from './ai';
import { mulberry32 } from './rng';

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
    const decision = decideAiAction(
      { quantity: 5, face: 4 },
      [1, 1, 1, 1],
      1,
      DEFAULT_AI_CONFIG,
      mulberry32(1),
    );
    expect(decision.type).toBe('call');
  });

  it('raises with a comfortable bid when its own hand already guarantees it', () => {
    // The current bid (one 2) is already certain given the AI's hand, so it won't call.
    // Among the legal raises, (2 twos) is also guaranteed by the AI's own hand alone.
    const decision = decideAiAction(
      { quantity: 1, face: 2 },
      [2, 2, 2, 2],
      1,
      DEFAULT_AI_CONFIG,
      mulberry32(1),
    );
    expect(decision.type).toBe('bid');
    if (decision.type === 'bid') {
      expect(probabilityBidIsTrue(decision.bid, [2, 2, 2, 2], 1)).toBeGreaterThanOrEqual(
        DEFAULT_AI_CONFIG.comfortThreshold,
      );
    }
  });

  it('always opens the bidding with a legal bid when there is no current bid', () => {
    const decision = decideAiAction(null, [1, 2, 3, 4], 4, DEFAULT_AI_CONFIG, mulberry32(5));
    expect(decision.type).toBe('bid');
  });

  it('never proposes a bid below the callThreshold-passing current bid without a legal raise existing', () => {
    // Force the maximum possible bid already on the table — no legal raise exists,
    // so the AI must either call or (bluff branch skipped, no legal bids) call.
    const decision = decideAiAction(
      { quantity: 2, face: 4 },
      [4, 4],
      0,
      DEFAULT_AI_CONFIG,
      mulberry32(1),
    );
    expect(decision.type).toBe('call');
  });
});
