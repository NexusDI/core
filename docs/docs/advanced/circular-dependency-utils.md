---
sidebar_position: 10
---

# Circular Dependency Utilities

Advanced utilities for detecting, analyzing, and debugging circular dependencies in NexusDI. These utilities will be available in an upcoming package.

> **Note**: These utilities are for advanced debugging. For most cases, NexusDI's built-in circular dependency detection is sufficient.

## Detection Utilities

### CircularDependencyDetector

A comprehensive utility for detecting circular dependencies with detailed cycle information:

<details>
<summary>⚠️ Requires Internal API Access - Currently Non-Functional</summary>

This utility requires access to the container's internal dependency graph, which is not currently exposed in the public API. It would need methods like `getDependencies()` and `getAllTokens()` to be added to the container.

```typescript
class CircularDependencyDetector {
  private static visited = new Set<string>();
  private static recursionStack = new Set<string>();

  /**
   * Detects circular dependencies and returns the cycle path
   */
  static detectCycle(container: Nexus, startToken: TokenType): string[] | null {
    this.visited.clear();
    this.recursionStack.clear();
    return this.dfs(container, startToken, []);
  }

  /**
   * Checks if a specific token has circular dependencies
   */
  static hasCircularDependency(container: Nexus, token: TokenType): boolean {
    return this.detectCycle(container, token) !== null;
  }

  /**
   * Gets all circular dependencies in the container
   */
  static getAllCircularDependencies(container: Nexus): Map<string, string[]> {
    const cycles = new Map<string, string[]>();
    const tokens = this.getAllTokens(container);

    for (const token of tokens) {
      const cycle = this.detectCycle(container, token);
      if (cycle) {
        cycles.set(token.toString(), cycle);
      }
    }

    return cycles;
  }

  private static dfs(
    container: Nexus,
    token: TokenType,
    path: string[]
  ): string[] | null {
    const tokenName = token.toString();

    if (this.recursionStack.has(tokenName)) {
      // Found a cycle - return the cycle path
      const cycleStart = path.indexOf(tokenName);
      return path.slice(cycleStart);
    }

    if (this.visited.has(tokenName)) {
      return null; // Already visited, no cycle
    }

    this.visited.add(tokenName);
    this.recursionStack.add(tokenName);
    path.push(tokenName);

    try {
      const dependencies = this.getDependencies(container, token);
      for (const dep of dependencies) {
        const cycle = this.dfs(container, dep, [...path]);
        if (cycle) return cycle;
      }

      return null;
    } finally {
      this.recursionStack.delete(tokenName);
    }
  }

  private static getDependencies(
    container: Nexus,
    token: TokenType
  ): TokenType[] {
    // This would need to access the container's internal dependency graph
    // Implementation depends on container internals
    return [];
  }

  private static getAllTokens(container: Nexus): TokenType[] {
    // This would need to access all registered tokens
    // Implementation depends on container internals
    return [];
  }
}
```

</details>

### DependencyGraphAnalyzer

Analyzes the dependency graph for insights:

<details>
<summary>⚠️ Requires Internal API Access - Currently Non-Functional</summary>

This utility requires access to the container's internal dependency graph and metadata, which is not currently exposed. It would need methods to traverse dependencies and access constructor metadata.

