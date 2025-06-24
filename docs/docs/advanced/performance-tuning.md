---
sidebar_position: 7
---

# Performance Tuning ⚡

Quick performance optimization tips and techniques for NexusDI. While NexusDI is already fast by default, these strategies can help you squeeze out every bit of performance for high-throughput applications.

> See also: [Performance](../performance.md), [Performance Utilities](performance-utilities.md)

## Quick Performance Tips

### ✅ Recommended Practices

- **Register all providers upfront** where possible
- **Avoid expensive logic** in provider factories
- **Use singletons** for shared dependencies
- **Prefer direct token lookups** over dynamic or computed tokens
- **Minimize deep dependency graphs** when possible
- **Use child containers only when necessary** (scoping adds a small overhead)

### ❌ Performance Anti-patterns

- Registering providers during runtime
- Expensive computations in factory functions
- Creating new instances for every request
- Deep dependency chains with many levels

## Basic Performance Monitoring

```typescript
// Measure container startup time
console.time('container-startup');
const container = new Nexus();
container.set(UserModule);
container.set(EmailModule);
console.timeEnd('container-startup');

// Measure service resolution time
console.time('service-resolution');
const userService = container.get(USER_SERVICE);
console.timeEnd('service-resolution');
```

## Optimization Strategies

### 1. Provider Registration Optimization

```typescript
// ✅ Good - Register everything upfront
const container = new Nexus();
container.set(DatabaseModule);
container.set(UserModule);
container.set(EmailModule);

// Start application
const app = container.get(APP_SERVICE);
app.start();

// ❌ Bad - Registering during runtime
const container = new Nexus();
const app = container.get(APP_SERVICE); // Might trigger lazy registration
```

### 2. Factory Function Optimization

```typescript
// ✅ Good - Lightweight factory
container.set(LOGGER, {
  useFactory: () => new ConsoleLogger()
});

// ❌ Bad - Expensive factory
container.set(LOGGER, {
  useFactory: () => {
    // Expensive operations during resolution
    const config = loadConfigFromFile();
    const connection = establishDatabaseConnection();
    return new DatabaseLogger(config, connection);
  }
});

// ✅ Better - Move expensive operations outside
const config = loadConfigFromFile();
const connection = establishDatabaseConnection();

container.set(LOGGER_CONFIG, { useValue: config });
container.set(DB_CONNECTION, { useValue: connection });
container.set(LOGGER, { useClass: DatabaseLogger });
```

### 3. Dependency Graph Optimization

```typescript
// ✅ Good - Shallow dependency graph
@Service(USER_SERVICE)
class UserService {
  constructor(
    @Inject(DATABASE) private db: IDatabase,
    @Inject(LOGGER) private logger: ILogger
  ) {}
}

// ❌ Bad - Deep dependency graph
@Service(USER_SERVICE)
class UserService {
  constructor(
    @Inject(USER_REPOSITORY) private repo: IUserRepository,
    @Inject(EMAIL_SERVICE) private email: IEmailService,
    @Inject(ANALYTICS_SERVICE) private analytics: IAnalyticsService,
    @Inject(CACHE_SERVICE) private cache: ICacheService,
    @Inject(NOTIFICATION_SERVICE) private notifications: INotificationService
  ) {}
}
```

### 4. Child Container Optimization

```typescript
// ✅ Good - Use child containers sparingly
const appContainer = new Nexus();
appContainer.set(AppModule);

// Only create child containers when needed for scoping
if (requestScopedServices) {
  const requestContainer = appContainer.createChildContainer();
  requestContainer.set(REQUEST_ID, { useValue: generateRequestId() });
}

// ❌ Bad - Creating child containers unnecessarily
const container = new Nexus();
const child1 = container.createChildContainer();
const child2 = child1.createChildContainer();
const child3 = child2.createChildContainer();
```

## Memory Optimization

### Singleton vs Transient Services

```typescript
// ✅ Good - Use singletons for shared resources
@Service(DATABASE)
class DatabaseService {
  private connection: Connection;
  
  constructor() {
    this.connection = new Connection(); // Expensive operation
  }
}

// Services are singletons by default
container.set(DATABASE, { useClass: DatabaseService });

// ❌ Bad - Creating new instances unnecessarily
container.set(DATABASE, { 
  useFactory: () => new DatabaseService() // Creates new instance every time
});
```

### Memory Leak Prevention

```typescript
// ✅ Good - Clear containers when done
describe('UserService', () => {
  let container: Nexus;

  beforeEach(() => {
    container = new Nexus();
    container.set(USER_SERVICE, { useClass: UserService });
  });

  afterEach(() => {
    container.clear(); // Prevent memory leaks
  });
});
```

## When to Optimize

### ✅ Optimize When

- **High-throughput applications** (thousands of requests per second)
- **Startup time is critical** (serverless functions, edge computing)
- **Memory usage is constrained** (embedded systems, mobile apps)
- **You notice performance bottlenecks** in profiling

### ⚠️ Don't Over-Optimize

- **Small applications** where DI overhead is negligible
- **Development environments** where readability is more important
- **Premature optimization** before identifying actual bottlenecks

## Performance Checklist

Before optimizing, ensure you have:

- [ ] **Measured baseline performance** with real data
- [ ] **Identified actual bottlenecks** through profiling
- [ ] **Compared with and without DI** to understand overhead
- [ ] **Tested optimizations** in realistic scenarios
- [ ] **Monitored memory usage** to avoid trading speed for memory

## Next Steps

- **[Performance Utilities](performance-utilities.md)** - Advanced performance monitoring tools
- **[Debugging & Diagnostics](debugging-and-diagnostics.md)** - Troubleshoot performance issues
- **[Performance](../performance.md)** - Detailed performance benchmarks

Remember: NexusDI is already optimized for most use cases. Only apply these techniques when you have measurable performance requirements that justify the additional complexity! 🚀 