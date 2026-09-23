---
sidebar_position: 1
title: 'Async Patterns & Error Handling'
description: 'Master async/await patterns and error handling in NexusDI. Learn how to build robust, asynchronous applications with proper error handling.'
tags: ['async', 'await', 'error-handling', 'promises', 'patterns']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# ⚡ Async Patterns & Error Handling

Welcome to the advanced world of asynchronous programming with NexusDI! Just as a Jedi must master the Force to become powerful, you must master async/await patterns and error handling to build robust, scalable applications. This guide will teach you the advanced techniques that separate good developers from great ones.

## 🎯 Why Async Matters

NexusDI is built with async-first principles, which means:

- All container operations are asynchronous
- Services can be initialized asynchronously
- Error handling is built into the async flow
- Resource cleanup is handled properly

## 🚀 Basic Async Patterns

### Container Initialization

```text
import { Nexus } from 'nexusdi-core';

// Define tokens
const USER_SERVICE = Symbol('UserService');

async function bootstrap() {
  const container = new Nexus();

  // Always initialize the container
  await container.init();

  // Register services using tokens and uninstantiated classes
  container.set(USER_SERVICE, UserService);

  // Use services
  const userService = await container.get(USER_SERVICE);

  return container;
}

// Bootstrap your application
bootstrap().catch(console.error);
```

### Service Registration with Async Factories

```text
// Define tokens
const DATABASE_SERVICE = Symbol('DatabaseService');
const DATABASE_CONFIG = Symbol('DatabaseConfig');

// Register services using tokens and uninstantiated classes
container.set(DATABASE_SERVICE, DatabaseService);
container.set(DATABASE_CONFIG, DatabaseConfig);

// Use the service - NexusDI will handle instantiation and dependency injection
const db = await container.get(DATABASE_SERVICE);
```

### Async Service Methods

```text
@Service()
class UserService {
  constructor(@Inject() private userRepo: UserRepository) {}

  async getUser(id: number): Promise<User> {
    try {
      const user = await this.userRepo.findById(id);
      if (!user) {
        throw new Error(`User with id ${id} not found`);
      }
      return user;
    } catch (error) {
      console.error('Failed to get user:', error);
      throw error;
    }
  }

  async createUser(userData: UserData): Promise<User> {
    try {
      // Validate input
      if (!userData.email) {
        throw new Error('Email is required');
      }

      // Create user
      const user = await this.userRepo.save(userData);

      // Send welcome email (fire and forget)
      this.sendWelcomeEmail(user.email).catch(console.error);

      return user;
    } catch (error) {
      console.error('Failed to create user:', error);
      throw error;
    }
  }

  private async sendWelcomeEmail(email: string): Promise<void> {
    // Implementation
  }
}
```

## 🔧 Advanced Async Patterns

### Parallel Service Resolution

```text
// Define tokens
const USER_SERVICE = Symbol('UserService');
const ORDER_SERVICE = Symbol('OrderService');
const PAYMENT_SERVICE = Symbol('PaymentService');

async function loadUserData(userId: number) {
  const container = new Nexus();
  await container.init();

  // Register services using tokens and uninstantiated classes
  container.set(USER_SERVICE, UserService);
  container.set(ORDER_SERVICE, OrderService);
  container.set(PAYMENT_SERVICE, PaymentService);

  // Resolve services in parallel
  const [userService, orderService, paymentService] = await Promise.all([
    container.get(USER_SERVICE),
    container.get(ORDER_SERVICE),
    container.get(PAYMENT_SERVICE)
  ]);

  // Use services
  const [user, orders, payments] = await Promise.all([
    userService.getUser(userId),
    orderService.getOrdersByUserId(userId),
    paymentService.getPaymentsByUserId(userId)
  ]);

  return { user, orders, payments };
}
```

### Sequential Service Resolution

```text
// Define tokens
const USER_SERVICE = Symbol('UserService');
const EMAIL_SERVICE = Symbol('EmailService');
const AUDIT_SERVICE = Symbol('AuditService');

async function processUserRegistration(userData: UserData) {
  const container = new Nexus();
  await container.init();

  // Register services using tokens and uninstantiated classes
  container.set(USER_SERVICE, UserService);
  container.set(EMAIL_SERVICE, EmailService);
  container.set(AUDIT_SERVICE, AuditService);

  try {
    // Step 1: Create user
    const userService = await container.get(USER_SERVICE);
    const user = await userService.createUser(userData);

    // Step 2: Send welcome email
    const emailService = await container.get(EMAIL_SERVICE);
    await emailService.sendWelcomeEmail(user.email);

    // Step 3: Log audit event
    const auditService = await container.get(AUDIT_SERVICE);
    await auditService.logEvent('user.created', { userId: user.id });

    return user;
  } catch (error) {
    console.error('User registration failed:', error);
    throw error;
  }
}
```

