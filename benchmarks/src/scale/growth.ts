/**
 * Growth of a fresh-process metric with graph size (scale spec 6.4). One
 * local exponent per adjacent pair of sizes, from paired per-round times,
 * and the marginal cost of one more provider between 1,000 and 5,000. A
 * single log-log fit over all sizes would read a large fixed cost as
 * sub-linear growth, so the suite publishes no single exponent.
 */
import { median, pairedRatio } from '@nexusdi/bench-kit';

import { PER_PROVIDER } from './config.ts';

export interface LocalExponent {
  exponent: number;
  /** The bootstrap 95% interval of the ratio, through the same transform. */
  low: number;
  high: number;
}

/**
 * `b(lo, hi) = log(R) / log(hi / lo)`, where `R` is `pairedRatio(t_hi, t_lo)`:
 * the median over rounds of the same library's time at `hi` over its time at
 * `lo` in the same round. `atLo[r]` and `atHi[r]` come from round `r`.
 */
export function localExponent(
  atLo: readonly number[],
  atHi: readonly number[],
  lo: number,
  hi: number,
  seed: number,
  resamples?: number,
): LocalExponent {
  if (!(hi > lo && lo > 0))
    throw new RangeError(`sizes must be increasing and positive: ${lo}, ${hi}`);
  const r = pairedRatio(atHi, atLo, seed, resamples);
  const span = Math.log(hi / lo);
  return {
    exponent: Math.log(r.median) / span,
    low: Math.log(r.low) / span,
    high: Math.log(r.high) / span,
  };
}

/**
 * `(median(atHi) - median(atLo)) / (hi - lo)`: ns or bytes per provider
 * between the two sizes, 1,000 and 5,000 by default.
 */
export function marginalPerProvider(
  atLo: readonly number[],
  atHi: readonly number[],
  lo: number = PER_PROVIDER.from,
  hi: number = PER_PROVIDER.to,
): number {
  return (median(atHi) - median(atLo)) / (hi - lo);
}