```typescript
class DependencyGraphAnalyzer {
  /**
   * Creates a visual representation of the dependency graph
   */
  static generateDependencyGraph(container: Nexus): string {
    const graph = new Map<string, string[]>();
    const tokens = this.getAllTokens(container);

    for (const token of tokens) {
      const dependencies = this.getDependencies(container, token);
      graph.set(
        token.toString(),
        dependencies.map((d) => d.toString())
      );
    }

    return this.formatGraph(graph);
  }

  /**
   * Finds services with the most dependencies
   */
  static findHighDependencyServices(
    container: Nexus,
    threshold: number = 5
  ): Array<{ token: string; count: number }> {
    const services = [];
    const tokens = this.getAllTokens(container);

    for (const token of tokens) {
      const dependencies = this.getDependencies(container, token);
      if (dependencies.length >= threshold) {
        services.push({
          token: token.toString(),
          count: dependencies.length,
        });
      }
    }

    return services.sort((a, b) => b.count - a.count);
  }

  /**
   * Finds orphaned services (no dependencies on them)
   */
  static findOrphanedServices(container: Nexus): string[] {
    const allTokens = this.getAllTokens(container);
    const dependentTokens = new Set<string>();

    for (const token of allTokens) {
      const dependencies = this.getDependencies(container, token);
      dependencies.forEach((dep) => dependentTokens.add(dep.toString()));
    }

    return allTokens
      .map((t) => t.toString())
      .filter((token) => !dependentTokens.has(token));
  }

  /**
   * Analyzes dependency depth for each service
   */
  static analyzeDependencyDepth(container: Nexus): Map<string, number> {
    const depths = new Map<string, number>();
    const tokens = this.getAllTokens(container);

    for (const token of tokens) {
      const depth = this.calculateDepth(container, token, new Set());
      depths.set(token.toString(), depth);
    }

    return depths;
  }

  private static calculateDepth(
    container: Nexus,
    token: TokenType,
    visited: Set<string>
  ): number {
    const tokenName = token.toString();

    if (visited.has(tokenName)) {
      return 0; // Avoid cycles
    }

    visited.add(tokenName);
    const dependencies = this.getDependencies(container, token);

    if (dependencies.length === 0) {
      return 0;
    }

    const maxDepth = Math.max(
      ...dependencies.map((dep) =>
        this.calculateDepth(container, dep, new Set(visited))
      )
    );

    return maxDepth + 1;
  }

  private static formatGraph(graph: Map<string, string[]>): string {
    let output = 'digraph DependencyGraph {\n';

    for (const [token, deps] of graph) {
      for (const dep of deps) {
        output += `  "${token}" -> "${dep}";\n`;
      }
    }

    output += '}';
    return output;
  }

  private static getAllTokens(container: Nexus): TokenType[] {
    // Implementation depends on container internals
    return [];
  }

  private static getDependencies(
    container: Nexus,
    token: TokenType
  ): TokenType[] {
    // Implementation depends on container internals
    return [];
  }
}
```

</details>

## Performance Utilities

### ResolutionPerformanceMonitor

Monitors dependency resolution performance:

```typescript
class ResolutionPerformanceMonitor {
  private static metrics = new Map<string, number[]>();

  /**
   * Measures resolution time for a token
   */
  static measureResolution(container: Nexus, token: TokenType): number {
    const start = performance.now();

    try {
      container.get(token);
      const end = performance.now();
      const duration = end - start;

      this.recordMetric(token.toString(), duration);
      return duration;
    } catch (error) {
      console.error(
        `Resolution failed for ${token.toString()}:`,
        error.message
      );
      return -1;
    }
  }

  /**
   * Gets performance statistics for a token
   */
  static getPerformanceStats(token: string): {
    avg: number;
    min: number;
    max: number;
    count: number;
  } | null {
    const metrics = this.metrics.get(token);
    if (!metrics || metrics.length === 0) return null;

    const avg = metrics.reduce((sum, val) => sum + val, 0) / metrics.length;
    const min = Math.min(...metrics);
    const max = Math.max(...metrics);

    return { avg, min, max, count: metrics.length };
  }

  /**
   * Compares performance between two containers
   */
  static comparePerformance(
    container1: Nexus,
    container2: Nexus,
    token: TokenType
  ): {
    container1: number;
    container2: number;
    difference: number;
    percentage: number;
  } {
    const time1 = this.measureResolution(container1, token);
    const time2 = this.measureResolution(container2, token);

    if (time1 === -1 || time2 === -1) {
      throw new Error('One or both resolutions failed');
    }

    const difference = time2 - time1;
    const percentage = (difference / time1) * 100;

    return { container1: time1, container2: time2, difference, percentage };
  }

  private static recordMetric(token: string, duration: number): void {
    if (!this.metrics.has(token)) {
      this.metrics.set(token, []);
    }
    this.metrics.get(token)!.push(duration);
  }

  /**
   * Clears all performance metrics
   */
  static clearMetrics(): void {
    this.metrics.clear();
  }
}
```

## Debugging Utilities

### CircularDependencyDebugger

Provides detailed debugging information:

<details>
<summary>⚠️ Requires Internal API Access - Currently Non-Functional</summary>

This utility depends on the CircularDependencyDetector and DependencyGraphAnalyzer, which require internal container access that is not currently available.

