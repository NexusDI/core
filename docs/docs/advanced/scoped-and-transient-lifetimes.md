---
sidebar_position: 12
---

# Scoped & Transient Lifetimes ⏱️

Learn how to control service lifetimes in NexusDI, from singleton to transient instances. Like The Expanse's ship systems that can be shared across compartments or isolated for safety, lifetime management ensures your services are created and destroyed at the right times.

> See also: [Performance Tuning](performance-tuning.md), [Child Containers](advanced-providers-and-factories.md)

## What Are Service Lifetimes?

Service lifetimes determine how long a service instance exists and when it's created or destroyed. NexusDI supports different lifetime strategies to optimize memory usage, performance, and resource management.

```typescript
// Different lifetime strategies
container.set(USER_SERVICE, {
  useClass: UserService,
  lifetime: 'singleton', // Default - one instance for the entire container
});

container.set(REQUEST_SERVICE, {
  useClass: RequestService,
  lifetime: 'scoped', // One instance per scope/child container
});

container.set(LOGGER, {
  useClass: Logger,
  lifetime: 'transient', // New instance every time
});
```

## Lifetime Types

### Singleton (Default)

```typescript
// Singleton - one instance for the entire container
container.set(DATABASE, {
  useClass: Database,
  lifetime: 'singleton', // or omit for default
});

// Same instance returned every time
const db1 = container.get(DATABASE);
const db2 = container.get(DATABASE);
console.log(db1 === db2); // true
```

### Scoped

```typescript
// Scoped - one instance per child container
container.set(REQUEST_CONTEXT, {
  useClass: RequestContext,
  lifetime: 'scoped',
});

// Different instances for different child containers
const child1 = container.createChildContainer();
const child2 = container.createChildContainer();

const context1 = child1.get(REQUEST_CONTEXT);
const context2 = child2.get(REQUEST_CONTEXT);
console.log(context1 === context2); // false

// Same instance within the same child container
const context1Again = child1.get(REQUEST_CONTEXT);
console.log(context1 === context1Again); // true
```

### Transient

```typescript
// Transient - new instance every time
container.set(LOGGER, {
  useClass: Logger,
  lifetime: 'transient',
});

// Different instances every time
const logger1 = container.get(LOGGER);
const logger2 = container.get(LOGGER);
console.log(logger1 === logger2); // false
```

## Lifetime Management Patterns

### Request-Scoped Services

```typescript
// Request-scoped services for web applications
@Service(REQUEST_CONTEXT)
class RequestContext {
  public userId?: string;
  public sessionId?: string;
  public requestId: string;

  constructor() {
    this.requestId = crypto.randomUUID();
  }
}

@Service(USER_SERVICE)
class UserService {
  constructor(@Inject(REQUEST_CONTEXT) private context: RequestContext) {}

  getCurrentUser(): string | undefined {
    return this.context.userId;
  }

  setCurrentUser(userId: string): void {
    this.context.userId = userId;
  }
}

// Usage in web framework
app.use((req, res, next) => {
  // Create child container for each request
  const requestContainer = container.createChildContainer();

  // Set request-specific data
  const context = requestContainer.get(REQUEST_CONTEXT);
  context.userId = req.headers['user-id'] as string;
  context.sessionId = req.headers['session-id'] as string;

  // Attach container to request
  (req as any).container = requestContainer;
  next();
});

app.get('/user', (req, res) => {
  const requestContainer = (req as any).container;
  const userService = requestContainer.get(USER_SERVICE);

  const currentUser = userService.getCurrentUser();
  res.json({ user: currentUser });
});
```

### Session-Scoped Services

