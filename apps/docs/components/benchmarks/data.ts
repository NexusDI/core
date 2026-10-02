import type { BenchmarkData } from '../../tools/benchmark-data.mjs';
import raw from '../../generated/benchmark-data.json';

/** `docs:benchmark-data` writes the file before `build` and `typecheck` run. */
export const benchmarkData = raw as unknown as BenchmarkData;
