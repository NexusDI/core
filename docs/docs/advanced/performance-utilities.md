---
sidebar_position: 12
---

# Performance Utilities

Advanced performance monitoring and optimization utilities for NexusDI. These utilities will be available in the upcoming `@nexusdi/utils` package.

> **Note**: These utilities are for advanced performance tuning. For basic performance tips, see [Performance Tuning](performance-tuning.md).

## Performance Monitoring Utilities

### PerformanceMonitor

Comprehensive performance tracking and analysis:

```typescript
class PerformanceMonitor {
  private static metrics = {
    resolutionTimes: new Map<string, number[]>(),
    memoryUsage: [] as Array<{ timestamp: number; heapUsed: number }>,
    slowResolutions: [] as Array<{ token: string; time: number; timestamp: number }>,
    errors: [] as Array<{ token: string; error: string; timestamp: number }>
  };

  /**
   * Measures resolution time for a token
   */
  static measureResolution<T>(container: Nexus, token: TokenType<T>): T {
    const start = performance.now();
    
    try {
      const result = container.get(token);
      const end = performance.now();
      const time = end - start;
      
      this.recordResolutionTime(token.toString(), time);
      
      // Track slow resolutions
      if (time > 5) { // Over 5ms
        this.metrics.slowResolutions.push({
          token: token.toString(),
          time,
          timestamp: Date.now()
        });
      }
      
      return result;
    } catch (error) {
      this.recordError(token.toString(), error.message);
      throw error;
    }
  }

  /**
   * Gets performance statistics for a token
   */
  static getTokenStats(token: string): {
    avg: number;
    min: number;
    max: number;
    count: number;
    p95: number;
    p99: number;
  } | null {
    const times = this.metrics.resolutionTimes.get(token);
    if (!times || times.length === 0) return null;

    const sorted = [...times].sort((a, b) => a - b);
    const avg = times.reduce((sum, val) => sum + val, 0) / times.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    return { avg, min, max, count: times.length, p95, p99 };
  }

  /**
   * Gets overall performance statistics
   */
  static getOverallStats(): {
    totalResolutions: number;
    averageTime: number;
    slowResolutions: number;
    errorRate: number;
    memoryUsage: number;
  } {
    const allTimes = Array.from(this.metrics.resolutionTimes.values()).flat();
    const totalResolutions = allTimes.length;
    const averageTime = totalResolutions > 0 
      ? allTimes.reduce((sum, time) => sum + time, 0) / totalResolutions 
      : 0;

    return {
      totalResolutions,
      averageTime,
      slowResolutions: this.metrics.slowResolutions.length,
      errorRate: totalResolutions > 0 
        ? this.metrics.errors.length / totalResolutions 
        : 0,
      memoryUsage: this.getCurrentMemoryUsage()
    };
  }

  /**
   * Tracks memory usage
   */
  static trackMemoryUsage(): void {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memory = process.memoryUsage();
      this.metrics.memoryUsage.push({
        timestamp: Date.now(),
        heapUsed: memory.heapUsed
      });
    }
  }

  /**
   * Prints a comprehensive performance report
   */
  static printReport(): void {
    const stats = this.getOverallStats();
    
    console.log('=== Performance Report ===');
    console.log(`Total resolutions: ${stats.totalResolutions}`);
    console.log(`Average time: ${stats.averageTime.toFixed(3)}ms`);
    console.log(`Slow resolutions: ${stats.slowResolutions}`);
    console.log(`Error rate: ${(stats.errorRate * 100).toFixed(2)}%`);
    console.log(`Memory usage: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
    
    if (this.metrics.slowResolutions.length > 0) {
      console.log('\nSlowest resolutions:');
      const recentSlow = this.metrics.slowResolutions
        .slice(-5)
        .sort((a, b) => b.time - a.time);
      
      recentSlow.forEach(({ token, time }) => {
        console.log(`  - ${token}: ${time.toFixed(3)}ms`);
      });
    }
    
    console.log('==========================');
  }

  /**
   * Clears all performance metrics
   */
  static clearMetrics(): void {
    this.metrics = {
      resolutionTimes: new Map(),
      memoryUsage: [],
      slowResolutions: [],
      errors: []
    };
  }

  private static recordResolutionTime(token: string, time: number): void {
    if (!this.metrics.resolutionTimes.has(token)) {
      this.metrics.resolutionTimes.set(token, []);
    }
    this.metrics.resolutionTimes.get(token)!.push(time);
  }

  private static recordError(token: string, error: string): void {
    this.metrics.errors.push({
      token,
      error,
      timestamp: Date.now()
    });
  }

  private static getCurrentMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }
}
```

### MemoryAnalyzer

Specialized memory usage analysis:

```typescript
class MemoryAnalyzer {
  /**
   * Analyzes memory usage patterns
   */
  static analyzeMemoryUsage(container: Nexus, iterations: number = 1000): {
    initialMemory: number;
    finalMemory: number;
    increase: number;
    averagePerInstance: number;
    memoryLeak: boolean;
  } {
    const initialMemory = this.getMemoryUsage();
    const instances: any[] = [];
    
    // Create instances
    for (let i = 0; i < iterations; i++) {
      try {
        const { providers } = container.list();
        if (providers.length > 0) {
          instances.push(container.get(providers[0]));
        }
      } catch (error) {
        console.warn(`Failed to create instance ${i}:`, error.message);
      }
    }
    
    const finalMemory = this.getMemoryUsage();
    const increase = finalMemory - initialMemory;
    const averagePerInstance = instances.length > 0 ? increase / instances.length : 0;
    
    // Check for potential memory leak (more than 1KB per instance)
    const memoryLeak = averagePerInstance > 1024;
    
    return {
      initialMemory,
      finalMemory,
      increase,
      averagePerInstance,
      memoryLeak
    };
  }

