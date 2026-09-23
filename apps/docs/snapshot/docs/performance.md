---
sidebar_position: 3
---

# Performance & Bundle Size ⚡

NexusDI is designed to be lightweight and performant while providing powerful dependency injection capabilities. Think of it as the sports car of DI libraries - fast, efficient, and fun to drive! This guide covers runtime overhead, bundle size analysis, performance characteristics, optimization strategies, and real-world impact.

## 📦 Bundle Size Analysis (The "How Big Is It?" Section)

### Core Library Size

These figures come from esbuild 0.28.2 bundling a minimal consumer against the `@nexusdi/core` 0.3.2 tarball from npm, with `--bundle --minify --format=esm`. The consumer imports `Nexus`, `Service`, `Inject` and `Token`, registers two services and resolves one.

```bash
# Minified ESM bundle of the consumer, @nexusdi/core 0.3.2
Raw:        6,254 bytes (6.1KB)
Gzipped:    2,270 bytes (2.2KB)
```

### Runtime Dependencies

`@nexusdi/core` 0.3.2 has no runtime dependencies and no peer dependencies. NexusDI 0.3 does not use `reflect-metadata`.

### Total Runtime Overhead

```
NexusDI Core:    6.1KB minified (2.2KB gzipped)
─────────────────────────────────
Total Overhead:  6.1KB minified (2.2KB gzipped)
```

## 🚀 Performance Characteristics

### Startup Performance

NexusDI is designed for fast startup with minimal overhead:

```typescript
// Fast container instantiation
const container = new Nexus();

// Efficient service registration
container.set(USER_SERVICE, { useClass: UserService });

// Quick dependency resolution
const userService = container.get(USER_SERVICE);
```

### Runtime Performance

- **Token resolution**: O(1) lookup using Map-based storage
- **Singleton caching**: Instances are cached after first creation
- **Memory efficient**: Minimal object creation overhead
- **No reflection overhead**: Metadata is read when a provider is registered or resolved. `set()` reads module and provider metadata, and `get()` reads a class's injection metadata when it constructs the class

## 📊 Comparison with Other DI Libraries

NexusDI 0.4 will include a reproducible benchmark harness that compares DI containers.

### Why NexusDI is Fast

1. **Minimal abstraction layers**: Direct object creation without complex reflection
2. **Efficient data structures**: Map-based lookups for O(1) token resolution
3. **Simple metadata reading**: Basic decorator metadata without complex parsing
4. **Single responsibility**: Focused on core DI functionality without extra features
5. **Optimized for TypeScript**: Leverages TypeScript's type system efficiently

## 🎯 Bundle Size Impact

### For Different Application Types

#### Small Application (100KB bundle)

```
Original: 100KB
With NexusDI: 106.1KB (+6.1KB)
Impact: +6.1% bundle size
```

#### Medium Application (1MB bundle)

```
Original: 1MB
With NexusDI: 1.006MB (+6.1KB)
Impact: +0.6% bundle size
```

#### Large Application (5MB bundle)

```
Original: 5MB
With NexusDI: 5.006MB (+6.1KB)
Impact: +0.12% bundle size
```

### Tree Shaking Benefits

NexusDI is fully tree-shakeable, so unused features are eliminated:

```typescript
// Minified ESM bundles from esbuild 0.28.2, @nexusdi/core 0.3.2
import { Nexus, Token } from '@nexusdi/core'; // 5,090 bytes
import { Service, Inject } from '@nexusdi/core'; // 6,254 bytes for the two-service consumer
import * as NexusDI from '@nexusdi/core'; // 7,589 bytes, every export
```

## 🔧 Optimization Strategies

### 1. Selective Imports

```typescript
// ✅ Good - Only import what you need
import { Nexus, Token, Service, Inject } from '@nexusdi/core';

// ❌ Bad - Import everything
import * as NexusDI from '@nexusdi/core';
```

### 2. Lazy Module Loading

```typescript
// Load modules only when needed
const container = new Nexus();

if (process.env.NODE_ENV === 'production') {
  // Only load production modules
  container.set(ProductionModule);
} else {
  // Load development modules
  container.set(DevelopmentModule);
}
```

### 3. Conditional Registration

```typescript
// Register services conditionally
if (process.env.ENABLE_ANALYTICS === 'true') {
  container.set(ANALYTICS_SERVICE, { useClass: AnalyticsService });
}

if (process.env.ENABLE_CACHING === 'true') {
  container.set(CACHE_SERVICE, { useClass: RedisCache });
}
```

### 4. Bundle Splitting

```typescript
// Split by feature modules
// user-module.js
export const UserModule = {
  providers: [UserService, UserRepository],
};

// email-module.js
export const EmailModule = {
  providers: [EmailService],
};
```

### 5. Dynamic Imports

