export interface Stats {
  median: number;
  mad: number;
  p5: number;
  p95: number;
  iterations: number;
  noisy: boolean;
}

function sorted(xs: readonly number[]): number[] {
  if (xs.length === 0) throw new RangeError('stats of an empty sample');
  return [...xs].sort((a, b) => a - b);
}

/** Linear interpolation between closest ranks (type 7, as R and NumPy default). */
function rank(s: readonly number[], p: number): number {
  const h = (s.length - 1) * (p / 100);
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return s[lo] + (s[hi] - s[lo]) * (h - lo);
}

export function percentile(xs: readonly number[], p: number): number {
  return rank(sorted(xs), p);
}

export function median(xs: readonly number[]): number {
  return rank(sorted(xs), 50);
}

export function mad(xs: readonly number[]): number {
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

export function summarize(xs: readonly number[]): Stats {
  const s = sorted(xs);
  const m = rank(s, 50);
  const d = mad(s);
  return {
    median: m,
    mad: d,
    p5: rank(s, 5),
    p95: rank(s, 95),
    iterations: s.length,
    noisy: d > 0.05 * m,
  };
}