```typescript
// Session-scoped services
@Service(SESSION_MANAGER)
class SessionManager {
  private sessions = new Map<string, any>();

  getSession(sessionId: string): any {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {});
    }
    return this.sessions.get(sessionId);
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

@Service(USER_PREFERENCES)
class UserPreferences {
  constructor(
    @Inject(SESSION_MANAGER) private sessionManager: SessionManager
  ) {}

  getTheme(sessionId: string): string {
    const session = this.sessionManager.getSession(sessionId);
    return session.theme || 'default';
  }

  setTheme(sessionId: string, theme: string): void {
    const session = this.sessionManager.getSession(sessionId);
    session.theme = theme;
  }
}

// Usage
const sessionContainer = container.createChildContainer();
const preferences = sessionContainer.get(USER_PREFERENCES);

preferences.setTheme('session123', 'dark');
console.log(preferences.getTheme('session123')); // 'dark'
```

### Transient Services for Stateless Operations

```typescript
// Transient services for stateless operations
@Service(EMAIL_SENDER)
class EmailSender {
  constructor(@Inject(EMAIL_CONFIG) private config: IEmailConfig) {}

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    // Send email logic
    console.log(`Sending email to ${to}: ${subject}`);
  }
}

@Service(EMAIL_SERVICE)
class EmailService {
  constructor(@Inject(EMAIL_SENDER) private sender: EmailSender) {}

  async sendWelcomeEmail(userEmail: string): Promise<void> {
    await this.sender.sendEmail(
      userEmail,
      'Welcome!',
      'Welcome to our platform!'
    );
  }

  async sendPasswordReset(userEmail: string): Promise<void> {
    await this.sender.sendEmail(
      userEmail,
      'Password Reset',
      'Click here to reset your password'
    );
  }
}

// Usage - each call gets a fresh EmailSender instance
const emailService = container.get(EMAIL_SERVICE);
await emailService.sendWelcomeEmail('user@example.com');
await emailService.sendPasswordReset('user@example.com');
```

## Advanced Lifetime Patterns

### Factory-Based Lifetimes

```typescript
// Factory-based lifetime management
class LifetimeManager {
  private singletons = new Map<string, any>();
  private scoped = new Map<string, Map<string, any>>();

  getSingleton<T>(token: TokenType<T>, factory: () => T): T {
    const key = token.toString();

    if (!this.singletons.has(key)) {
      this.singletons.set(key, factory());
    }

    return this.singletons.get(key);
  }

  getScoped<T>(token: TokenType<T>, scopeId: string, factory: () => T): T {
    const key = token.toString();

    if (!this.scoped.has(key)) {
      this.scoped.set(key, new Map());
    }

    const scopeMap = this.scoped.get(key)!;

    if (!scopeMap.has(scopeId)) {
      scopeMap.set(scopeId, factory());
    }

    return scopeMap.get(scopeId);
  }

  clearScope(scopeId: string): void {
    for (const scopeMap of this.scoped.values()) {
      scopeMap.delete(scopeId);
    }
  }
}

// Usage with dependency injection
@Service(LIFETIME_MANAGER)
class ContainerLifetimeManager extends LifetimeManager {
  // Extend with container-specific functionality
}

@Service(SCOPED_SERVICE)
class ScopedService {
  constructor(
    @Inject(LIFETIME_MANAGER) private lifetimeManager: ContainerLifetimeManager
  ) {}

  getService<T>(token: TokenType<T>, scopeId: string): T {
    return this.lifetimeManager.getScoped(token, scopeId, () => {
      // Factory function to create the service
      return new (token as any)();
    });
  }
}
```

### Disposable Services

```typescript
// Services that need cleanup
interface IDisposable {
  dispose(): Promise<void>;
}

@Service(DATABASE_CONNECTION)
class DatabaseConnection implements IDisposable {
  private connection: any;

  async connect(): Promise<void> {
    this.connection = await createConnection();
  }

  async query(sql: string): Promise<any> {
    return this.connection.query(sql);
  }

  async dispose(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
    }
  }
}

// Lifetime manager with disposal
class DisposableLifetimeManager {
  private disposables = new Map<string, IDisposable[]>();

  registerDisposable(token: string, disposable: IDisposable): void {
    if (!this.disposables.has(token)) {
      this.disposables.set(token, []);
    }
    this.disposables.get(token)!.push(disposable);
  }

  async disposeScope(scopeId: string): Promise<void> {
    const disposables = this.disposables.get(scopeId) || [];

    for (const disposable of disposables) {
      await disposable.dispose();
    }

    this.disposables.delete(scopeId);
  }
}

// Usage
const lifetimeManager = new DisposableLifetimeManager();
const dbConnection = new DatabaseConnection();
await dbConnection.connect();

lifetimeManager.registerDisposable('request123', dbConnection);

// Later, when request is complete
await lifetimeManager.disposeScope('request123');
```