  /**
   * Monitors memory usage over time
   */
  static monitorMemoryUsage(duration: number = 60000, interval: number = 1000): Promise<{
    measurements: Array<{ timestamp: number; heapUsed: number }>;
    trend: 'increasing' | 'decreasing' | 'stable';
    averageGrowth: number;
  }> {
    return new Promise((resolve) => {
      const measurements: Array<{ timestamp: number; heapUsed: number }> = [];
      const startTime = Date.now();
      
      const timer = setInterval(() => {
        const memory = this.getMemoryUsage();
        measurements.push({
          timestamp: Date.now(),
          heapUsed: memory
        });
        
        if (Date.now() - startTime >= duration) {
          clearInterval(timer);
          const analysis = this.analyzeMemoryTrend(measurements);
          resolve(analysis);
        }
      }, interval);
    });
  }

  /**
   * Detects memory leaks in container usage
   */
  static detectMemoryLeaks(container: Nexus): {
    leakDetected: boolean;
    suspiciousTokens: string[];
    recommendations: string[];
  } {
    const analysis = this.analyzeMemoryUsage(container, 100);
    const suspiciousTokens: string[] = [];
    const recommendations: string[] = [];
    
    if (analysis.memoryLeak) {
      recommendations.push('Consider using transient lifetime for frequently created services');
      recommendations.push('Check for services that hold references to large objects');
      recommendations.push('Review singleton services for memory accumulation');
    }
    
    // Check for services that might be causing issues
    try {
      const { providers } = container.list();
      for (const provider of providers) {
        try {
          const instance = container.get(provider);
          const instanceSize = this.estimateObjectSize(instance);
          if (instanceSize > 1024 * 1024) { // 1MB
            suspiciousTokens.push(provider.toString());
          }
        } catch (error) {
          // Skip failed resolutions
        }
      }
    } catch (error) {
      // Container inspection failed
    }
    
    return {
      leakDetected: analysis.memoryLeak,
      suspiciousTokens,
      recommendations
    };
  }

  private static getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }

  private static analyzeMemoryTrend(measurements: Array<{ timestamp: number; heapUsed: number }>): {
    measurements: Array<{ timestamp: number; heapUsed: number }>;
    trend: 'increasing' | 'decreasing' | 'stable';
    averageGrowth: number;
  } {
    if (measurements.length < 2) {
      return { measurements, trend: 'stable', averageGrowth: 0 };
    }

    const first = measurements[0];
    const last = measurements[measurements.length - 1];
    const totalGrowth = last.heapUsed - first.heapUsed;
    const duration = (last.timestamp - first.timestamp) / 1000;
    const averageGrowth = totalGrowth / duration;

    let trend: 'increasing' | 'decreasing' | 'stable';
    if (averageGrowth > 1024) { // 1KB per second
      trend = 'increasing';
    } else if (averageGrowth < -1024) {
      trend = 'decreasing';
    } else {
      trend = 'stable';
    }

    return { measurements, trend, averageGrowth };
  }

  private static estimateObjectSize(obj: any): number {
    // Simple size estimation
    const str = JSON.stringify(obj);
    return new Blob([str]).size;
  }
}
```

## Optimization Utilities

### ContainerOptimizer

Advanced container optimization and analysis:

<details>
<summary>⚠️ Requires Internal API Access - Currently Non-Functional</summary>

This utility requires access to the container's internal dependency graph and metadata, which is not currently exposed in the public API. It would need methods to analyze dependency patterns and access constructor metadata.

```typescript
class ContainerOptimizer {
  /**
   * Analyzes container for optimization opportunities
   */
  static analyzeOptimizations(container: Nexus): {
    highDependencyServices: Array<{ token: string; count: number }>;
    deepDependencyChains: Array<{ token: string; depth: number }>;
    potentialSingletons: string[];
    recommendations: string[];
  } {
    const highDependencyServices = this.findHighDependencyServices(container);
    const deepDependencyChains = this.findDeepDependencyChains(container);
    const potentialSingletons = this.findPotentialSingletons(container);
    const recommendations = this.generateRecommendations(container);

    return {
      highDependencyServices,
      deepDependencyChains,
      potentialSingletons,
      recommendations
    };
  }

