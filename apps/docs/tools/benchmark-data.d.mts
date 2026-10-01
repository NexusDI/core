import type {
  BuildCell,
  BuildFile,
  DetectedAt,
  EmitRow,
  LibraryId,
  MatrixCell,
  PairedRatio,
  Probe,
  ProbeRow,
  Runner,
  Scenario,
  SizeRow,
  Stats,
  TimingRow,
  Variant,
  Versions,
} from '../../../benchmarks/src/schema.ts';
import type { Library } from '../../../benchmarks/src/libraries.ts';

export type { DetectedAt, LibraryId, Probe, Scenario, Variant };

/** One results file, as `<MeasuredWith />` names it. */
export interface ResultsSource {
  /** Workspace-relative, for example `benchmarks/results/size.json`. */
  path: string;
  /** The commit that holds the file as built, or null for a local edit. */
  commit: string | null;
  versions: Versions & { bundlers?: { esbuild: string; rollup: string } };
  runner?: Runner;
  startedAt?: string;
  sha?: string;
  seed?: number;
}

export interface LibraryFacts {
  package: string;
  /** The pin; NexusDI's is the measured core version. */
  version: string;
  docs: string;
  polyfill: string | null;
  documentedToolchains: Library['documentedToolchains'];
  /** The variant the library's own documentation teaches. */
  documented: Variant;
  notApplicable: Library['notApplicable'];
}

type ByVariant<T> = Partial<Record<Variant, T>>;
type ByLibrary<T> = Partial<Record<LibraryId, ByVariant<T>>>;

export type TimingRecord = Stats &
  Pick<TimingRow, 'batch' | 'childNow' | 'heapBytes' | 'vsNexus'>;

/** `generated/benchmark-data.json`: the results indexed by the paths of benchmarks spec §4.9. */
export interface BenchmarkData {
  schema: 1;
  /** libs/core/package.json at build time. */
  core: string;
  /** The stem of the newest file in benchmarks/results/timings/. */
  newest: string;
  sources: {
    matrix: ResultsSource;
    probes: ResultsSource;
    size: ResultsSource;
    build: ResultsSource;
    timings: Record<string, ResultsSource>;
  };
  libraries: Partial<Record<LibraryId, LibraryFacts>>;
  matrix: ByLibrary<
    Record<string, Omit<MatrixCell, 'library' | 'variant' | 'toolchain'>>
  >;
  probes: ByLibrary<
    Partial<Record<Probe, Omit<ProbeRow, 'library' | 'variant' | 'probe'>>>
  >;
  size: ByLibrary<
    Partial<
      Record<
        SizeRow['bundler'],
        Omit<SizeRow, 'library' | 'variant' | 'bundler'>
      >
    >
  >;
  emit: ByLibrary<Omit<EmitRow, 'library' | 'variant'>>;
  /** Keyed by run, then library, variant and scenario. */
  timings: Record<string, ByLibrary<Partial<Record<Scenario, TimingRecord>>>>;
  build: BuildFile['build'] & { headline: BuildFile['headline'] };
}

export type { BuildCell, PairedRatio, Stats };

export function buildBenchmarkData(input: {
  results: string;
  libraries: Library[];
  coreVersion: string;
  commitOf: (path: string) => string | null;
}): BenchmarkData;
export function readBenchmarkData(root?: string): BenchmarkData;
