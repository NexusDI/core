import { lookup, unitOf } from '../../tools/benchmark-path.mjs';

import { benchmarkData } from './data';
import { formatFigure } from './format';

/**
 * One figure inline in prose, addressed by a path of benchmarks spec §4.9:
 * `<Figure of="size.nexusdi.plain.esbuild.gzip" />`. A path the results do
 * not hold throws, so `next build` fails on it.
 */
export function Figure({ of, run }: { of: string; run?: string }) {
  let found: ReturnType<typeof lookup>;
  try {
    found = lookup(benchmarkData, of, run);
  } catch (error) {
    throw new Error(`<Figure of="${of}">: ${(error as Error).message}`);
  }
  const unit = unitOf(of);
  const { text, exact } = formatFigure(found.value, unit);
  const noisy =
    (unit === 'ns' || unit === 'ms') && found.record['noisy'] === true;
  return (
    <span className="nexus-bench__figure" title={exact ?? undefined}>
      <data value={String(found.value)}>{text}</data>
      {noisy ? <span className="nexus-bench__noisy">noisy</span> : null}
    </span>
  );
}
