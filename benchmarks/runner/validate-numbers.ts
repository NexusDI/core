#!/usr/bin/env tsx

import { performance } from 'perf_hooks';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

// Import NexusDI
import { Nexus, Token, Service, Inject } from '../../dist/index.js';

interface BenchmarkMetrics {
  startup: {
    avg: number;
    min: number;
    max: number;
    iterations: number;
  };
  resolution: {
    avg: number;
    min: number;
    max: number;
    iterations: number;
  };
  memory: number;
  bundle: {
    core: number;
    dependencies: number;
    total: number;
  };
}

// Test interfaces
interface IDatabase {
  query(sql: string): Promise<any>;
}

interface ILogger {
  log(message: string): void;
}

interface IUserService {
  getUser(id: string): Promise<any>;
}

// Test tokens
const DATABASE = new Token<IDatabase>('DATABASE');
const LOGGER = new Token<ILogger>('LOGGER');
const USER_SERVICE = new Token<IUserService>('USER_SERVICE');

// Test implementations
@Service(LOGGER)
class Logger implements ILogger {
  log(message: string) {
    // Simulate logging
  }
}

@Service(DATABASE)
class Database implements IDatabase {
  async query(sql: string) {
    return { result: 'data' };
  }
}

@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private database: IDatabase,
    @Inject(LOGGER) private logger: ILogger
  ) {}

  async getUser(id: string) {
    this.logger.log(`Getting user ${id}`);
    return await this.database.query(`SELECT * FROM users WHERE id = '${id}'`);
  }
}

class PerformanceValidator {
  measureStartupTime(fn: () => void): { avg: number; min: number; max: number; iterations: number } {
    const iterations = 1000;
    const times: number[] = [];

    console.log(`Measuring startup time over ${iterations} iterations...`);

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      fn();
      const end = performance.now();
      times.push(end - start);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    return { avg, min, max, iterations };
  }

  measureResolutionTime(container: Nexus, token: Token<any>): { avg: number; min: number; max: number; iterations: number } {
    const iterations = 10000;
    const times: number[] = [];

    console.log(`Measuring resolution time over ${iterations} iterations...`);

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      container.get(token);
      const end = performance.now();
      times.push(end - start);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    return { avg, min, max, iterations };
  }

  measureMemoryUsage(fn: () => void): number {
    const initialMemory = process.memoryUsage().heapUsed;
    fn();
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    return Math.round(memoryIncrease / 1024); // Convert to KB
  }

  async measureBundleSize(): Promise<{ core: number; dependencies: number; total: number }> {
    // Measure the actual bundle size from the built output
    // For now, estimate based on the actual file sizes in dist/
    const fs = await import('fs');
    let core = 0;
    let dependencies = 0;
    let total = 0;
    try {
      // Use the correct relative path to the core bundle from the benchmark script
      const path = await import('path');
      const corePath = path.resolve(__dirname, '../../dist/index.js');
      if (fs.existsSync(corePath)) {
        core = Math.round(fs.statSync(corePath).size / 1024);
      }
      // Measure reflect-metadata size
      try {
        const reflectMetadataPath = require.resolve('reflect-metadata');
        dependencies = Math.round(fs.statSync(reflectMetadataPath).size / 1024);
      } catch {
        dependencies = 64; // fallback estimate
      }
      total = core + dependencies;
    } catch (e) {
      core = 0;
      dependencies = 0;
      total = 0;
    }
    console.log('Bundle size analysis:');
    console.log(`- Core library: ${core}KB`);
    console.log(`- Dependencies: ${dependencies}KB`);
    console.log(`- Total: ${total}KB`);
    return { core, dependencies, total };
  }

  async validateNexusDI(): Promise<BenchmarkMetrics> {
    console.log('🚀 Validating NexusDI Performance Numbers...\n');

    // Measure startup time
    const startupTime = this.measureStartupTime(() => {
      const container = new Nexus();
      container.set(LOGGER, { useClass: Logger });
      container.set(DATABASE, { useClass: Database });
      container.set(USER_SERVICE, { useClass: UserService });
    });

    // Create container for resolution testing
    const container = new Nexus();
    container.set(LOGGER, { useClass: Logger });
    container.set(DATABASE, { useClass: Database });
    container.set(USER_SERVICE, { useClass: UserService });

    // Measure resolution time
    const resolutionTime = this.measureResolutionTime(container, USER_SERVICE);

    // Measure memory usage
    const memoryUsage = this.measureMemoryUsage(() => {
      const container = new Nexus();
      container.set(LOGGER, { useClass: Logger });
      container.set(DATABASE, { useClass: Database });
      container.set(USER_SERVICE, { useClass: UserService });
    });

    // Measure bundle size
    const bundleSize = await this.measureBundleSize();

    return {
      startup: startupTime,
      resolution: resolutionTime,
      memory: memoryUsage,
      bundle: bundleSize
    };
  }

  printResults(metrics: BenchmarkMetrics): void {
    console.log('\n📊 NexusDI Performance Validation Results:');
    console.log('==========================================');
    console.log(`Startup Time: ${metrics.startup.avg.toFixed(3)}ms (avg) [${metrics.startup.min.toFixed(3)}ms - ${metrics.startup.max.toFixed(3)}ms]`);
    console.log(`Resolution Time: ${metrics.resolution.avg.toFixed(6)}ms (avg) [${metrics.resolution.min.toFixed(6)}ms - ${metrics.resolution.max.toFixed(6)}ms]`);
    console.log(`Memory Usage: ${metrics.memory}KB`);
    console.log(`Bundle Size: ${metrics.bundle.total}KB (${metrics.bundle.core}KB core + ${metrics.bundle.dependencies}KB deps)`);
  }

  generateValidationReport(metrics: BenchmarkMetrics): void {
    // Ensure benchmarks directory exists
    if (!existsSync('benchmarks')) {
      mkdirSync('benchmarks');
    }

    const report = {
      timestamp: new Date().toISOString(),
      nexusdi: metrics,
      validation: {
        startupTimeValid: metrics.startup.avg < 1,
        bundleSizeValid: metrics.bundle.total === 96,
        memoryUsageValid: Math.abs(metrics.memory - 100) < 50
      }
    };

    writeFileSync('benchmarks/validation-report.json', JSON.stringify(report, null, 2));
    console.log('\n✅ Validation report saved to benchmarks/validation-report.json');
  }

  async runValidation(): Promise<void> {
    const metrics = await this.validateNexusDI();
    this.printResults(metrics);
    this.generateValidationReport(metrics);

    console.log('\n🔍 How to validate other libraries:');
    console.log('===================================');
    console.log('1. Install the library: npm install <library-name>');
    console.log('2. Create similar test classes with their decorators');
    console.log('3. Run the same benchmarks with their container');
    console.log('4. Compare results with our documented numbers');
    console.log('');
    console.log('Example for InversifyJS:');
    console.log('npm install inversify reflect-metadata');
    console.log('Then create similar test classes using @injectable() and @inject()');
  }
}

// Run validation if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new PerformanceValidator();
  validator.runValidation().catch(console.error);
}

export { PerformanceValidator }; 