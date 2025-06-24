---
sidebar_position: 11
---

# Debugging Utilities

Advanced debugging tools and utilities for comprehensive dependency injection diagnostics. These utilities will be available in the upcoming `@nexusdi/utils` package.

> **Note**: These utilities are for advanced debugging scenarios. For basic debugging, see [Debugging & Diagnostics](debugging-and-diagnostics.md).

## Container Inspection Utilities

### ContainerDebugger

Comprehensive container inspection and analysis:

```typescript
class ContainerDebugger {
  /**
   * Inspects the container and provides detailed information
   */
  static inspect(container: Nexus) {
    const { providers, modules } = container.list();
    
    console.log('=== Container Inspection ===');
    console.log('Providers:', providers.length);
    providers.forEach(provider => {
      console.log(`  - ${provider.toString()}`);
    });
    
    console.log('Modules:', modules.length);
    modules.forEach(module => {
      console.log(`  - ${module}`);
    });
    console.log('===========================');
  }

  /**
   * Checks dependencies for a specific token
   */
  static checkDependencies(container: Nexus, token: TokenType) {
    console.log(`=== Checking dependencies for ${token.toString()} ===`);
    
    try {
      const instance = container.get(token);
      console.log('✅ Successfully resolved');
      console.log('Instance type:', instance.constructor.name);
    } catch (error) {
      console.log('❌ Failed to resolve:', error.message);
    }
  }

  /**
   * Validates the entire container configuration
   */
  static validateContainer(container: Nexus): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const { providers } = container.list();

    // Check each provider
    for (const provider of providers) {
      try {
        container.get(provider);
      } catch (error) {
        errors.push(`Failed to resolve ${provider.toString()}: ${error.message}`);
      }
    }

    // Check for potential issues
    if (providers.length === 0) {
      warnings.push('No providers registered in container');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}
```

### DependencyGraphAnalyzer

Analyzes dependency relationships and graph structure:

<details>
<summary>⚠️ Requires Internal API Access - Currently Non-Functional</summary>

