import type { Lifetime, RunKind } from '@nexusdi/core';

/** What profile().report() returns: plain JSON that JSON.stringify keeps whole. */
export interface ProfileReport {
  readonly format: 'nexusdi-profile';
  readonly version: 1;
  /** performance.timeOrigin of the realm that recorded it. */
  readonly timeOrigin: number;
  /** performance.now() when report() ran; a pending span ends here. */
  readonly reportedMs: number;
  readonly runs: readonly ProfileRun[];
  /** From context.blueprint() at report time; null when no create reached setup. */
  readonly graph: {
    /** The root module's name, looked up in view.modules by BlueprintView.root. */
    readonly root: string;
    readonly providers: readonly {
      readonly id: string;
      readonly token: string;
      readonly module: string;
      readonly lifetime: string | null;
      readonly kind: string;
      /** ProviderView.inline (startup profiler spec 3.7). */
      readonly inline: boolean;
    }[];
    readonly edges: readonly {
      readonly from: string;
      readonly to: string;
      readonly kind: string;
      /** EdgeView.ordersBuild (startup profiler spec 3.7). */
      readonly ordersBuild: boolean;
    }[];
  } | null;
  readonly dropped: number;
  readonly dispose: {
    readonly startMs: number;
    readonly durationMs: number;
    readonly errors: number;
  } | null;
}

/** One create, load, createScope or extend() as the profiler recorded it. */
export interface ProfileRun {
  readonly id: number;
  /**
   * Typed as core's RunKind. parseProfileReport accepts any string here, so
   * a report from a newer core keeps a kind this union lacks, and a reader
   * handles one with a default branch.
   */
  readonly kind: RunKind;
  readonly scope: string | null;
  /** null while the run is open. */
  readonly ok: boolean | null;
  readonly startMs: number;
  /** null while the run is open. */
  readonly durationMs: number | null;
  readonly compile: {
    readonly startMs: number;
    readonly durationMs: number;
    readonly modules: number;
    readonly providers: number;
    readonly errors: number;
  } | null;
  /** Derived from event spans (section 7.2). A step with no events is absent. */
  readonly steps: readonly {
    readonly step: 'compile' | 'static' | 'build' | 'init' | 'setup';
    readonly startMs: number;
    readonly durationMs: number;
  }[];
  /** Every construct and construct:failed of the run, in event order. */
  readonly builds: readonly ProfileBuild[];
  /** Every init and init:failed of the run, in event order. */
  readonly inits: readonly ProfileInit[];
  /** Thenables core is still awaiting. Empty once the run settled. */
  readonly pending: readonly {
    readonly providerId: string;
    readonly token: string;
    readonly module: string;
    readonly level: number | null;
    readonly what: 'construct' | 'init';
    readonly startMs: number;
    readonly syncMs: number;
  }[];
}

/** One construct or construct:failed event. */
export interface ProfileBuild {
  readonly providerId: string;
  readonly token: string;
  readonly module: string;
  /** Core's Lifetime; parseProfileReport accepts any string, as for ProfileRun.kind. */
  readonly lifetime: Lifetime | null;
  readonly scope: string | null;
  readonly async: boolean;
  readonly level: number | null;
  readonly parent: string | null;
  readonly startMs: number;
  /** null for a failed build. */
  readonly syncMs: number | null;
  readonly awaitMs: number | null;
  /** null for a failed build. */
  readonly finishMs: number | null;
  readonly durationMs: number;
  readonly failed: boolean;
}

/** One init or init:failed event. */
export interface ProfileInit {
  readonly providerId: string;
  readonly token: string;
  readonly level: number | null;
  readonly async: boolean;
  readonly startMs: number;
  /** null for a failed onInit. */
  readonly syncMs: number | null;
  readonly awaitMs: number | null;
  readonly durationMs: number;
  readonly failed: boolean;
}

/** One startup step of a run, derived from its event spans (spec 7.2). */
export type ProfileStep = ProfileRun['steps'][number];
/** A thenable core was still awaiting when report() ran. */
export type ProfilePending = ProfileRun['pending'][number];

/** The build step's critical path of one run (spec 7.2). */
export interface CriticalPath {
  readonly run: number;
  readonly buildMs: number;
  readonly boundMs: number;
  readonly barrierMs: number;
  readonly path: readonly {
    readonly providerId: string;
    readonly token: string;
    readonly level: number;
    readonly ownMs: number;
    readonly dependsOnPrevious: boolean;
    /** Async providers only; null otherwise. */
    readonly lateMs: number | null;
  }[];
  readonly waits: readonly {
    readonly providerId: string;
    readonly token: string;
    readonly waitMs: number;
  }[];
}

/** A V8 .cpuprofile, as Profiler.stop and node --cpu-prof return it. */
export interface CpuProfile {
  readonly nodes: readonly CpuProfileNode[];
  /** µs on the V8 profile clock. */
  readonly startTime: number;
  readonly endTime: number;
  readonly samples: readonly number[];
  readonly timeDeltas: readonly number[];
}

export interface CpuProfileNode {
  readonly id: number;
  readonly callFrame: {
    readonly functionName: string;
    readonly scriptId: string | number;
    readonly url: string;
    readonly lineNumber: number;
    readonly columnNumber: number;
  };
  readonly hitCount?: number;
  readonly children?: readonly number[];
}

/** A Trace Event Format file, as Chrome DevTools and Perfetto load it. */
export interface TraceFile {
  readonly traceEvents: readonly Readonly<Record<string, unknown>>[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly displayTimeUnit?: 'ms' | 'ns';
}
