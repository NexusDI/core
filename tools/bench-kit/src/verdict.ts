import type { PairedRatio } from './bootstrap.ts';

export type Verdict = 'pass' | 'fail' | 'inconclusive';

/** Core spec 17.3: the hook build may be at most 3% slower, beyond the noise the run measured. */
export function dispatchVerdict(
  r: PairedRatio,
  bound = 1.03,
  maxWidth = 0.06,
): Verdict {
  if (r.low > bound) return 'fail';
  if (r.high - r.low > maxWidth) return 'inconclusive';
  return 'pass';
}