### Conditional Async Loading

```text
// Define tokens
const USER_SERVICE = Symbol('UserService');
const DATABASE_SERVICE = Symbol('DatabaseService');
const ANALYTICS_SERVICE = Symbol('AnalyticsService');
const NOTIFICATION_SERVICE = Symbol('NotificationService');
const CACHE_SERVICE = Symbol('CacheService');

async function loadFeatureServices(features: string[]) {
  const container = new Nexus();
  await container.init();

  // Register core services
  container.set(USER_SERVICE, UserService);
  container.set(DATABASE_SERVICE, DatabaseService);

  // Register feature services conditionally
  if (features.includes('analytics')) {
    container.set(ANALYTICS_SERVICE, AnalyticsService);
  }

  if (features.includes('notifications')) {
    container.set(NOTIFICATION_SERVICE, NotificationService);
  }

  if (features.includes('caching')) {
    container.set(CACHE_SERVICE, CacheService);
  }

  const services = new Map();

  // Load core services
  services.set(USER_SERVICE, await container.get(USER_SERVICE));
  services.set(DATABASE_SERVICE, await container.get(DATABASE_SERVICE));

  // Load feature services conditionally
  if (features.includes('analytics')) {
    services.set(ANALYTICS_SERVICE, await container.get(ANALYTICS_SERVICE));
  }

  if (features.includes('notifications')) {
    services.set(NOTIFICATION_SERVICE, await container.get(NOTIFICATION_SERVICE));
  }

  if (features.includes('caching')) {
    services.set(CACHE_SERVICE, await container.get(CACHE_SERVICE));
  }

  return services;
}
```

## 🛡️ Error Handling Patterns

### Basic Error Handling

```text
@Service()
class UserService {
  constructor(@Inject() private userRepo: UserRepository) {}

  async getUser(id: number): Promise<User> {
    try {
      const user = await this.userRepo.findById(id);
      if (!user) {
        throw new UserNotFoundError(`User with id ${id} not found`);
      }
      return user;
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw error; // Re-throw known errors
      }

      // Log unexpected errors
      console.error('Unexpected error in getUser:', error);
      throw new Error('Failed to get user');
    }
  }
}
```

### Error Recovery Patterns

```text
@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Optional() @Inject() private cacheService?: CacheService
  ) {}

  async getUser(id: number): Promise<User> {
    // Try cache first
    if (this.cacheService) {
      try {
        const cached = await this.cacheService.get(`user:${id}`);
        if (cached) {
          return cached;
        }
      } catch (error) {
        console.warn('Cache read failed, falling back to database:', error);
      }
    }

    // Fallback to database
    try {
      const user = await this.userRepo.findById(id);
      if (!user) {
        throw new UserNotFoundError(`User with id ${id} not found`);
      }

      // Cache the result
      if (this.cacheService) {
        try {
          await this.cacheService.set(`user:${id}`, user);
        } catch (error) {
          console.warn('Cache write failed:', error);
        }
      }

      return user;
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw error;
      }

      console.error('Database read failed:', error);
      throw new Error('Failed to get user');
    }
  }
}
```

### Circuit Breaker Pattern

```text
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}

@Service()
class ExternalApiService {
  private circuitBreaker = new CircuitBreaker();

  async callExternalApi(data: any): Promise<any> {
    return await this.circuitBreaker.execute(async () => {
      // Make external API call
      const response = await fetch('https://api.example.com/data', {
        method: 'POST',
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status}`);
      }

      return await response.json();
    });
  }
}
```

### Retry Pattern

```text
class RetryHandler {
  constructor(
    private maxRetries: number = 3,
    private delay: number = 1000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === this.maxRetries) {
          throw lastError;
        }

        // Exponential backoff
        const delay = this.delay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}

@Service()
class DatabaseService {
  private retryHandler = new RetryHandler();

  async query(sql: string): Promise<any[]> {
    return await this.retryHandler.execute(async () => {
      // Database query implementation
      return await this.executeQuery(sql);
    });
  }

  private async executeQuery(sql: string): Promise<any[]> {
    // Implementation
  }
}
```

## 🔄 Resource Management

### Proper Disposal

```text
// Define tokens
const DATABASE_SERVICE = Symbol('DatabaseService');
const USER_SERVICE = Symbol('UserService');