### Lazy Initialization

```typescript
// Lazy initialization for expensive services
class LazyService<T> {
  private instance?: T;
  private factory: () => T;

  constructor(factory: () => T) {
    this.factory = factory;
  }

  get(): T {
    if (!this.instance) {
      this.instance = this.factory();
    }
    return this.instance;
  }

  reset(): void {
    this.instance = undefined;
  }
}

// Usage with dependency injection
container.set(EXPENSIVE_SERVICE, {
  useFactory: () => new LazyService(() => new ExpensiveService()),
  lifetime: 'singleton',
});

// Service is only created when first accessed
const lazyService = container.get(EXPENSIVE_SERVICE);
const instance = lazyService.get(); // ExpensiveService created here
```

## Real-World Examples

### Example 1: Web Application with Request Scoping

```typescript
// Web application with proper lifetime management
@Service(REQUEST_LOGGER)
class RequestLogger {
  private logs: string[] = [];

  log(message: string): void {
    this.logs.push(`${new Date().toISOString()}: ${message}`);
  }

  getLogs(): string[] {
    return [...this.logs];
  }
}

@Service(USER_SERVICE)
class UserService {
  constructor(@Inject(REQUEST_LOGGER) private logger: RequestLogger) {}

  async getUser(id: string): Promise<User> {
    this.logger.log(`Fetching user ${id}`);
    // Fetch user logic
    return { id, name: 'John Doe' };
  }
}

@Service(ORDER_SERVICE)
class OrderService {
  constructor(@Inject(REQUEST_LOGGER) private logger: RequestLogger) {}

  async getOrders(userId: string): Promise<Order[]> {
    this.logger.log(`Fetching orders for user ${userId}`);
    // Fetch orders logic
    return [];
  }
}

// Express.js middleware for request scoping
app.use((req, res, next) => {
  const requestContainer = container.createChildContainer();

  // Set request ID for logging
  const logger = requestContainer.get(REQUEST_LOGGER);
  logger.log(`Request started: ${req.method} ${req.path}`);

  (req as any).container = requestContainer;
  next();
});

app.get('/user/:id', async (req, res) => {
  const requestContainer = (req as any).container;

  const userService = requestContainer.get(USER_SERVICE);
  const orderService = requestContainer.get(ORDER_SERVICE);

  const user = await userService.getUser(req.params.id);
  const orders = await orderService.getOrders(req.params.id);

  // Both services share the same RequestLogger instance
  const logger = requestContainer.get(REQUEST_LOGGER);
  const logs = logger.getLogs();

  res.json({ user, orders, logs });
});
```

### Example 2: Background Job Processing

```typescript
// Background job processing with transient services
@Service(JOB_PROCESSOR)
class JobProcessor {
  constructor(@Inject(JOB_LOGGER) private logger: JobLogger) {}

  async processJob(job: Job): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);

    // Process job logic
    await new Promise((resolve) => setTimeout(resolve, 1000));

    this.logger.log(`Job ${job.id} completed`);
  }
}

@Service(JOB_LOGGER)
class JobLogger {
  private jobId: string;

  constructor() {
    this.jobId = crypto.randomUUID();
  }

  log(message: string): void {
    console.log(`[Job ${this.jobId}] ${message}`);
  }
}

// Job queue processor
class JobQueue {
  constructor(@Inject(JOB_PROCESSOR) private processor: JobProcessor) {}

  async processJobs(jobs: Job[]): Promise<void> {
    // Each job gets its own JobProcessor and JobLogger instance
    await Promise.all(jobs.map((job) => this.processor.processJob(job)));
  }
}

// Usage
const jobQueue = container.get(JOB_QUEUE);
await jobQueue.processJobs([
  { id: 'job1', data: 'data1' },
  { id: 'job2', data: 'data2' },
]);
```

