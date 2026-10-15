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

/** Spins for `ms` and returns performance.now() after the spin. */
function nexusdiAnchorSpin(ms: number): number {
  const end = performance.now() + ms;
  while (performance.now() < end);
  return performance.now();
}

// alignClocks finds the anchors in the samples by their names. The spin
// gets no name check: once V8 optimizes an anchor, it inlines the spin and
// the profile drops the spin's frame. The CLI builds with tsc and no
// minifier, so the names reach the profile intact. The spin lasts at least
// 10 ms: the macOS sampler can go 5 to 25 ms without a sample.

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

/** max(1 ms, 4 samples at `interval` µs): the bound both CPU warnings use (spec 8). */
function bound(interval: number): number {
  return Math.max(1, (4 * interval) / 1000);
}

/** What alignClocks found: the offset, how far off it can be, and whether the anchors agree. */
export interface Alignment {
  readonly offsetMs: number;
  readonly errorMs: number;
  /** false when the bounds cross by more than max(1 ms, 4 samples): the samples contradict the clock reads. */
  readonly consistent: boolean;
}

/**
 * The offset from performance.now() ms to the profile's clock (spec 8). A
 * sample at profile time t whose stack holds an anchor, which read the clock
 * at startMs and endMs, puts the offset in [t - endMs, t - startMs]. The offset is the middle
 * of the bounds every such sample of every anchor sets, and errorMs is half
 * their width: the furthest the true offset can sit from it. When the bounds
 * cross, errorMs is half the gap, and consistent is false once the gap passes
 * max(1 ms, 4 samples): a crossing within it is sampler timing noise. null
 * when no anchor has a sample.
 */
export function alignClocks(
  profile: CpuProfile,
  anchors: readonly Anchor[],
  interval: number,
): Alignment | null {
  const names = new Map(
    profile.nodes.map((n) => [n.id, n.callFrame.functionName]),
  );
  const parents = new Map<number, number>();
  for (const n of profile.nodes)
    for (const child of n.children ?? []) parents.set(child, n.id);
  const holds = (id: number, name: string): boolean => {
    for (
      let at: number | undefined = id;
      at !== undefined;
      at = parents.get(at)
    )
      if (names.get(at) === name) return true;
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
    : {
        offsetMs: (lo + hi) / 2,
        errorMs: Math.abs(hi - lo) / 2,
        consistent: lo - hi <= bound(interval),
      };
}

/**
 * The CLI's warning for an alignment, or null: the anchors disagree, or the
 * error passes max(1 ms, 4 samples at `interval` µs) (spec 8).
 */
export function cpuWarning(
  aligned: Alignment,
  interval: number,
): string | null {
  const upTo = `CPU samples may sit up to ${aligned.errorMs.toFixed(1)} ms off the provider spans`;
  if (!aligned.consistent)
    return `nexusdi: warning: the CPU clock and performance.now() disagree by ${(2 * aligned.errorMs).toFixed(1)} ms; ${upTo}.\n`;
  if (aligned.errorMs > bound(interval))
    return `nexusdi: warning: the sampler ran too rarely to align the clocks; ${upTo}.\n`;
  return null;
}
