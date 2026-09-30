import type { PairedRatio } from './bootstrap.ts';

export type Verdict = 'pass' | 'fail' | 'inconclusive';

/**
 * Core spec 17.3: the hook build may be at most 3% slower. It passes when the
 * median is at or under the bound and the interval is narrow enough to trust.
 * It fails when the whole interval is above the bound. Anything else is
 * inconclusive, including a median above the bound whose interval reaches it.
 */
export function dispatchVerdict(
  r: PairedRatio,
  bound = 1.03,
  maxWidth = 0.06,
): Verdict {
  if (r.low > bound) return 'fail';
  if (r.median > bound) return 'inconclusive';
  if (r.high - r.low > maxWidth) return 'inconclusive';
  return 'pass';
}

/**
 * Whether a K14 case fails the job once its one extension has run (spec
 * 14.6). A `fail` blocks, and so does an `inconclusive` whose median is above
 * the bound, so a regression cannot pass through a wide interval. An
 * `inconclusive` with the median at or under the bound only warns.
 */
export function dispatchBlocks(
  verdict: Verdict,
  r: PairedRatio,
  bound = 1.03,
): boolean {
  return verdict === 'fail' || (verdict === 'inconclusive' && r.median > bound);
}