This utility requires access to the container's internal dependency graph, which is not currently exposed in the public API. It would need methods to traverse dependencies and access constructor metadata.

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
      graph.set(token.toString(), dependencies.map(d => d.toString()));
    }

    return this.formatGraph(graph);
  }

  /**
   * Finds services with the most dependencies
   */
  static findHighDependencyServices(container: Nexus, threshold: number = 5): Array<{token: string, count: number}> {
    const services = [];
    const tokens = this.getAllTokens(container);

    for (const token of tokens) {
      const dependencies = this.getDependencies(container, token);
      if (dependencies.length >= threshold) {
        services.push({
          token: token.toString(),
          count: dependencies.length
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
      dependencies.forEach(dep => dependentTokens.add(dep.toString()));
    }

    return allTokens
      .map(t => t.toString())
      .filter(token => !dependentTokens.has(token));
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

  private static calculateDepth(container: Nexus, token: TokenType, visited: Set<string>): number {
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
      this.calculateDepth(container, dep, new Set(visited))
    ));

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

  private static getDependencies(container: Nexus, token: TokenType): TokenType[] {
    // Implementation depends on container internals
    return [];
  }
}
```
</details>

## Performance Monitoring Utilities

### DiagnosticMonitor

Comprehensive performance tracking and diagnostics:

```typescript
class DiagnosticMonitor {
  private static metrics = {
    resolutionTime: 0,
    resolutionCount: 0,
    errors: 0,
    slowResolutions: [] as Array<{ token: string; time: number }>,
    memoryUsage: [] as Array<{ timestamp: number; heapUsed: number }>
  };

  /**
   * Tracks resolution performance for a token
   */
  static trackResolution<T>(token: TokenType<T>, fn: () => T): T {
    const start = performance.now();
    
    try {
      const result = fn();
      const end = performance.now();
      const time = end - start;
      
      this.metrics.resolutionCount++;
      this.metrics.resolutionTime += time;
      
      // Track slow resolutions
      if (time > 1) { // Over 1ms
        this.metrics.slowResolutions.push({
          token: token.toString(),
          time
        });
      }
      
      return result;
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
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
   * Gets comprehensive diagnostics
   */
  static getDiagnostics() {
    const avgTime = this.metrics.resolutionCount > 0 
      ? this.metrics.resolutionTime / this.metrics.resolutionCount 
      : 0;

    return {
      averageResolutionTime: avgTime,
      totalResolutions: this.metrics.resolutionCount,
      errorRate: this.metrics.resolutionCount > 0 
        ? this.metrics.errors / this.metrics.resolutionCount 
        : 0,
      slowResolutions: this.metrics.slowResolutions,
      memoryUsage: this.metrics.memoryUsage
    };
  }

  /**
   * Prints a comprehensive diagnostic report
   */
  static printReport() {
    const diagnostics = this.getDiagnostics();
    
    console.log('=== DI Diagnostics Report ===');
    console.log(`Average resolution time: ${diagnostics.averageResolutionTime.toFixed(3)}ms`);
    console.log(`Total resolutions: ${diagnostics.totalResolutions}`);
    console.log(`Error rate: ${(diagnostics.errorRate * 100).toFixed(2)}%`);
    
    if (diagnostics.slowResolutions.length > 0) {
      console.log('Slow resolutions:');
      diagnostics.slowResolutions.forEach(({ token, time }) => {
        console.log(`  - ${token}: ${time.toFixed(3)}ms`);
      });
    }

    if (diagnostics.memoryUsage.length > 0) {
      const latest = diagnostics.memoryUsage[diagnostics.memoryUsage.length - 1];
      console.log(`Current memory usage: ${(latest.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    }
    console.log('============================');
  }

  /**
   * Clears all metrics
   */
  static clearMetrics(): void {
    this.metrics = {
      resolutionTime: 0,
      resolutionCount: 0,
      errors: 0,
      slowResolutions: [],
      memoryUsage: []
    };
  }
}
```

### MemoryDiagnostics

Specialized memory usage analysis:

```typescript
class MemoryDiagnostics {
  /**
   * Checks memory usage for container operations
   */
  static checkMemoryUsage(container: Nexus, iterations: number = 100): {
    initialMemory: number;
    finalMemory: number;
    increase: number;
    averagePerInstance: number;
  } {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Create instances
    const instances = [];
    for (let i = 0; i < iterations; i++) {
      try {
        instances.push(container.get(USER_SERVICE));
      } catch (error) {
        console.warn(`Failed to create instance ${i}:`, error.message);
      }
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const increase = finalMemory - initialMemory;
    const averagePerInstance = instances.length > 0 ? increase / instances.length : 0;
    
    console.log('=== Memory Diagnostics ===');
    console.log(`Memory increase: ${(increase / 1024).toFixed(2)}KB`);
    console.log(`Instances created: ${instances.length}`);
    console.log(`Average per instance: ${(averagePerInstance / 1024).toFixed(2)}KB`);
    console.log('==========================');
    
    return {
      initialMemory,
      finalMemory,
      increase,
      averagePerInstance
    };
  }

  /**
   * Monitors memory usage over time
   */
  static monitorMemoryUsage(duration: number = 60000): void {
    const startTime = Date.now();
    const measurements: Array<{ timestamp: number; heapUsed: number }> = [];
    
    const interval = setInterval(() => {
      const memory = process.memoryUsage();
      measurements.push({
        timestamp: Date.now(),
        heapUsed: memory.heapUsed
      });
      
      if (Date.now() - startTime >= duration) {
        clearInterval(interval);
        this.analyzeMemoryTrend(measurements);
      }
    }, 1000);
  }

  private static analyzeMemoryTrend(measurements: Array<{ timestamp: number; heapUsed: number }>): void {
    if (measurements.length < 2) return;

    const first = measurements[0];
    const last = measurements[measurements.length - 1];
    const increase = last.heapUsed - first.heapUsed;
    const duration = (last.timestamp - first.timestamp) / 1000;

    console.log('=== Memory Trend Analysis ===');
    console.log(`Duration: ${duration.toFixed(1)}s`);
    console.log(`Memory change: ${(increase / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Rate: ${(increase / 1024 / 1024 / duration).toFixed(2)}MB/s`);
    console.log('============================');
  }
}
```

## Error Reporting Utilities

### ErrorReporter

Comprehensive error tracking and reporting:

```typescript
class ErrorReporter {
  private static errors: Array<{
    message: string;
    stack?: string;
    context: any;
    timestamp: string;
    token?: string;
  }> = [];

  /**
   * Reports DI errors with context
   */
  static reportDIError(error: Error, context: any, token?: string) {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
      token
    };
    
    this.errors.push(errorInfo);
    
    // Log to console
    console.error('DI Error:', errorInfo);
    
    // In production, send to monitoring service
    if (process.env.NODE_ENV === 'production') {
      this.sendToMonitoringService(errorInfo);
    }
  }

  /**
   * Gets error statistics
   */
  static getErrorStats(): {
    totalErrors: number;
    errorsByToken: Map<string, number>;
    recentErrors: Array<any>;
  } {
    const errorsByToken = new Map<string, number>();
    
    for (const error of this.errors) {
      if (error.token) {
        errorsByToken.set(error.token, (errorsByToken.get(error.token) || 0) + 1);
      }
    }

    const recentErrors = this.errors
      .filter(error => {
        const errorTime = new Date(error.timestamp).getTime();
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        return errorTime > oneHourAgo;
      })
      .slice(-10); // Last 10 errors

    return {
      totalErrors: this.errors.length,
      errorsByToken,
      recentErrors
    };
  }

  /**
   * Clears error history
   */
  static clearErrors(): void {
    this.errors = [];
  }

  private static sendToMonitoringService(errorInfo: any): void {
    // Implementation for production error reporting
    // This could send to services like Sentry, LogRocket, etc.
    console.log('Sending error to monitoring service:', errorInfo);
  }
}
```

## Usage Examples

### Basic Container Inspection

```typescript
// Inspect container state
ContainerDebugger.inspect(container);

// Check specific dependencies
ContainerDebugger.checkDependencies(container, USER_SERVICE);

// Validate entire container
const validation = ContainerDebugger.validateContainer(container);
if (!validation.valid) {
  console.error('Container validation failed:', validation.errors);
}
```

### Performance Monitoring

```typescript
// Track resolution performance
const userService = DiagnosticMonitor.trackResolution(USER_SERVICE, () => 
  container.get(USER_SERVICE)
);

// Monitor memory usage
MemoryDiagnostics.checkMemoryUsage(container);

// Print performance report
DiagnosticMonitor.printReport();
```

### Error Tracking

```typescript
// Report errors with context
try {
  const service = container.get(USER_SERVICE);
} catch (error) {
  ErrorReporter.reportDIError(error, { 
    containerState: container.list(),
    timestamp: Date.now()
  }, USER_SERVICE);
}

// Get error statistics
const stats = ErrorReporter.getErrorStats();
console.log(`Total errors: ${stats.totalErrors}`);
```

### Dependency Analysis

<details>
<summary>⚠️ Requires Internal API Access - Currently Non-Functional</summary>

These examples depend on utilities that require internal container access.

```typescript
// Generate dependency graph
const graph = DependencyGraphAnalyzer.generateDependencyGraph(container);
console.log(graph);

// Find high-dependency services
const highDeps = DependencyGraphAnalyzer.findHighDependencyServices(container);
console.log('High dependency services:', highDeps);

// Analyze dependency depth
const depths = DependencyGraphAnalyzer.analyzeDependencyDepth(container);
console.log('Dependency depths:', depths);
```
</details>

## Future Integration

These utilities will be available in the upcoming `@nexusdi/utils` package:

```typescript
// Future usage
import { 
  ContainerDebugger, 
  DependencyGraphAnalyzer,
  DiagnosticMonitor,
  MemoryDiagnostics,
  ErrorReporter 
} from '@nexusdi/utils';

// All utilities will be properly typed and integrated with NexusDI
```

## Next Steps

- **[Debugging & Diagnostics](debugging-and-diagnostics.md)** - Basic debugging techniques
- **[Circular Dependencies](circular-dependencies.md)** - Handle circular dependency issues
- **[Performance Tuning](performance-tuning.md)** - Optimize container performance

These utilities provide powerful debugging capabilities for complex dependency injection scenarios! 🛠️✨ 