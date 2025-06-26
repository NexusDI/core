// Shared types and base class for all DI benchmarks

import { performance } from 'perf_hooks';

/**
 * The result of a DI benchmark run.
 */
export type BenchmarkResult = {
  startupTime: number; // μs
  registrationTime: number; // μs
  resolutionTime: number; // μs
  memoryAfterStartup: number; // KB
  memoryAfterRegister: number; // KB
  memoryAfterResolve: number; // KB
  memorySUT: number; // KB (estimated SUT-only memory)
  timings: { phase: string; duration: number }[];
  memory: { phase: string; heapUsed: number }[];
  bundleSize?: number; // KB (optional, can be filled by executor)
};

/**
 * Base class for all DI benchmarks. Extend this in your benchmark implementation.
 *
 * Implement:
 * - startup(): container creation only
 * - register(): service registration only
 * - resolve(): resolve UserService and call getUserName
 * - bundleTarget: string or string[]; the npm package name(s) to measure for bundle size
 *
 * The run() method will measure and report all metrics using performance.mark/measure and memory snapshots.
 */
export abstract class BenchmarkBase {
  /**
   * The npm package name(s) to measure for bundle size.
   * Example: '@nexusdi/core' or ['@nexusdi/core', '@nexusdi/extensions']
   */
  abstract bundleTarget: string | string[];

  /**
   * Create the DI container (do not register services here).
   */
  abstract startup(): Promise<void>;

  /**
   * Register services in the DI container (do not create the container here).
   */
  abstract register(): Promise<void>;

  /**
   * Resolve UserService and call getUserName (or equivalent benchmarked operation).
   */
  abstract resolve(): Promise<void>;

  // gets the package.json from the bundleTarget(s), looks up the exports field, and returns the size of the files
  private async getBundleSize(): Promise<number> {
    const bundleTargets = [...this.bundleTarget];
    // @ts-expect-error: TODO: fix this
    const packageJsons = await Promise.all(
      bundleTargets.map(async (target) => {
        const packageJson = await import(target);
        return packageJson;
      })
    );
    return 0; // stub implementation
  }

  /**
   * Runs the benchmark and returns the results, including detailed timings and memory usage.
   * SUT-only memory is estimated as the difference between memory after register and baseline before startup.
   */
  async run(): Promise<BenchmarkResult> {
    const timings: { phase: string; duration: number }[] = [];
    const memory: { phase: string; heapUsed: number }[] = [];

    // --- Baseline memory before SUT ---
    if (global.gc) global.gc();
    const baselineMemory = process.memoryUsage().heapUsed / 1024;

    // --- Startup phase ---
    performance.mark('startup-begin');
    await this.startup();
    performance.mark('startup-end');
    performance.measure('startup', 'startup-begin', 'startup-end');
    const startupMeasure = performance.getEntriesByName('startup').pop();
    const startupTime = startupMeasure ? startupMeasure.duration : 0;
    const memoryAfterStartup = process.memoryUsage().heapUsed / 1024;
    performance.clearMarks('startup-begin');
    performance.clearMarks('startup-end');
    performance.clearMeasures('startup');

    // --- Register phase ---
    performance.mark('register-begin');
    await this.register();
    performance.mark('register-end');
    performance.measure('register', 'register-begin', 'register-end');
    const registerMeasure = performance.getEntriesByName('register').pop();
    const registrationTime = registerMeasure ? registerMeasure.duration : 0;
    const memoryAfterRegister = process.memoryUsage().heapUsed / 1024;
    performance.clearMarks('register-begin');
    performance.clearMarks('register-end');
    performance.clearMeasures('register');

    // --- SUT-only memory estimate ---
    if (global.gc) global.gc();
    const memorySUT = memoryAfterRegister - baselineMemory;

    // --- Resolve phase ---
    performance.mark('resolve-begin');
    await this.resolve();
    performance.mark('resolve-end');
    performance.measure('resolve', 'resolve-begin', 'resolve-end');
    const resolveMeasure = performance.getEntriesByName('resolve').pop();
    const resolutionTime = resolveMeasure ? resolveMeasure.duration : 0;
    const memoryAfterResolve = process.memoryUsage().heapUsed / 1024;
    performance.clearMarks('resolve-begin');
    performance.clearMarks('resolve-end');
    performance.clearMeasures('resolve');

    // --- Bundle size ---
    // @ts-expect-error: TODO: fix this
    const bundleSize = await this.getBundleSize();

    // Collect timings/memory arrays for detailed output
    timings.push({ phase: 'startup', duration: startupTime });
    timings.push({ phase: 'register', duration: registrationTime });
    timings.push({ phase: 'resolve', duration: resolutionTime });
    memory.push({ phase: 'baseline', heapUsed: baselineMemory });
    memory.push({ phase: 'startup', heapUsed: memoryAfterStartup });
    memory.push({ phase: 'register', heapUsed: memoryAfterRegister });
    memory.push({ phase: 'resolve', heapUsed: memoryAfterResolve });
    memory.push({ phase: 'SUT-only', heapUsed: memorySUT });

    return {
      startupTime,
      registrationTime,
      resolutionTime,
      memoryAfterStartup,
      memoryAfterRegister,
      memoryAfterResolve,
      memorySUT,
      timings,
      memory,
      bundleSize: 0, // (optional, can be filled by executor)
    };
  }
}

/**
 * Shared interfaces for benchmarked services
 */
export interface ILoggerService {
  log(message: string): void;
}

export interface IDatabase {
  getUser(id: string): Promise<{ id: string; name: string }>;
}

export interface IUserService {
  getUserName(id: string): Promise<string>;
}