```typescript
class CircularDependencyDebugger {
  /**
   * Analyzes a container and provides debugging report
   */
  static analyzeContainer(container: Nexus): {
    totalServices: number;
    circularDependencies: Map<string, string[]>;
    highDependencyServices: Array<{ token: string; count: number }>;
    orphanedServices: string[];
    performanceIssues: string[];
  } {
    const totalServices = this.getAllTokens(container).length;
    const circularDependencies =
      CircularDependencyDetector.getAllCircularDependencies(container);
    const highDependencyServices =
      DependencyGraphAnalyzer.findHighDependencyServices(container);
    const orphanedServices =
      DependencyGraphAnalyzer.findOrphanedServices(container);
    const performanceIssues = this.identifyPerformanceIssues(container);

    return {
      totalServices,
      circularDependencies,
      highDependencyServices,
      orphanedServices,
      performanceIssues,
    };
  }

  /**
   * Generates a comprehensive debugging report
   */
  static generateDebugReport(container: Nexus): string {
    const analysis = this.analyzeContainer(container);

    let report = '=== NexusDI Container Debug Report ===\n\n';

    report += `Total Services: ${analysis.totalServices}\n`;
    report += `Circular Dependencies: ${analysis.circularDependencies.size}\n`;
    report += `High Dependency Services: ${analysis.highDependencyServices.length}\n`;
    report += `Orphaned Services: ${analysis.orphanedServices.length}\n`;
    report += `Performance Issues: ${analysis.performanceIssues.length}\n\n`;

    if (analysis.circularDependencies.size > 0) {
      report += '=== Circular Dependencies ===\n';
      for (const [token, cycle] of analysis.circularDependencies) {
        report += `${token}: ${cycle.join(' → ')}\n`;
      }
      report += '\n';
    }

    if (analysis.highDependencyServices.length > 0) {
      report += '=== High Dependency Services ===\n';
      for (const service of analysis.highDependencyServices) {
        report += `${service.token}: ${service.count} dependencies\n`;
      }
      report += '\n';
    }

    if (analysis.orphanedServices.length > 0) {
      report += '=== Orphaned Services ===\n';
      for (const service of analysis.orphanedServices) {
        report += `${service}\n`;
      }
      report += '\n';
    }

    if (analysis.performanceIssues.length > 0) {
      report += '=== Performance Issues ===\n';
      for (const issue of analysis.performanceIssues) {
        report += `${issue}\n`;
      }
      report += '\n';
    }

    return report;
  }

  private static identifyPerformanceIssues(container: Nexus): string[] {
    const issues: string[] = [];
    const tokens = this.getAllTokens(container);

    for (const token of tokens) {
      const stats = ResolutionPerformanceMonitor.getPerformanceStats(
        token.toString()
      );
      if (stats && stats.avg > 10) {
        // Threshold of 10ms
        issues.push(
          `Slow resolution: ${token.toString()} (avg: ${stats.avg.toFixed(
            2
          )}ms)`
        );
      }
    }

    return issues;
  }

  private static getAllTokens(container: Nexus): TokenType[] {
    // Implementation depends on container internals
    return [];
  }
}
```

</details>

## Usage Examples

### Basic Detection

```typescript
// Check for circular dependencies
const cycle = CircularDependencyDetector.detectCycle(container, USER_SERVICE);
if (cycle) {
  console.error('Circular dependency found:', cycle.join(' → '));
}
```

### Performance Monitoring

```typescript
// Monitor resolution performance
const duration = ResolutionPerformanceMonitor.measureResolution(
  container,
  USER_SERVICE
);
console.log(`Resolution took ${duration.toFixed(2)}ms`);

// Get performance stats
const stats = ResolutionPerformanceMonitor.getPerformanceStats('USER_SERVICE');
if (stats) {
  console.log(`Average resolution time: ${stats.avg.toFixed(2)}ms`);
}
```

### Comprehensive Analysis

```typescript
// Generate full debugging report
const report = CircularDependencyDebugger.generateDebugReport(container);
console.log(report);

// Or get structured analysis
const analysis = CircularDependencyDebugger.analyzeContainer(container);
console.log(
  `Found ${analysis.circularDependencies.size} circular dependencies`
);
```

## Future Integration

These utilities will be available in an upcoming package:

```typescript
// Future usage
import {
  CircularDependencyDetector,
  DependencyGraphAnalyzer,
  ResolutionPerformanceMonitor,
  CircularDependencyDebugger,
} from '@nexusdi/<some package>';

// All utilities will be properly typed and integrated with NexusDI
```

## Next Steps

- **[Debugging & Diagnostics](debugging-and-diagnostics.md)** - Basic debugging techniques
- **[Circular Dependencies](circular-dependencies.md)** - Handle circular dependency issues
- **[Performance Tuning](performance-tuning.md)** - Optimize container performance

These utilities provide powerful debugging capabilities for complex dependency injection scenarios! 🛠️✨
