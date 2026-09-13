import { describe, expect, it } from 'vitest';
import { binomialPmf, probAtLeast } from './probability';

describe('binomialPmf', () => {
  it('matches a hand-computed value', () => {
    // P(X=1 | n=1, p=0.25) = 0.25
    expect(binomialPmf(1, 1, 0.25)).toBeCloseTo(0.25, 10);
    // P(X=2 | n=2, p=0.25) = 0.0625
    expect(binomialPmf(2, 2, 0.25)).toBeCloseTo(0.0625, 10);
  });

  it('is zero outside [0, n]', () => {
    expect(binomialPmf(3, -1, 0.25)).toBe(0);
    expect(binomialPmf(3, 4, 0.25)).toBe(0);
  });
});

describe('probAtLeast', () => {
  it('is 1 when k <= 0', () => {
    expect(probAtLeast(5, 0, 0.25)).toBe(1);
    expect(probAtLeast(5, -2, 0.25)).toBe(1);
  });

  it('is 0 when k exceeds n', () => {
    expect(probAtLeast(3, 4, 0.25)).toBe(0);
  });

  it('matches a hand-computed value for n=1', () => {
    expect(probAtLeast(1, 1, 0.25)).toBeCloseTo(0.25, 10);
  });

  it('matches a hand-computed value for n=2, k=1', () => {
    // P(X>=1 | n=2, p=0.25) = 1 - P(X=0) = 1 - 0.75^2 = 0.4375
    expect(probAtLeast(2, 1, 0.25)).toBeCloseTo(0.4375, 10);
  });

  it('sums to the full probability mass across k=0..n', () => {
    const n = 6;
    const p = 0.25;
    let total = 0;
    for (let k = 0; k <= n; k++) total += binomialPmf(n, k, p);
    expect(total).toBeCloseTo(1, 10);
  });
});