### Example 3: Configuration Management

```typescript
// Configuration management with different lifetimes
@Service(APP_CONFIG)
class AppConfig {
  private config: any;

  constructor() {
    this.config = {
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    };
  }

  get(key: string): any {
    return key.split('.').reduce((obj, k) => obj?.[k], this.config);
  }
}

@Service(USER_CONFIG)
class UserConfig {
  constructor(@Inject(APP_CONFIG) private appConfig: AppConfig) {}

  getDatabaseConfig(): any {
    return this.appConfig.get('database');
  }
}

// Singleton for app-wide configuration
container.set(APP_CONFIG, {
  useClass: AppConfig,
  lifetime: 'singleton',
});

// Scoped for user-specific configuration
container.set(USER_CONFIG, {
  useClass: UserConfig,
  lifetime: 'scoped',
});

// Usage
const appConfig = container.get(APP_CONFIG); // Singleton
const userContainer = container.createChildContainer();
const userConfig = userContainer.get(USER_CONFIG); // Scoped
```

## Performance Considerations

### Memory Usage Analysis

```typescript
// Analyze memory usage by lifetime
class LifetimeAnalyzer {
  static analyzeMemoryUsage(container: Nexus): void {
    const { providers } = container.list();

    console.log('=== Lifetime Analysis ===');

    for (const provider of providers) {
      const lifetime = provider.lifetime || 'singleton';
      console.log(`${provider.token.toString()}: ${lifetime}`);
    }

    console.log('========================');
  }

  static measureInstanceCount(
    container: Nexus,
    token: TokenType,
    count: number
  ): void {
    const instances = new Set();

    for (let i = 0; i < count; i++) {
      const instance = container.get(token);
      instances.add(instance);
    }

    console.log(
      `${token.toString()}: ${
        instances.size
      } unique instances out of ${count} requests`
    );
  }
}

// Usage
LifetimeAnalyzer.analyzeMemoryUsage(container);

// Test different lifetimes
LifetimeAnalyzer.measureInstanceCount(container, SINGLETON_SERVICE, 100); // Should be 1
LifetimeAnalyzer.measureInstanceCount(container, TRANSIENT_SERVICE, 100); // Should be 100
```

### Lifetime Performance Comparison

```typescript
// Compare performance of different lifetimes
class LifetimePerformanceTest {
  static measureResolutionTime(
    container: Nexus,
    token: TokenType,
    iterations: number
  ): number {
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      container.get(token);
    }

    return performance.now() - start;
  }

  static compareLifetimes(container: Nexus): void {
    const iterations = 1000;

    console.log('=== Lifetime Performance Comparison ===');

    const singletonTime = this.measureResolutionTime(
      container,
      SINGLETON_SERVICE,
      iterations
    );
    console.log(
      `Singleton: ${singletonTime.toFixed(3)}ms for ${iterations} resolutions`
    );

    const transientTime = this.measureResolutionTime(
      container,
      TRANSIENT_SERVICE,
      iterations
    );
    console.log(
      `Transient: ${transientTime.toFixed(3)}ms for ${iterations} resolutions`
    );

    console.log(
      `Performance ratio: ${(transientTime / singletonTime).toFixed(2)}x`
    );
    console.log('=====================================');
  }
}

// Usage
LifetimePerformanceTest.compareLifetimes(container);
```

## Testing Lifetimes

### Unit Testing Lifetimes