async function runApplication() {
  const container = new Nexus();
  await container.init();

  try {
    // Register services using tokens and uninstantiated classes
    container.set(DATABASE_SERVICE, DatabaseService);
    container.set(USER_SERVICE, UserService);

    // Use services
    const userService = await container.get(USER_SERVICE);
    const users = await userService.getAllUsers();

    console.log('Users:', users);
  } finally {
    // Always dispose of resources
    await container.dispose();
  }
}

// Using async disposal
async function runApplicationWithDisposal() {
  await using container = new Nexus();
  await container.init();

  // Register services using tokens and uninstantiated classes
  container.set(DATABASE_SERVICE, DatabaseService);
  container.set(USER_SERVICE, UserService);

  // Use services
  const userService = await container.get(USER_SERVICE);
  const users = await userService.getAllUsers();

  console.log('Users:', users);

  // Container is automatically disposed when leaving scope
}
```

### Service Lifecycle Management

```text
@Service()
class DatabaseService implements AsyncDisposable {
  private connection: DatabaseConnection;
  private isConnected = false;

  async connect(config: DatabaseConfig): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      this.connection = await Database.connect(config);
      this.isConnected = true;
      console.log('Database connected');
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw error;
    }
  }

  async query(sql: string): Promise<any[]> {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    return await this.connection.query(sql);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.close();
        this.isConnected = false;
        console.log('Database disconnected');
      } catch (error) {
        console.error('Failed to disconnect from database:', error);
      }
    }
  }
}
```

## 🎯 Best Practices

### 1. Always Handle Errors

```text
// ✅ Good - Proper error handling
async function getUser(id: number) {
  try {
    const user = await userService.getUser(id);
    return user;
  } catch (error) {
    console.error('Failed to get user:', error);
    throw error;
  }
}

// ❌ Bad - No error handling
async function getUser(id: number) {
  const user = await userService.getUser(id); // Could throw
  return user;
}
```

### 2. Use Specific Error Types

```text
// ✅ Good - Specific error types
class UserNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserNotFoundError';
  }
}

async function getUser(id: number) {
  const user = await userService.getUser(id);
  if (!user) {
    throw new UserNotFoundError(`User with id ${id} not found`);
  }
  return user;
}

// ❌ Bad - Generic error types
async function getUser(id: number) {
  const user = await userService.getUser(id);
  if (!user) {
    throw new Error('User not found'); // Too generic
  }
  return user;
}
```

### 3. Use Async/Await Consistently

```text
// ✅ Good - Consistent async/await
async function processUsers() {
  const users = await userService.getAllUsers();
  const processedUsers = await Promise.all(
    users.map(user => processUser(user))
  );
  return processedUsers;
}

// ❌ Bad - Mixing promises and async/await
async function processUsers() {
  const users = await userService.getAllUsers();
  const processedUsers = users.map(user =>
    processUser(user).then(result => result) // Inconsistent
  );
  return Promise.all(processedUsers);
}
```

### 4. Handle Resource Cleanup

```text
// Define tokens
const USER_SERVICE = Symbol('UserService');

// ✅ Good - Proper resource cleanup
async function runApplication() {
  const container = new Nexus();
  await container.init();

  try {
    // Register services using tokens and uninstantiated classes
    container.set(USER_SERVICE, UserService);

    // Use container
    const userService = await container.get(USER_SERVICE);
    // ... use service
  } finally {
    await container.dispose();
  }
}

// ❌ Bad - No resource cleanup
async function runApplication() {
  const container = new Nexus();
  await container.init();

  // Register services using tokens and uninstantiated classes
  container.set(USER_SERVICE, UserService);

  // Use container
  const userService = await container.get(USER_SERVICE);
  // Resources not cleaned up
}
```

## 🔍 Troubleshooting

### Common Async Issues

**Unhandled promise rejections:**

```text
// Always handle promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
```

**Memory leaks:**

```text
// Define tokens
const USER_SERVICE = Symbol('UserService');

// Always dispose of resources
await using container = new Nexus();
await container.init();

// Register services using tokens and uninstantiated classes
container.set(USER_SERVICE, UserService);

// Container is automatically disposed when leaving scope
```

**Race conditions:**

```text
// Use proper synchronization
const results = await Promise.all([
  service1.getData(),
  service2.getData(),
  service3.getData()
]);
```

## 🎯 Next Steps

Ready to explore more async patterns?

- **[Resource Cleanup](/docs/advanced/resource-cleanup)** - Master AsyncDisposable
- **[Native Decorators](/docs/advanced/native-decorators)** - Learn about native decorator support
- **[Performance](performance)** - Optimize your async code
- **[Best Practices](/docs/best-practices)** - Follow proven patterns

---

**Need help with async patterns?** Check out [Resource Cleanup](/docs/advanced/resource-cleanup) to learn about proper resource management! 🚀
