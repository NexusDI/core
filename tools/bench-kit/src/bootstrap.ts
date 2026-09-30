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
 * resamples draw blocks of consecutive pairs, each starting at any pair.
 */
export function pairedRatio(
  numerator: readonly number[],
  denominator: readonly number[],
  seed: number,
  resamples = 10_000,
  block = blockSize(numerator.length),
): PairedRatio {
  const ratios = ratiosOf(numerator, denominator);
  const n = ratios.length;
  return resample(
    ratios,
    seed,
    resamples,
    (rand) => Math.floor(rand() * n),
    block,
  );
}

/**
 * The paired ratio for pairs that come from several worker processes in
 * turn, `cluster` consecutive pairs per process. Resamples draw whole
 * processes with replacement, so the interval carries the
 * process-to-process noise.
 */
export function clusteredRatio(
  numerator: readonly number[],
  denominator: readonly number[],
  seed: number,
  cluster: number,
  resamples = 10_000,
): PairedRatio {
  const ratios = ratiosOf(numerator, denominator);
  const clusters = ratios.length / cluster;
  if (!Number.isInteger(clusters) || clusters < 1)
    throw new RangeError(
      `${ratios.length} pairs do not split into clusters of ${cluster}`,
    );
  return resample(
    ratios,
    seed,
    resamples,
    (rand) => Math.floor(rand() * clusters) * cluster,
    cluster,
  );
}

function ratiosOf(
  numerator: readonly number[],
  denominator: readonly number[],
): number[] {
  if (numerator.length !== denominator.length)
    throw new RangeError('paired samples must have the same length');
  return numerator.map((x, i) => x / denominator[i]);
}

/** Bootstraps the median of `ratios` from blocks of `block` pairs that start where `start` says. */
function resample(
  ratios: readonly number[],
  seed: number,
  resamples: number,
  start: (rand: () => number) => number,
  block: number,
): PairedRatio {
  const n = ratios.length;
  const rand = mulberry32(seed);
  const medians: number[] = [];
  const draw = new Array<number>(n);
  for (let r = 0; r < resamples; r++) {
    for (let filled = 0; filled < n;) {
      const at = start(rand);
      for (let k = 0; k < block && filled < n; k++)
        draw[filled++] = ratios[(at + k) % n];
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
