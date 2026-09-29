import { mulberry32 } from './random.ts';

/**
 * A Williams design: every item takes every position equally often and
 * follows every other item equally often. Odd n needs the square and its
 * mirror, so it returns 2n rows.
 */
export function williams(n: number): number[][] {
  const first: number[] = [];
  for (let i = 0, lo = 0, hi = n - 1; i < n; i++)
    first.push(i % 2 === 0 ? lo++ : hi--);
  const rows = Array.from({ length: n }, (_, r) =>
    first.map((x) => (x + r) % n),
  );
  return n % 2 === 0
    ? rows
    : [...rows, ...rows.map((row) => [...row].reverse())];
}

/** The order of round `round`: the square's rows cycled, items relabelled by a seeded shuffle. */
export function orderFor(round: number, n: number, seed: number): number[] {
  const rows = williams(n);
  const labels = Array.from({ length: n }, (_, i) => i);
  const rand = mulberry32(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [labels[i], labels[j]] = [labels[j], labels[i]];
  }
  return rows[round % rows.length].map((x) => labels[x]);
}
