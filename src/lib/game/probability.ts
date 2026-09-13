function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < kk; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

export function binomialPmf(n: number, k: number, p: number): number {
  if (k < 0 || k > n) return 0;
  return combination(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

/** P(X >= k) for X ~ Binomial(n, p). */
export function probAtLeast(n: number, k: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let sum = 0;
  for (let i = k; i <= n; i++) {
    sum += binomialPmf(n, i, p);
  }
  return sum;
}
