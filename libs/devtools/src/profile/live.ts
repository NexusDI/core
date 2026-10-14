import type { ProfileReport, ProfileRun } from './report.js';
import { spansOf } from './spans.js';

interface Brands {
  readonly userAgentData?: {
    readonly brands?: readonly {
      readonly brand: string;
      readonly version: string;
    }[];
  };
}

type TimeStamp = (
  label: string,
  start: number,
  end: number,
  track: string,
  group: string,
  color: string,
) => void;

/**
 * The console.timeStamp sink of profile({ live: true }) (spec 6.5), or
 * undefined where it would reach nothing: anything but Chromium 134 and
 * later. A draw never throws; a profiler never fails the app it measures.
 */
export function liveSink(
  trackGroup: string,
): ((run: ProfileRun, graph: ProfileReport['graph']) => void) | undefined {
  const brands =
    (globalThis.navigator as Brands | undefined)?.userAgentData?.brands ?? [];
  if (!brands.some((b) => b.brand === 'Chromium' && Number(b.version) >= 134))
    return undefined;
  const stamp = console.timeStamp as unknown as TimeStamp;
  return (run, graph) => {
    for (const s of spansOf(run, graph, performance.now())) {
      try {
        stamp(s.name, s.startMs, s.endMs, s.track, trackGroup, s.color);
      } catch {
        // Nothing is recording, or the browser changed the signature.
      }
    }
  };
}