  /**
   * Suggests lifetime optimizations
   */
  static suggestLifetimeOptimizations(container: Nexus): Array<{
    token: string;
    currentLifetime: string;
    suggestedLifetime: string;
    reason: string;
  }> {
    const suggestions: Array<{
      token: string;
      currentLifetime: string;
      suggestedLifetime: string;
      reason: string;
    }> = [];

    const tokens = this.getAllTokens(container);
    
    for (const token of tokens) {
      const dependencies = this.getDependencies(container, token);
      const usagePattern = this.analyzeUsagePattern(container, token);
      
      if (dependencies.length === 0 && usagePattern.frequency > 10) {
        suggestions.push({
          token: token.toString(),
          currentLifetime: 'transient',
          suggestedLifetime: 'singleton',
          reason: 'No dependencies and frequently used'
        });
      }
      
      if (dependencies.length > 5) {
        suggestions.push({
          token: token.toString(),
          currentLifetime: 'singleton',
          suggestedLifetime: 'transient',
          reason: 'High dependency count - consider breaking down'
        });
      }
    }

    return suggestions;
  }

  /**
   * Analyzes dependency patterns for optimization
   */
  static analyzeDependencyPatterns(container: Nexus): {
    circularDependencies: string[][];
    sharedDependencies: Map<string, string[]>;
    isolatedServices: string[];
  } {
    const circularDependencies = this.findCircularDependencies(container);
    const sharedDependencies = this.findSharedDependencies(container);
    const isolatedServices = this.findIsolatedServices(container);

    return {
      circularDependencies,
      sharedDependencies,
      isolatedServices
    };
  }

  private static findHighDependencyServices(container: Nexus): Array<{ token: string; count: number }> {
    const services: Array<{ token: string; count: number }> = [];
    const tokens = this.getAllTokens(container);

    for (const token of tokens) {
      const dependencies = this.getDependencies(container, token);
      if (dependencies.length >= 5) {
        services.push({
          token: token.toString(),
          count: dependencies.length
        });
      }
    }

    return services.sort((a, b) => b.count - a.count);
  }

  private static findDeepDependencyChains(container: Nexus): Array<{ token: string; depth: number }> {
    const chains: Array<{ token: string; depth: number }> = [];
    const tokens = this.getAllTokens(container);

    for (const token of tokens) {
      const depth = this.calculateDependencyDepth(container, token);
      if (depth >= 3) {
        chains.push({
          token: token.toString(),
          depth
        });
      }
    }

    return chains.sort((a, b) => b.depth - a.depth);
  }

  private static findPotentialSingletons(container: Nexus): string[] {
    const singletons: string[] = [];
    const tokens = this.getAllTokens(container);

    for (const token of tokens) {
      const dependencies = this.getDependencies(container, token);
      const usagePattern = this.analyzeUsagePattern(container, token);
      
      if (dependencies.length === 0 && usagePattern.frequency > 5) {
        singletons.push(token.toString());
      }
    }

    return singletons;
  }

  private static generateRecommendations(container: Nexus): string[] {
    const recommendations: string[] = [];
    const analysis = this.analyzeOptimizations(container);

    if (analysis.highDependencyServices.length > 0) {
      recommendations.push('Consider breaking down services with many dependencies');
    }

    if (analysis.deepDependencyChains.length > 0) {
      recommendations.push('Reduce dependency chain depth for better performance');
    }

    if (analysis.potentialSingletons.length > 0) {
      recommendations.push('Consider making frequently used services singletons');
    }

    return recommendations;
  }

  private static findCircularDependencies(container: Nexus): string[][] {
    // Implementation would use CircularDependencyDetector
    return [];
  }

  private static findSharedDependencies(container: Nexus): Map<string, string[]> {
    const shared = new Map<string, string[]>();
    const tokens = this.getAllTokens(container);

    for (const token of tokens) {
      const dependencies = this.getDependencies(container, token);
      for (const dep of dependencies) {
        if (!shared.has(dep.toString())) {
          shared.set(dep.toString(), []);
        }
        shared.get(dep.toString())!.push(token.toString());
      }
    }

    return shared;
  }

