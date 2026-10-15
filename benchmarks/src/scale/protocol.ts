/**
 * The pure statistics of the budget design (scale spec 7.4): the protocol
 * check that gates the timing mode, and the prefix widths that the width rule
 * reads. Neither touches a process or a file.
 */
import { pairedRatio, type PairedRatio } from '@nexusdi/bench-kit';

import {
  LIBRARIES,
  type LibraryId,
  type ProtocolCheck,
  type ProtocolDouble,
  type PrefixWidth,
  type Variant,
} from '../schema.ts';
import { SIZES, type Shape } from './config.ts';
import type { FreshMode } from './fresh.ts';

/** One cell in one mode of the protocol-check block: its per-round startup, ns. */
export interface ProtocolRow {
  library: LibraryId;
  variant: Variant;
  size: number;
  mode: FreshMode;
  startup: number[];
}

/** A double ratio passes when its median is within 2% of 1, or its interval contains 1. */
const MARGIN = 0.02;
const passes = (r: PairedRatio) =>
  Math.abs(r.median - 1) <= MARGIN || (r.low <= 1 && r.high >= 1);

const isReference = (c: { library: string; variant: string }) =>
  c.library === 'nexusdi' && c.variant === 'plain';

/**
 * The double ratio of mode `a` over mode `b` for NexusDI plain against each
 * competitor, on startup: per round, (nexus a / nexus b) over (competitor a /
 * competitor b), so a shift every library shares cancels and a library
 * specific one shows.
 */
function doubles(
  rows: readonly ProtocolRow[],
  a: FreshMode,
  b: FreshMode,
  seed: number,
): ProtocolDouble[] {
  const find = (
    c: Pick<ProtocolRow, 'library' | 'variant' | 'size'>,
    mode: FreshMode,
  ) => {
    const row = rows.find(
      (r) =>
        r.library === c.library &&
        r.variant === c.variant &&
        r.size === c.size &&
        r.mode === mode,
    );
    if (row === undefined)
      throw new Error(
        `protocol check: ${c.library}/${c.variant} at ${c.size} has no ${mode} rows`,
      );
    return row;
  };
  const out: ProtocolDouble[] = [];
  const competitors = rows
    .filter((r) => !isReference(r) && r.mode === 'timing')
    .sort(
      (x, y) =>
        LIBRARIES.indexOf(x.library) - LIBRARIES.indexOf(y.library) ||
        x.size - y.size,
    );
  for (const c of competitors) {
    const nexus = {
      library: 'nexusdi' as const,
      variant: 'plain' as const,
      size: c.size,
    };
    const nA = find(nexus, a).startup;
    const nB = find(nexus, b).startup;
    const cA = find(c, a).startup;
    const cB = find(c, b).startup;
    const nexusShift = nA.map((x, i) => x / (nB[i] ?? NaN));
    const rivalShift = cA.map((x, i) => x / (cB[i] ?? NaN));
    const ratio = pairedRatio(nexusShift, rivalShift, seed);
    out.push({ library: c.library, size: c.size, ratio, pass: passes(ratio) });
  }
  return out;
}

/**
 * The check that gates the timing mode (spec 7.4): every cell in the heap
 * mode (the old protocol), the timing mode and the timing mode without the
 * gc() before create, in one block. The timing mode stands when every double
 * ratio of timing over heap passes; the gc() before create stays when every
 * double ratio of timing-no-gc over timing passes.
 */
export function protocolCheck(
  rows: readonly ProtocolRow[],
  seed: number,
): ProtocolCheck {
  if (!rows.some(isReference))
    throw new Error('protocol check: no NexusDI plain rows to compare against');
  const timingVsHeap = doubles(rows, 'timing', 'heap', seed);
  const noGcVsTiming = doubles(rows, 'timing-no-gc', 'timing', seed);
  const first = rows.find((r) => r.mode === 'timing');
  return {
    rounds: first?.startup.length ?? 0,
    timingVsHeap,
    noGcVsTiming,
    timingStands: timingVsHeap.every((d) => d.pass),
    gcBeforeCreate: noGcVsTiming.every((d) => d.pass) ? 'keep' : 'drop',
  };
}

/** A cell of a fresh-process block, as the width rule reads it. */
export interface WidthCell {
  library: LibraryId;
  variant: Variant;
  size: number;
  startup: number[];
  ready: number[];
  firstResolve: number[];
  heapReady: number[];
}

/** Resamples for a width: fewer than the published 10,000, since only the width is read. */
const WIDTH_RESAMPLES = 2000;

const width = (r: PairedRatio) => (r.high - r.low) / r.median;

/**
 * For each prefix of the measured rounds that fits, the maximum relative
 * width (interval over median) of the metric set (scale spec 7.4): every
 * competitor's paired ratio on startup, ready and first-resolve, every
 * growth ratio between adjacent sizes on startup and ready, and the
 * heap-ready ratios of the heap block, which keeps its own rounds.
 */
export function prefixWidths(
  shape: Shape,
  cells: readonly WidthCell[],
  heapCells: readonly WidthCell[],
  seed: number,
  prefixes: readonly number[],
  resamples = WIDTH_RESAMPLES,
): PrefixWidth[] {
  const rounds = Math.max(0, ...cells.map((c) => c.startup.length));
  const sizes = SIZES.filter((n) => cells.some((c) => c.size === n));
  const out: PrefixWidth[] = [];
  for (const p of prefixes.filter((n) => n <= rounds)) {
    let max = { width: 0, metric: '' };
    const note = (metric: string, r: PairedRatio) => {
      if (width(r) > max.width) max = { width: width(r), metric };
    };
    const head = (xs: readonly number[]) => xs.slice(0, p);
    for (const n of sizes) {
      const nexus = cells.find((c) => isReference(c) && c.size === n);
      if (nexus === undefined) continue;
      for (const c of cells.filter((x) => !isReference(x) && x.size === n))
        for (const [metric, field] of [
          ['startup', 'startup'],
          ['ready', 'ready'],
          ['first-resolve', 'firstResolve'],
        ] as const)
          note(
            `${metric} ${c.library} ${n}`,
            pairedRatio(head(nexus[field]), head(c[field]), seed, resamples),
          );
    }
    for (const lib of new Set(cells.map((c) => `${c.library}/${c.variant}`))) {
      for (let i = 1; i < sizes.length; i++) {
        const lo = cells.find(
          (c) => `${c.library}/${c.variant}` === lib && c.size === sizes[i - 1],
        );
        const hi = cells.find(
          (c) => `${c.library}/${c.variant}` === lib && c.size === sizes[i],
        );
        if (lo === undefined || hi === undefined) continue;
        for (const field of ['startup', 'ready'] as const)
          note(
            `growth ${lib} ${sizes[i - 1]} to ${sizes[i]} ${field}`,
            pairedRatio(head(hi[field]), head(lo[field]), seed, resamples),
          );
      }
    }
    for (const n of sizes) {
      const nexus = heapCells.find((c) => isReference(c) && c.size === n);
      if (nexus === undefined) continue;
      for (const c of heapCells.filter((x) => !isReference(x) && x.size === n))
        note(
          `heap-ready ${c.library} ${n}`,
          pairedRatio(nexus.heapReady, c.heapReady, seed, resamples, 4),
        );
    }
    out.push({ shape, rounds: p, maxWidth: max.width, metric: max.metric });
  }
  return out;
}
