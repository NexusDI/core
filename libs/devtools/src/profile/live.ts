import type { LiveSink } from './report.js';
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
 * A sink for profile({ live }) that draws each run's spans with
 * console.timeStamp in the DevTools track group `trackGroup` (default
 * 'NexusDI'), spec 6.5. undefined outside Chromium 134 and later, where
 * console.timeStamp draws nothing. A draw never throws; a profiler never
 * fails the app it measures.
 */
export function liveSink(
  options: { readonly trackGroup?: string } = {},
): LiveSink | undefined {
  const trackGroup = options.trackGroup ?? 'NexusDI';
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
