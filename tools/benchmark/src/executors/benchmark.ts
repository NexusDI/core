import { ExecutorContext } from '@nx/devkit';
import { BenchmarkExecutorSchema } from './schema';
import * as path from 'path';
import * as fs from 'fs';

const runExecutor = async (
  options: BenchmarkExecutorSchema,
  context: ExecutorContext
) => {
  try {
    // 1. Find the project root using supported Nx context properties
    let projectRoot: string | undefined;
    if (
      context.projectName &&
      context.projectsConfigurations &&
      context.projectsConfigurations.projects
    ) {
      const project =
        context.projectsConfigurations.projects[context.projectName];
      if (project && typeof project === 'object' && 'root' in project) {
        projectRoot = (project as { root: string }).root;
      }
    }
    if (!projectRoot) {
      projectRoot = context.root;
    }
    if (!projectRoot) {
      throw new Error('Could not determine project root for benchmark.');
    }

    // 2. Find the benchmark entrypoint
    const benchmarkPath = path.join(projectRoot, 'src', 'benchmark.ts');
    if (!fs.existsSync(benchmarkPath)) {
      throw new Error(
        `Could not find benchmark entrypoint at ${benchmarkPath}`
      );
    }

    // 3. Dynamically import the benchmark class (using ts-node or require if needed)
    let BenchmarkClass: any;
    try {
      const imported = await import(benchmarkPath);
      BenchmarkClass =
        imported.default || imported.Benchmark || Object.values(imported)[0];
    } catch (err) {
      const imported = require(benchmarkPath);
      BenchmarkClass =
        imported.default || imported.Benchmark || Object.values(imported)[0];
    }
    if (!BenchmarkClass) {
      throw new Error('Could not load benchmark class from entrypoint.');
    }

    // 4. Instantiate and run the benchmark
    const benchmark = new BenchmarkClass();
    if (typeof benchmark.run !== 'function') {
      throw new Error('Benchmark class does not implement run().');
    }

    const iterations =
      options.iterations && options.iterations > 1 ? options.iterations : 1;
    const results = [];
    for (let i = 0; i < iterations; i++) {
      results.push(await benchmark.run());
    }

    // Aggregate/average results
    function avg(arr: number[]): number {
      return arr.reduce((a: number, b: number) => a + b, 0) / arr.length;
    }
    const first = results[0];
    const averaged = {
      startupTime: avg(results.map((r) => r.startupTime)),
      registrationTime: avg(results.map((r) => r.registrationTime)),
      resolutionTime: avg(results.map((r) => r.resolutionTime)),
      memoryAfterStartup: avg(results.map((r) => r.memoryAfterStartup)),
      memoryAfterRegister: avg(results.map((r) => r.memoryAfterRegister)),
      memoryAfterResolve: avg(results.map((r) => r.memoryAfterResolve)),
      memorySUT: avg(results.map((r) => r.memorySUT)),
      timings: first.timings,
      memory: first.memory,
      bundleSize: first.bundleSize,
      iterations,
    };

    // Output based on outputFormat
    const outputFormat = options.outputFormat || 'console';
    if (outputFormat === 'json') {
      console.log(JSON.stringify(averaged, null, 2));
    } else {
      console.log(
        `\nBenchmark Results (averaged over ${iterations} iteration${
          iterations > 1 ? 's' : ''
        }):`
      );
      console.table([
        {
          Phase: 'Startup',
          'Time (μs)': averaged.startupTime.toFixed(2),
          'Memory (KB)': averaged.memoryAfterStartup.toFixed(2),
        },
        {
          Phase: 'Register',
          'Time (μs)': averaged.registrationTime.toFixed(2),
          'Memory (KB)': averaged.memoryAfterRegister.toFixed(2),
        },
        {
          Phase: 'Resolve',
          'Time (μs)': averaged.resolutionTime.toFixed(2),
          'Memory (KB)': averaged.memoryAfterResolve.toFixed(2),
        },
        {
          Phase: 'SUT-only',
          'Time (μs)': '',
          'Memory (KB)': averaged.memorySUT.toFixed(2),
        },
      ]);
      if (typeof averaged.bundleSize === 'number') {
        console.log(`Bundle size: ${averaged.bundleSize} KB`);
      }
      if (averaged.timings && averaged.memory) {
        console.log('\nDetailed Timings (first iteration):');
        console.table(averaged.timings);
        console.log('\nMemory Usage (first iteration):');
        console.table(averaged.memory);
      }
    }

    // 6. (Stub) Istanbul/nyc reporting integration placeholder
    // TODO: Integrate Istanbul/nyc for coverage and reporting (terminal, lcov, json, etc.)

    return {
      success: true,
    };
  } catch (error) {
    console.error('Benchmark executor failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export default runExecutor;
