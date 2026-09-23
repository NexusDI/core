---
sidebar_position: 2
title: 'Resource Cleanup & AsyncDisposable'
description: 'Master resource cleanup in NexusDI with AsyncDisposable. Learn how to properly manage database connections, file handles, and other resources.'
tags: ['resource-cleanup', 'asyncdisposable', 'disposal', 'memory-management']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# 🧹 Resource Cleanup & AsyncDisposable

Welcome to the advanced world of resource management in NexusDI! Just as a Jedi must properly maintain their lightsaber, you must properly manage your application's resources to prevent memory leaks and ensure optimal performance. This guide will teach you how to wield the power of AsyncDisposable like a true master.

## 🎯 Why Resource Cleanup Matters

Proper resource cleanup is crucial for:

- **Memory Management** - Prevent memory leaks
- **Resource Efficiency** - Free up system resources
- **Performance** - Avoid resource exhaustion
- **Reliability** - Ensure graceful shutdowns
- **Debugging** - Easier to identify resource issues

## 🚀 AsyncDisposable Interface

NexusDI implements the `AsyncDisposable` interface, which provides a standard way to clean up resources asynchronously.

```tsx
interface AsyncDisposable {
  [Symbol.asyncDispose](): Promise<void>;
}
```

### Basic Implementation

```tsx
import { AsyncDisposable } from 'nexusdi-core';

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

## 🔧 Container Disposal

### Manual Disposal

```tsx
async function runApplication() {
  const container = new Nexus();
  await container.init();

  try {
    // Register services
    container.set('databaseService', () => new DatabaseService());
    container.set('userService', () => new UserService());

    // Use services
    const userService = await container.get('userService');
    const users = await userService.getAllUsers();

    console.log('Users:', users);
  } finally {
    // Always dispose of resources
    await container.dispose();
  }
}
```

### Automatic Disposal with `using`

```tsx
async function runApplicationWithDisposal() {
  await using container = new Nexus();
  await container.init();

  // Register services
  container.set('databaseService', () => new DatabaseService());
  container.set('userService', () => new UserService());

  // Use services
  const userService = await container.get('userService');
  const users = await userService.getAllUsers();

  console.log('Users:', users);

  // Container is automatically disposed when leaving scope
}
```

## 🏗️ Service Lifecycle Management

### Service with Resource Management

```tsx
@Service()
class FileService implements AsyncDisposable {
  private fileHandles = new Map<string, FileHandle>();
  private isDisposed = false;

  async openFile(filePath: string): Promise<FileHandle> {
    if (this.isDisposed) {
      throw new Error('Service has been disposed');
    }

    try {
      const handle = await FileSystem.open(filePath, 'r');
      this.fileHandles.set(filePath, handle);
      return handle;
    } catch (error) {
      console.error('Failed to open file:', error);
      throw error;
    }
  }

  async readFile(filePath: string): Promise<string> {
    const handle = this.fileHandles.get(filePath);
    if (!handle) {
      throw new Error('File not open');
    }

    return await handle.read();
  }

  async closeFile(filePath: string): Promise<void> {
    const handle = this.fileHandles.get(filePath);
    if (handle) {
      await handle.close();
      this.fileHandles.delete(filePath);
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    // Close all open files
    const closePromises = Array.from(this.fileHandles.entries()).map(
      async ([filePath, handle]) => {
        try {
          await handle.close();
          console.log(`Closed file: ${filePath}`);
        } catch (error) {
          console.error(`Failed to close file ${filePath}:`, error);
        }
      }
    );

    await Promise.allSettled(closePromises);
    this.fileHandles.clear();
  }
}
```

### Service with External Resource Management

```tsx
@Service()
class ExternalApiService implements AsyncDisposable {
  private httpClient: HttpClient;
  private activeRequests = new Set<AbortController>();
  private isDisposed = false;

  constructor() {
    this.httpClient = new HttpClient();
  }

