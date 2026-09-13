import { describe, expect, it } from 'vitest';
import { resolveCall } from './rules';

describe('resolveCall', () => {
  it('makes the caller lose when the actual count meets the bid exactly', () => {
    const result = resolveCall(
      { quantity: 3, face: 2 },
      'ai',
      'player',
      { player: [2, 2, 1], ai: [2, 3, 4] },
    );
    expect(result.actualCount).toBe(3);
    expect(result.bidWasTrue).toBe(true);
    expect(result.loser).toBe('player');
  });

  it('makes the caller lose when the actual count exceeds the bid', () => {
    const result = resolveCall(
      { quantity: 2, face: 4 },
      'ai',
      'player',
      { player: [4, 4], ai: [4, 1] },
    );
    expect(result.actualCount).toBe(3);
    expect(result.bidWasTrue).toBe(true);
    expect(result.loser).toBe('player');
  });

  it('makes the bidder lose when the actual count falls short of the bid', () => {
    const result = resolveCall(
      { quantity: 3, face: 2 },
      'ai',
      'player',
      { player: [1, 1, 1], ai: [2, 3, 4] },
    );
    expect(result.actualCount).toBe(1);
    expect(result.bidWasTrue).toBe(false);
    expect(result.loser).toBe('ai');
  });

  it('counts dice from both hands combined', () => {
    const result = resolveCall(
      { quantity: 2, face: 1 },
      'player',
      'ai',
      { player: [1, 2], ai: [1, 3] },
    );
    expect(result.actualCount).toBe(2);
    expect(result.bidWasTrue).toBe(true);
  });
});