```typescript
// Load modules dynamically
async function loadUserModule() {
  const { UserModule } = await import('./user-module');
  container.set(UserModule);
}

// Only load when needed
if (userFeatureEnabled) {
  await loadUserModule();
}
```

## 🎯 When Performance Matters

### ✅ Good Use Cases (Low Performance Impact)

- **Web applications**: Bundle size impact is minimal (0.6% on a 1MB bundle)
- **Server applications**: Runtime overhead is negligible
- **Medium to large projects**: Benefits outweigh costs
- **Applications with complex dependencies**: DI improves maintainability
- **Microservices**: Very low memory footprint

### ⚠️ Consider Alternatives When

- **Edge computing**: Strict memory limits
- **Simple applications**: DI adds unnecessary complexity
- **Performance-critical applications**: Startup time is crucial

### 📊 Decision Matrix

| Application Type     | Bundle Size       | Performance Impact | Recommendation   |
| -------------------- | ----------------- | ------------------ | ---------------- |
| Small SPA            | Low (+6.1%)       | Very Low           | Good choice      |
| Medium Web App       | Very Low (+0.6%)  | Very Low           | Excellent choice |
| Large Enterprise App | Very Low (+0.12%) | Very Low           | Excellent choice |
| Microservice         | Low (+6.1KB)      | Very Low           | Excellent choice |
| Server Application   | N/A               | Very Low           | Excellent choice |

## 🔍 Real-World Performance Monitoring

### Bundle Analysis

```bash
# Analyze bundle size with webpack-bundle-analyzer
npm install --save-dev webpack-bundle-analyzer

# Add to webpack config
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  plugins: [
    new BundleAnalyzerPlugin()
  ]
};
```

### Runtime Performance Monitoring

```typescript
// Monitor DI performance in production
class PerformanceMonitor {
  private static metrics = {
    resolutionTime: 0,
    resolutionCount: 0,
  };

  static trackResolution<T>(token: TokenType<T>, fn: () => T): T {
    const start = performance.now();
    const result = fn();
    const end = performance.now();

    this.metrics.resolutionTime += end - start;
    this.metrics.resolutionCount++;

    return result;
  }

  static getAverageResolutionTime(): number {
    return this.metrics.resolutionTime / this.metrics.resolutionCount;
  }
}

// Usage
const userService = PerformanceMonitor.trackResolution(USER_SERVICE, () =>
  container.get(USER_SERVICE)
);
```

## 🎯 Best Practices for Performance

### 1. Minimize Dependencies

```typescript
// ✅ Good - Minimal dependencies
@Service(USER_SERVICE)
class UserService {
  constructor(
    @Inject(DATABASE) private database: IDatabase,
    @Inject(LOGGER) private logger: ILogger
  ) {}
}

// ❌ Bad - Too many dependencies
@Service(USER_SERVICE)
class UserService {
  constructor(
    @Inject(DATABASE) private database: IDatabase,
    @Inject(LOGGER) private logger: ILogger,
    @Inject(EMAIL_SERVICE) private emailService: IEmailService,
    @Inject(CACHE_SERVICE) private cacheService: ICacheService,
    @Inject(ANALYTICS_SERVICE) private analyticsService: IAnalyticsService,
    @Inject(NOTIFICATION_SERVICE)
    private notificationService: INotificationService
  ) {}
}
```

### 2. Use Lazy Loading

```typescript
// Load heavy services only when needed
@Service(USER_SERVICE)
class UserService {
  private analyticsService?: IAnalyticsService;

  async trackUserAction(action: string) {
    if (!this.analyticsService) {
      // Load analytics service only when needed
      this.analyticsService = container.get(ANALYTICS_SERVICE);
    }
    await this.analyticsService.track(action);
  }
}
```

### 3. Optimize Module Structure

```typescript
// Split modules by feature to enable tree shaking
@Module({
  providers: [UserService, UserRepository],
})
class UserModule {}

@Module({
  providers: [EmailService],
})
class EmailModule {}
```

## 📊 Summary

NexusDI provides excellent performance characteristics:

- **Minimal overhead**: 6.1KB minified, 2.2KB gzipped
- **Tree-shakeable**: Unused features are eliminated

### Key Performance Advantages

1. **Small bundle size** with tree-shaking support
2. **No runtime dependencies** in 0.3.2

For most applications, the performance impact is negligible while the benefits of dependency injection (testability, maintainability, flexibility) are substantial. NexusDI is particularly well-suited for:

- **Microservices** where memory and startup time matter
- **Web applications** where bundle size is important
- **Server applications** where performance is critical
- **Large applications** where maintainability is key

The key is choosing the right tool for your specific use case and performance requirements, and NexusDI excels in providing excellent performance characteristics across all metrics.

For advanced performance tips and diagnostics, see [Performance Tuning](./advanced/performance-tuning.md).