  async makeRequest(url: string, options: RequestOptions = {}): Promise<any> {
    if (this.isDisposed) {
      throw new Error('Service has been disposed');
    }

    const controller = new AbortController();
    this.activeRequests.add(controller);

    try {
      const response = await this.httpClient.request(url, {
        ...options,
        signal: controller.signal,
      });

      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request was aborted');
      }
      throw error;
    } finally {
      this.activeRequests.delete(controller);
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    // Abort all active requests
    for (const controller of this.activeRequests) {
      controller.abort();
    }

    // Close HTTP client
    if (this.httpClient) {
      await this.httpClient.close();
    }

    this.activeRequests.clear();
  }
}
```

## 🔄 Complex Resource Scenarios

### Nested Resource Management

```tsx
@Service()
class DatabaseService implements AsyncDisposable {
  private connection: DatabaseConnection;
  private transaction: Transaction | null = null;
  private isDisposed = false;

  async connect(config: DatabaseConfig): Promise<void> {
    this.connection = await Database.connect(config);
  }

  async beginTransaction(): Promise<Transaction> {
    if (this.isDisposed) {
      throw new Error('Service has been disposed');
    }

    if (this.transaction) {
      throw new Error('Transaction already in progress');
    }

    this.transaction = await this.connection.beginTransaction();
    return this.transaction;
  }

  async commitTransaction(): Promise<void> {
    if (this.transaction) {
      await this.transaction.commit();
      this.transaction = null;
    }
  }

  async rollbackTransaction(): Promise<void> {
    if (this.transaction) {
      await this.transaction.rollback();
      this.transaction = null;
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    try {
      // Rollback any active transaction
      if (this.transaction) {
        await this.transaction.rollback();
        this.transaction = null;
      }

      // Close connection
      if (this.connection) {
        await this.connection.close();
      }
    } catch (error) {
      console.error('Error during database disposal:', error);
    }
  }
}
```

### Resource Pool Management

```tsx
@Service()
class ConnectionPoolService implements AsyncDisposable {
  private pool: ConnectionPool;
  private activeConnections = new Set<Connection>();
  private isDisposed = false;

  constructor(private config: PoolConfig) {
    this.pool = new ConnectionPool(config);
  }

  async initialize(): Promise<void> {
    await this.pool.initialize();
  }

  async getConnection(): Promise<Connection> {
    if (this.isDisposed) {
      throw new Error('Pool has been disposed');
    }

    const connection = await this.pool.acquire();
    this.activeConnections.add(connection);

    // Set up cleanup when connection is released
    const originalRelease = connection.release.bind(connection);
    connection.release = () => {
      this.activeConnections.delete(connection);
      return originalRelease();
    };

    return connection;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    // Wait for all active connections to be released
    const maxWaitTime = 5000; // 5 seconds
    const startTime = Date.now();

    while (
      this.activeConnections.size > 0 &&
      Date.now() - startTime < maxWaitTime
    ) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Force close remaining connections
    for (const connection of this.activeConnections) {
      try {
        await connection.forceClose();
      } catch (error) {
        console.error('Error force-closing connection:', error);
      }
    }

    this.activeConnections.clear();

    // Dispose of the pool
    await this.pool.dispose();
  }
}
```

## 🎯 Error Handling in Disposal

### Safe Disposal Pattern

```tsx
@Service()
class SafeResourceService implements AsyncDisposable {
  private resources = new Map<string, DisposableResource>();
  private isDisposed = false;

  async addResource(id: string, resource: DisposableResource): Promise<void> {
    if (this.isDisposed) {
      throw new Error('Service has been disposed');
    }

    this.resources.set(id, resource);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    // Dispose of all resources safely
    const disposalPromises = Array.from(this.resources.entries()).map(
      async ([id, resource]) => {
        try {
          await resource.dispose();
          console.log(`Resource ${id} disposed successfully`);
        } catch (error) {
          console.error(`Failed to dispose resource ${id}:`, error);
          // Continue with other resources even if one fails
        }
      }
    );

    // Wait for all disposals to complete
    await Promise.allSettled(disposalPromises);
    this.resources.clear();
  }
}
```

### Disposal with Timeout

```tsx
@Service()
class TimeoutResourceService implements AsyncDisposable {
  private resources = new Set<DisposableResource>();
  private isDisposed = false;

