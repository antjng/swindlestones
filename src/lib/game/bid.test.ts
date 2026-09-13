import { describe, expect, it } from 'vitest';
import { compareBids, isValidNextBid, listLegalNextBids, maxPossibleBid } from './bid';

describe('compareBids', () => {
  it('orders by quantity first', () => {
    expect(compareBids({ quantity: 3, face: 1 }, { quantity: 2, face: 4 })).toBeGreaterThan(0);
    expect(compareBids({ quantity: 2, face: 4 }, { quantity: 3, face: 1 })).toBeLessThan(0);
  });

  it('orders by face when quantity is equal', () => {
    expect(compareBids({ quantity: 3, face: 4 }, { quantity: 3, face: 1 })).toBeGreaterThan(0);
    expect(compareBids({ quantity: 3, face: 1 }, { quantity: 3, face: 4 })).toBeLessThan(0);
  });

  it('is zero for identical bids', () => {
    expect(compareBids({ quantity: 2, face: 3 }, { quantity: 2, face: 3 })).toBe(0);
  });
});

describe('isValidNextBid', () => {
  it('accepts any bid within range when there is no previous bid', () => {
    expect(isValidNextBid({ quantity: 1, face: 1 }, null, 10)).toBe(true);
    expect(isValidNextBid({ quantity: 10, face: 4 }, null, 10)).toBe(true);
  });

  it('rejects a bid exceeding the total dice in play', () => {
    expect(isValidNextBid({ quantity: 11, face: 1 }, null, 10)).toBe(false);
  });

  it('rejects a bid below quantity 1', () => {
    expect(isValidNextBid({ quantity: 0, face: 1 }, null, 10)).toBe(false);
  });

  it('accepts a higher-quantity raise at any face', () => {
    expect(isValidNextBid({ quantity: 4, face: 1 }, { quantity: 3, face: 4 }, 10)).toBe(true);
  });

  it('accepts a same-quantity raise with a higher face', () => {
    expect(isValidNextBid({ quantity: 3, face: 4 }, { quantity: 3, face: 2 }, 10)).toBe(true);
  });

  it('rejects a same-quantity bid with an equal or lower face', () => {
    expect(isValidNextBid({ quantity: 3, face: 2 }, { quantity: 3, face: 2 }, 10)).toBe(false);
    expect(isValidNextBid({ quantity: 3, face: 1 }, { quantity: 3, face: 2 }, 10)).toBe(false);
  });

  it('rejects a lower-quantity bid even with a higher face', () => {
    expect(isValidNextBid({ quantity: 2, face: 4 }, { quantity: 3, face: 1 }, 10)).toBe(false);
  });

  it('accepts the maximum possible bid as a legal raise', () => {
    const max = maxPossibleBid(10);
    expect(isValidNextBid(max, { quantity: 9, face: 4 }, 10)).toBe(true);
  });
});

describe('listLegalNextBids', () => {
  it('lists every (quantity, face) combination when there is no previous bid', () => {
    const bids = listLegalNextBids(null, 2);
    expect(bids).toHaveLength(2 * 4);
  });

  it('lists only bids strictly greater than the previous one, in ascending order', () => {
    const bids = listLegalNextBids({ quantity: 2, face: 3 }, 3);
    expect(bids[0]).toEqual({ quantity: 2, face: 4 });
    expect(bids.at(-1)).toEqual({ quantity: 3, face: 4 });
    for (const bid of bids) {
      expect(compareBids(bid, { quantity: 2, face: 3 })).toBeGreaterThan(0);
    }
  });

  it('is empty once the previous bid is already the maximum', () => {
    expect(listLegalNextBids(maxPossibleBid(5), 5)).toEqual([]);
  });
});
