import type { Unit } from '../../tools/benchmark-path.mjs';
import type {
  BenchmarkData,
  DetectedAt,
  LibraryFacts,
  LibraryId,
  Probe,
} from '../../tools/benchmark-data.mjs';

export const LIBRARY_NAMES: Record<LibraryId, string> = {
  nexusdi: 'NexusDI',
  inversify: 'InversifyJS',
  tsyringe: 'tsyringe',
  awilix: 'awilix',
  'needle-di': 'needle-di',
};

export const OUTCOME_LABELS: Record<string, string> = {
  pass: 'pass',
  'compile-error': 'compile error',
  'runtime-error': 'runtime error',
  'wrong-instance': 'wrong instance',
  'not-applicable': 'not applicable',
};

export const DETECTED_LABELS: Record<DetectedAt, string> = {
  typecheck: 'type check',
  create: 'container creation',
  'first-resolve': 'first resolve',
  never: 'never',
  'not-applicable': 'not applicable',
};

export const PROBE_LABELS: Record<Probe, string> = {
  'missing-provider': 'A provider is never registered',
  cycle: 'Two providers depend on each other',
  'captive-scoped': 'A singleton depends on a scoped provider',
  'wrong-dep-type': 'A dependency has the wrong type',
  'two-mistakes': 'A missing provider and a cycle together',
};

/** The measured libraries in libraries.json order, NexusDI first. */
export function libraryEntries(
  data: BenchmarkData,
): [LibraryId, LibraryFacts][] {
  return Object.entries(data.libraries) as [LibraryId, LibraryFacts][];
}

/** The site names no metadata package; the polyfill is described by its role. */
export function polyfillLabel(polyfill: string | null): string | null {
  return polyfill === null ? null : 'decorator metadata polyfill';
}

function significant(value: number): string {
  return Number(value.toPrecision(3)).toLocaleString('en-US');
}

/** Nanoseconds in the largest unit that keeps the value at 1 or more. */
export function formatDuration(ns: number): string {
  for (const [unit, factor] of [
    ['s', 1e9],
    ['ms', 1e6],
    ['µs', 1e3],
  ] as const) {
    if (Math.abs(ns) >= factor) return `${significant(ns / factor)} ${unit}`;
  }
  return `${significant(ns)} ns`;
}

/** Bytes below 1,000, and kB (1,000 bytes) from there. */
export function formatBytes(bytes: number): string {
  return bytes < 1000 ? `${bytes} B` : `${(bytes / 1000).toFixed(1)} kB`;
}

/** A ratio of NexusDI's time to another library's; below 1 means NexusDI took less. */
export function formatRatio(ratio: {
  median: number;
  low: number;
  high: number;
}): string {
  return `NexusDI ÷ this: ${ratio.median.toFixed(2)}× (95% interval ${ratio.low.toFixed(2)}× to ${ratio.high.toFixed(2)}×)`;
}

/** A figure as the page shows it, and its exact value for the tooltip. */
export function formatFigure(
  value: string | number | boolean | null,
  unit: Unit,
): { text: string; exact: string | null } {
  if (typeof value !== 'number') return { text: String(value), exact: null };
  if (unit === 'bytes')
    return {
      text: formatBytes(value),
      exact: `${value.toLocaleString('en-US')} bytes`,
    };
  if (unit === 'ns')
    return {
      text: formatDuration(value),
      exact: `${value.toLocaleString('en-US')} ns`,
    };
  if (unit === 'ms')
    return {
      text: formatDuration(value * 1e6),
      exact: `${value.toLocaleString('en-US')} ms`,
    };
  if (unit === 'ratio') return { text: `${value.toFixed(2)}×`, exact: null };
  return { text: value.toLocaleString('en-US'), exact: null };
}