  async addResource(resource: DisposableResource): Promise<void> {
    if (this.isDisposed) {
      throw new Error('Service has been disposed');
    }

    this.resources.add(resource);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    const timeout = 5000; // 5 seconds
    const disposalPromise = this.disposeAllResources();

    try {
      await Promise.race([
        disposalPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Disposal timeout')), timeout)
        ),
      ]);
    } catch (error) {
      console.error('Disposal failed or timed out:', error);
    }
  }

  private async disposeAllResources(): Promise<void> {
    const disposalPromises = Array.from(this.resources).map(async resource => {
      try {
        await resource.dispose();
      } catch (error) {
        console.error('Resource disposal failed:', error);
      }
    });

    await Promise.allSettled(disposalPromises);
    this.resources.clear();
  }
}
```

## 🔧 Best Practices

### 1. Always Implement AsyncDisposable for Resources

```tsx
// ✅ Good - Proper resource management
@Service()
class DatabaseService implements AsyncDisposable {
  private connection: DatabaseConnection;

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.connection) {
      await this.connection.close();
    }
  }
}

// ❌ Bad - No resource cleanup
@Service()
class DatabaseService {
  private connection: DatabaseConnection;
  // No disposal method - memory leak!
}
```

### 2. Use Try-Finally for Manual Disposal

```tsx
// ✅ Good - Guaranteed disposal
async function useService() {
  const container = new Nexus();
  await container.init();

  try {
    // Use services
  } finally {
    await container.dispose();
  }
}

// ❌ Bad - Disposal might not happen
async function useService() {
  const container = new Nexus();
  await container.init();

  // Use services
  await container.dispose(); // Might not execute if error occurs
}
```

### 3. Handle Disposal Errors Gracefully

```tsx
// ✅ Good - Handle disposal errors
async [Symbol.asyncDispose](): Promise<void> {
  try {
    await this.connection.close();
  } catch (error) {
    console.error('Failed to close connection:', error);
    // Don't throw - continue with other cleanup
  }
}

// ❌ Bad - Throwing in disposal
async [Symbol.asyncDispose](): Promise<void> {
  await this.connection.close(); // Might throw and prevent other cleanup
}
```

### 4. Use Disposal State Checks

```tsx
// ✅ Good - Check disposal state
async doSomething(): Promise<void> {
  if (this.isDisposed) {
    throw new Error('Service has been disposed');
  }

  // Do work
}

// ❌ Bad - No disposal state check
async doSomething(): Promise<void> {
  // Do work - might fail silently if disposed
}
```

## 🔍 Troubleshooting

### Common Resource Issues

**Memory leaks:**

```tsx
// Make sure to implement AsyncDisposable
@Service()
class MyService implements AsyncDisposable {
  async [Symbol.asyncDispose](): Promise<void> {
    // Clean up resources
  }
}
```

**Disposal errors:**

```tsx
// Handle disposal errors gracefully
async [Symbol.asyncDispose](): Promise<void> {
  try {
    await this.cleanup();
  } catch (error) {
    console.error('Cleanup failed:', error);
    // Don't throw - continue with other cleanup
  }
}
```

**Resource not disposed:**

```tsx
// Always dispose of the container
await using container = new Nexus();
await container.init();
// Container is automatically disposed
```

## 🎯 Next Steps

Ready to explore more resource management features?

- **[Async Patterns](/docs/advanced/async-patterns)** - Master async/await patterns
- **[Native Decorators](/docs/advanced/native-decorators)** - Learn about native decorator support
- **[Performance](performance)** - Optimize your resource usage
- **[Best Practices](/docs/best-practices)** - Follow proven patterns

---

**Need help with resource cleanup?** Check out [Async Patterns](/docs/advanced/async-patterns) to learn about proper async resource management! 🚀