```typescript
describe('Service Lifetimes', () => {
  let container: Nexus;

  beforeEach(() => {
    container = new Nexus();
  });

  it('should create singleton instances', () => {
    container.set(SINGLETON_SERVICE, {
      useClass: TestService,
      lifetime: 'singleton',
    });

    const instance1 = container.get(SINGLETON_SERVICE);
    const instance2 = container.get(SINGLETON_SERVICE);

    expect(instance1).toBe(instance2);
  });

  it('should create different instances for transient services', () => {
    container.set(TRANSIENT_SERVICE, {
      useClass: TestService,
      lifetime: 'transient',
    });

    const instance1 = container.get(TRANSIENT_SERVICE);
    const instance2 = container.get(TRANSIENT_SERVICE);

    expect(instance1).not.toBe(instance2);
  });

  it('should create scoped instances per child container', () => {
    container.set(SCOPED_SERVICE, {
      useClass: TestService,
      lifetime: 'scoped',
    });

    const child1 = container.createChildContainer();
    const child2 = container.createChildContainer();

    const instance1 = child1.get(SCOPED_SERVICE);
    const instance2 = child2.get(SCOPED_SERVICE);
    const instance1Again = child1.get(SCOPED_SERVICE);

    expect(instance1).not.toBe(instance2);
    expect(instance1).toBe(instance1Again);
  });
});
```

### Integration Testing

```typescript
describe('Lifetime Integration', () => {
  let container: Nexus;

  beforeEach(() => {
    container = new Nexus();
  });

  it('should handle request scoping correctly', () => {
    container.set(REQUEST_SERVICE, {
      useClass: RequestService,
      lifetime: 'scoped',
    });

    const request1 = container.createChildContainer();
    const request2 = container.createChildContainer();

    const service1 = request1.get(REQUEST_SERVICE);
    const service2 = request2.get(REQUEST_SERVICE);

    // Should be different instances
    expect(service1).not.toBe(service2);

    // Should maintain state within scope
    service1.setData('test1');
    service2.setData('test2');

    expect(service1.getData()).toBe('test1');
    expect(service2.getData()).toBe('test2');
  });

  it('should dispose scoped services correctly', async () => {
    const disposables: IDisposable[] = [];

    container.set(DISPOSABLE_SERVICE, {
      useFactory: () => {
        const service = new DisposableService();
        disposables.push(service);
        return service;
      },
      lifetime: 'scoped',
    });

    const child = container.createChildContainer();
    const service = child.get(DISPOSABLE_SERVICE);

    await child.dispose();

    expect(service.isDisposed).toBe(true);
  });
});
```

## Best Practices

### 1. Choose Appropriate Lifetimes

```typescript
// ✅ Good - Appropriate lifetime choices
container.set(DATABASE, {
  useClass: Database,
  lifetime: 'singleton', // Expensive to create, stateless
});

container.set(REQUEST_CONTEXT, {
  useClass: RequestContext,
  lifetime: 'scoped', // Per-request state
});

container.set(LOGGER, {
  useClass: Logger,
  lifetime: 'transient', // Lightweight, stateless
});
```

### 2. Handle Disposal Properly

```typescript
// ✅ Good - Proper disposal handling
class ScopedContainer {
  private disposables: IDisposable[] = [];

  registerDisposable(disposable: IDisposable): void {
    this.disposables.push(disposable);
  }

  async dispose(): Promise<void> {
    for (const disposable of this.disposables) {
      await disposable.dispose();
    }
    this.disposables = [];
  }
}
```

### 3. Use Child Containers for Scoping

```typescript
// ✅ Good - Use child containers for scoping
app.use((req, res, next) => {
  const requestContainer = container.createChildContainer();

  // Set request-specific data
  requestContainer.set(REQUEST_ID, { useValue: req.id });

  (req as any).container = requestContainer;
  next();
});
```

### 4. Monitor Memory Usage

```typescript
// ✅ Good - Monitor memory usage
class MemoryMonitor {
  static checkMemoryUsage(): void {
    const usage = process.memoryUsage();
    console.log('Memory usage:', {
      heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
    });
  }
}
```

## Next Steps

- **[Performance Tuning](performance-tuning.md)** - Optimize your DI container performance
- **[Child Containers](advanced-providers-and-factories.md)** - Learn about container hierarchies
- **[Testing](../testing.md)** - Test your lifetime management

Remember: Like The Expanse's ship systems, choose the right lifetime for each service - some need to be shared across compartments, others should be isolated for safety! ⏱️✨
