import type { BenchmarkData } from './benchmark-data.mjs';

export type Unit = 'bytes' | 'ns' | 'ms' | 'ratio' | 'plain';

export function lookup(
  data: BenchmarkData,
  path: string,
  run?: string,
): { value: string | number | boolean | null; record: Record<string, unknown> };
export function unitOf(path: string): Unit;
