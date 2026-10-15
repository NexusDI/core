import { Session } from 'node:inspector/promises';

import type { CpuProfile } from '@nexusdi/devtools';

/** An anchor's name, and performance.now() before and after its spin. */
export type Anchor = readonly [name: string, startMs: number, endMs: number];

/** An open inspector session with the V8 sampling profiler running. */
export interface Sampling {
  readonly session: Session;
  readonly interval: number;
  readonly start: Anchor;
}

/**
 * Starts the V8 sampling profiler in this process, sampling every `interval`
 * µs, and runs the first anchor.
 */
export async function startCpu(interval: number): Promise<Sampling> {
  // Node loads perf_hooks on the first read of the performance global, which
  // takes tens of ms with the profiler on. Reading it here keeps that load
  // out of the profile and out of the first anchor.
  performance.now();
  const session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.setSamplingInterval', { interval });
  await session.post('Profiler.start');
  return { session, interval, start: nexusdiAnchorStart(interval) };
}

/**
 * Runs the second anchor, stops the profiler and closes the session. Returns
 * the profile and both anchors for alignClocks.
 */
export async function stopCpu(sampling: Sampling): Promise<{
  readonly profile: CpuProfile;
  readonly anchors: readonly Anchor[];
}> {
  const end = nexusdiAnchorEnd(sampling.interval);
  try {
    const { profile } = await sampling.session.post('Profiler.stop');
    return {
      profile: {
        nodes: profile.nodes,
        startTime: profile.startTime,
        endTime: profile.endTime,
        samples: profile.samples ?? [],
        timeDeltas: profile.timeDeltas ?? [],
      },
      anchors: [sampling.start, end],
    };
  } finally {
    sampling.session.disconnect();
  }
}

/**
 * Spins for `ms` and returns performance.now() after the spin. alignClocks
 * counts only samples inside it, so every counted sample falls between the
 * anchor's read before the spin and this read after it.
 */
function nexusdiAnchorSpin(ms: number): number {
  const end = performance.now() + ms;
  while (performance.now() < end);
  return performance.now();
}

// alignClocks finds the anchors in the samples by their names and the
// spin's. The CLI builds with tsc and no minifier, so the names reach the
// profile intact. The spin lasts at least 10 ms: the macOS sampler can go
// 5 to 25 ms without a sample.

/** Spins for max(10 ms, 20 samples). */
function nexusdiAnchorStart(interval: number): Anchor {
  const at = performance.now();
  return [
    'nexusdiAnchorStart',
    at,
    nexusdiAnchorSpin(Math.max(10, (20 * interval) / 1000)),
  ];
}

/** The second anchor, the same as the first under another name. */
function nexusdiAnchorEnd(interval: number): Anchor {
  const at = performance.now();
  return [
    'nexusdiAnchorEnd',
    at,
    nexusdiAnchorSpin(Math.max(10, (20 * interval) / 1000)),
  ];
}

/**
 * The offset from performance.now() ms to the profile's clock (spec 8). A
 * sample at profile time t inside an anchor's spin, read between startMs and
 * endMs, puts the offset in [t - endMs, t - startMs]. The offset is the middle
 * of the bounds every such sample of every anchor sets, and errorMs is half
 * their width: the furthest the true offset can sit from it. When the bounds
 * cross, the anchors disagree, and errorMs is half the gap. null when no
 * anchor has a sample.
 */
export function alignClocks(
  profile: CpuProfile,
  anchors: readonly (readonly [name: string, startMs: number, endMs: number])[],
): { readonly offsetMs: number; readonly errorMs: number } | null {
  const names = new Map(
    profile.nodes.map((n) => [n.id, n.callFrame.functionName]),
  );
  const parents = new Map<number, number>();
  for (const n of profile.nodes)
    for (const child of n.children ?? []) parents.set(child, n.id);
  const holds = (id: number, name: string): boolean => {
    let spin = false;
    for (
      let at: number | undefined = id;
      at !== undefined;
      at = parents.get(at)
    ) {
      const frame = names.get(at);
      if (frame === 'nexusdiAnchorSpin') spin = true;
      else if (frame === name) return spin;
    }
    return false;
  };
  let lo = -Infinity;
  let hi = Infinity;
  let t = profile.startTime;
  for (const [i, sample] of profile.samples.entries()) {
    t += profile.timeDeltas[i] ?? 0;
    for (const [name, startMs, endMs] of anchors)
      if (holds(sample, name)) {
        lo = Math.max(lo, t / 1000 - endMs);
        hi = Math.min(hi, t / 1000 - startMs);
      }
  }
  return hi === Infinity
    ? null
    : { offsetMs: (lo + hi) / 2, errorMs: Math.abs(hi - lo) / 2 };
}