  private static findIsolatedServices(container: Nexus): string[] {
    const allTokens = this.getAllTokens(container);
    const dependentTokens = new Set<string>();

    for (const token of allTokens) {
      const dependencies = this.getDependencies(container, token);
      dependencies.forEach(dep => dependentTokens.add(dep.toString()));
    }

    return allTokens
      .map(t => t.toString())
      .filter(token => !dependentTokens.has(token));
  }

  private static calculateDependencyDepth(container: Nexus, token: TokenType, visited: Set<string> = new Set()): number {
    const tokenName = token.toString();
    
    if (visited.has(tokenName)) {
      return 0; // Avoid cycles
    }

    visited.add(tokenName);
    const dependencies = this.getDependencies(container, token);
    
    if (dependencies.length === 0) {
      return 0;
    }

    const maxDepth = Math.max(...dependencies.map(dep => 
      this.calculateDependencyDepth(container, dep, new Set(visited))
    ));

    return maxDepth + 1;
  }

  private static analyzeUsagePattern(container: Nexus, token: TokenType): { frequency: number } {
    // This would track actual usage patterns
    // For now, return a placeholder
    return { frequency: 1 };
  }

  private static getAllTokens(container: Nexus): TokenType[] {
    // Implementation depends on container internals
    return [];
  }

  private static getDependencies(container: Nexus, token: TokenType): TokenType[] {
    // Implementation depends on container internals
    return [];
  }
}
```
</details>

## Usage Examples

### Basic Performance Monitoring

```typescript
// Monitor resolution performance
const userService = PerformanceMonitor.measureResolution(container, USER_SERVICE);

// Get performance statistics
const stats = PerformanceMonitor.getTokenStats('USER_SERVICE');
if (stats) {
  console.log(`Average resolution time: ${stats.avg.toFixed(3)}ms`);
  console.log(`95th percentile: ${stats.p95.toFixed(3)}ms`);
}

// Print comprehensive report
PerformanceMonitor.printReport();
```

### Memory Analysis

```typescript
// Analyze memory usage
const memoryAnalysis = MemoryAnalyzer.analyzeMemoryUsage(container);
console.log(`Memory increase: ${(memoryAnalysis.increase / 1024).toFixed(2)}KB`);
console.log(`Memory leak detected: ${memoryAnalysis.memoryLeak}`);

// Monitor memory over time
MemoryAnalyzer.monitorMemoryUsage(30000).then(analysis => {
  console.log(`Memory trend: ${analysis.trend}`);
  console.log(`Average growth: ${(analysis.averageGrowth / 1024).toFixed(2)}KB/s`);
});

// Detect memory leaks
const leakAnalysis = MemoryAnalyzer.detectMemoryLeaks(container);
if (leakAnalysis.leakDetected) {
  console.log('Memory leak detected!');
  console.log('Recommendations:', leakAnalysis.recommendations);
}
```

### Container Optimization

<details>
<summary>⚠️ Requires Internal API Access - Currently Non-Functional</summary>

These examples depend on utilities that require internal container access.

```typescript
// Analyze optimization opportunities
const optimizations = ContainerOptimizer.analyzeOptimizations(container);
console.log('High dependency services:', optimizations.highDependencyServices);
console.log('Recommendations:', optimizations.recommendations);

// Get lifetime optimization suggestions
const suggestions = ContainerOptimizer.suggestLifetimeOptimizations(container);
suggestions.forEach(suggestion => {
  console.log(`${suggestion.token}: ${suggestion.currentLifetime} → ${suggestion.suggestedLifetime}`);
  console.log(`Reason: ${suggestion.reason}`);
});

// Analyze dependency patterns
const patterns = ContainerOptimizer.analyzeDependencyPatterns(container);
console.log('Circular dependencies:', patterns.circularDependencies);
console.log('Isolated services:', patterns.isolatedServices);
```
</details>

## Future Integration

These utilities will be available in the upcoming `@nexusdi/utils` package:

```typescript
// Future usage
import { 
  PerformanceMonitor, 
  MemoryAnalyzer,
  ContainerOptimizer 
} from '@nexusdi/utils';

// All utilities will be properly typed and integrated with NexusDI
```

## Next Steps

- **[Performance Tuning](performance-tuning.md)** - Basic performance optimization
- **[Debugging & Diagnostics](debugging-and-diagnostics.md)** - Debug performance issues
- **[Circular Dependencies](circular-dependencies.md)** - Handle circular dependency issues

These utilities provide powerful performance monitoring and optimization capabilities! 🚀✨ 