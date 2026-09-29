import { mulberry32 } from './random.ts';
import { median, percentile } from './stats.ts';

export interface PairedRatio {
  median: number;
  low: number;
  high: number;
  pairs: number;
}

export function blockSize(n: number): number {
  return Math.ceil(Math.cbrt(n) - 1e-9);
}

/**
 * The median of numerator[i] / denominator[i] with a circular block
 * bootstrap 95% interval. Consecutive iterations share machine state, so
 * resamples draw blocks of consecutive pairs. A caller whose pairs come
 * from several worker processes in turn passes the pairs per process as
 * `block`, so the interval carries the process-to-process noise too.
 */
export function pairedRatio(
  numerator: readonly number[],
  denominator: readonly number[],
  seed: number,
  resamples = 10_000,
  block = blockSize(numerator.length),
): PairedRatio {
  if (numerator.length !== denominator.length)
    throw new RangeError('paired samples must have the same length');
  const ratios = numerator.map((x, i) => x / denominator[i]);
  const n = ratios.length;
  const rand = mulberry32(seed);
  const medians: number[] = [];
  const draw = new Array<number>(n);
  for (let r = 0; r < resamples; r++) {
    for (let filled = 0; filled < n;) {
      const start = Math.floor(rand() * n);
      for (let k = 0; k < block && filled < n; k++)
        draw[filled++] = ratios[(start + k) % n];
    }
    medians.push(median(draw));
  }
  return {
    median: median(ratios),
    low: percentile(medians, 2.5),
    high: percentile(medians, 97.5),
    pairs: n,
  };
}
