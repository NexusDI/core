---
sidebar_position: 1
title: 'Advanced Patterns'
description: 'Master advanced dependency injection patterns with NexusDI. Learn about circular dependencies, performance optimization, debugging, and enterprise-level patterns.'
tags: ['advanced', 'patterns', 'performance', 'debugging', 'enterprise']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# 🚀 Advanced Patterns

Welcome to the advanced patterns section! You've mastered the basics, and now it's time to explore the deeper mysteries of dependency injection. Think of this as moving from being a Padawan to a Jedi Knight - you'll learn powerful techniques that will make your applications more robust, performant, and maintainable.

## 🎯 What You'll Learn

In this section, we'll explore:

- **Circular Dependencies** - Breaking the cycle of dependency hell
- **Performance Optimization** - Making your container lightning-fast
- **Debugging Techniques** - Diagnosing issues like a pro
- **Enterprise Patterns** - Building large-scale applications
- **Advanced Module Patterns** - Organizing complex applications

## 🔄 Circular Dependencies

Circular dependencies are the bane of every developer's existence. They're like the Death Star's tractor beam - once you're caught, it's hard to escape. But fear not! NexusDI provides several strategies to break these cycles.

### The Problem

```text
// UserService depends on OrderService
@Service()
class UserService {
  constructor(@Inject() private orderService: OrderService) {}
}

// OrderService depends on UserService - CIRCULAR DEPENDENCY!
@Service()
class OrderService {
  constructor(@Inject() private userService: UserService) {}
}
```

### Solution 1: Dependency Inversion

```text
// Create an interface
interface IUserService {
  getUser(id: number): Promise<User>;
}

interface IOrderService {
  getOrders(userId: number): Promise<Order[]>;
}

// Implement the interfaces
@Service()
class UserService implements IUserService {
  constructor(@Inject() private orderService: IOrderService) {}

  async getUser(id: number) {
    const orders = await this.orderService.getOrders(id);
    return { id, orders };
  }
}

@Service()
class OrderService implements IOrderService {
  constructor(@Inject() private userService: IUserService) {}

  async getOrders(userId: number) {
    const user = await this.userService.getUser(userId);
    return user.orders;
  }
}
```

### Solution 2: Lazy Loading

```text
@Service()
class UserService {
  constructor(@Inject() private container: IContainer) {}

  async getUser(id: number) {
    // Resolve OrderService only when needed
    const orderService = this.container.get('orderService');
    const orders = await orderService.getOrders(id);
    return { id, orders };
  }
}
```

### Solution 3: Event-Driven Architecture

```text
@Service()
class UserService {
  constructor(@Inject() private eventBus: EventBus) {}

  async getUser(id: number) {
    const user = await this.loadUser(id);

    // Emit event instead of direct dependency
    this.eventBus.emit('user.loaded', { userId: id, user });

    return user;
  }
}

@Service()
class OrderService {
  constructor(@Inject() private eventBus: EventBus) {
    // Listen for events instead of direct dependency
    this.eventBus.on('user.loaded', this.handleUserLoaded.bind(this));
  }

  private handleUserLoaded(event: UserLoadedEvent) {
    // Handle user loaded event
  }
}
```

## ⚡ Performance Optimization

Performance is crucial in production applications. Here are techniques to make your container as fast as a TIE fighter.

### 1. Service Caching

```text
// Services are cached by default, but you can optimize further
@Service()
class ExpensiveService {
  constructor() {
    // Heavy initialization
    this.initialize();
  }

  private initialize() {
    // Expensive setup code
  }
}

// Use lazy initialization for expensive services
container.set('expensiveService', () => {
  // Only create when first accessed
  return new ExpensiveService();
});
```

### 2. Pre-registration

```text
// Register all services at startup
async function bootstrap() {
  const container = new Nexus();
  await container.init();

  // Pre-register all services
  container.set('userService', () => new UserService());
  container.set('orderService', () => new OrderService());
  container.set('paymentService', () => new PaymentService());

  // Warm up the container
  await container.get('userService');
  await container.get('orderService');
  await container.get('paymentService');

  return container;
}
```

### 3. Batch Operations

```text
// Use setMany for bulk registration
container.setMany({
  userService: () => new UserService(),
  orderService: () => new OrderService(),
  paymentService: () => new PaymentService(),
  emailService: () => new EmailService(),
});
```

### 4. Memory Management

```text
// Implement proper disposal
@Service()
class DatabaseService implements AsyncDisposable {
  private connection: DatabaseConnection;

  async connect() {
    this.connection = await Database.connect();
  }

  async [Symbol.asyncDispose]() {
    if (this.connection) {
      await this.connection.close();
    }
  }
}

// Dispose when done
await container.dispose();
```

## 🔍 Debugging Techniques

Debugging dependency injection can be tricky. Here are some techniques to help you diagnose issues.

### 1. Container Inspection

```text
// Inspect what's registered
console.log('Registered services:', container.getRegisteredServices());

// Check if a service is registered
if (container.has('userService')) {
  console.log('UserService is registered');
}

// Get service metadata
const metadata = container.getServiceMetadata('userService');
console.log('Service metadata:', metadata);
```

### 2. Dependency Graph Visualization

```text
// Create a dependency graph
const graph = container.getDependencyGraph();
console.log('Dependency graph:', graph);

// Find circular dependencies
const cycles = container.findCircularDependencies();
if (cycles.length > 0) {
  console.error('Circular dependencies found:', cycles);
}
```

### 3. Service Lifecycle Logging

```text
// Enable debug logging
container.setDebugMode(true);

// This will log all service creation and resolution
const userService = container.get('userService');
```

### 4. Error Handling

```text
try {
  const userService = container.get('userService');
} catch (error) {
  if (error instanceof NoProvider) {
    console.error('UserService not registered');
  } else if (error instanceof InvalidToken) {
    console.error('Invalid token provided');
  } else {
    console.error('Unknown error:', error);
  }
}
```

## 🏢 Enterprise Patterns

Building large-scale applications requires sophisticated patterns. Here are some enterprise-level techniques.

### 1. Multi-Tenant Architecture

```text
@Service()
class TenantAwareService {
  constructor(@Inject() private tenantContext: TenantContext) {}

  async getData() {
    const tenant = this.tenantContext.getCurrentTenant();
    // Use tenant-specific data
  }
}

// Create tenant-specific containers
const tenantContainers = new Map<string, Nexus>();

function getTenantContainer(tenantId: string) {
  if (!tenantContainers.has(tenantId)) {
    const container = new Nexus();
    container.set('tenantContext', () => new TenantContext(tenantId));
    tenantContainers.set(tenantId, container);
  }
  return tenantContainers.get(tenantId);
}
```

### 2. Plugin Architecture

```text
interface Plugin {
  name: string;
  install(container: Nexus): void;
}

class UserPlugin implements Plugin {
  name = 'user';

  install(container: Nexus) {
    container.set('userService', () => new UserService());
    container.set('userRepository', () => new UserRepository());
  }
}

class PaymentPlugin implements Plugin {
  name = 'payment';

  install(container: Nexus) {
    container.set('paymentService', () => new PaymentService());
    container.set('paymentGateway', () => new PaymentGateway());
  }
}

// Install plugins
const container = new Nexus();
const plugins = [new UserPlugin(), new PaymentPlugin()];

plugins.forEach(plugin => plugin.install(container));
```

### 3. Configuration Management

```text
@Service()
class ConfigService {
  private config: Map<string, any> = new Map();

  set(key: string, value: any) {
    this.config.set(key, value);
  }

  get<T>(key: string): T {
    return this.config.get(key);
  }
}

// Environment-specific configuration
const config = new ConfigService();
config.set('database.url', process.env.DATABASE_URL);
config.set('api.key', process.env.API_KEY);
config.set('debug', process.env.NODE_ENV === 'development');

container.set('config', config);
```

### 4. Health Checks

```text
@Service()
class HealthCheckService {
  constructor(@Inject() private services: Service[]) {}

  async checkHealth() {
    const results = await Promise.allSettled(
      this.services.map(service => service.healthCheck())
    );

    return {
      status: results.every(r => r.status === 'fulfilled')
        ? 'healthy'
        : 'unhealthy',
      services: results.map((result, index) => ({
        name: this.services[index].constructor.name,
        status: result.status,
        error: result.status === 'rejected' ? result.reason : null,
      })),
    };
  }
}
```

## 🎯 Advanced Module Patterns

### 1. Hierarchical Modules

```text
@Module({
  providers: [CoreService],
  exports: [CoreService],
})
class CoreModule {}

@Module({
  providers: [UserService],
  imports: [CoreModule],
  exports: [UserService],
})
class UserModule {}

@Module({
  providers: [AppService],
  imports: [CoreModule, UserModule],
  exports: [AppService],
})
class AppModule {}
```

### 2. Conditional Modules

```text
const createUserModule = (config: AppConfig) => {
  if (config.useMockServices) {
    return new MockUserModule();
  }
  return new UserModule();
};

container.set('userModule', () => createUserModule(appConfig));
```

### 3. Module Composition

```text
@Module({
  providers: [UserService, UserRepository],
  exports: [UserService],
})
class UserModule {}

@Module({
  providers: [OrderService, OrderRepository],
  exports: [OrderService],
})
class OrderModule {}

@Module({
  providers: [AppService],
  imports: [UserModule, OrderModule],
  exports: [AppService],
})
class AppModule {}
```

## 🔧 Testing Advanced Patterns

### 1. Testing Circular Dependencies

```text
describe('Circular Dependencies', () => {
  it('should detect circular dependencies', () => {
    const container = new Nexus();

    // Register services with circular dependency
    container.set(
      'userService',
      () => new UserService(container.get('orderService'))
    );
    container.set(
      'orderService',
      () => new OrderService(container.get('userService'))
    );

    // Should detect the circular dependency
    const cycles = container.findCircularDependencies();
    expect(cycles).toHaveLength(1);
  });
});
```

### 2. Testing Performance

```text
describe('Performance', () => {
  it('should resolve services quickly', async () => {
    const container = new Nexus();
    await container.init();

    container.set('userService', () => new UserService());

    const start = performance.now();
    const userService = container.get('userService');
    const end = performance.now();

    expect(end - start).toBeLessThan(1); // Should resolve in less than 1ms
  });
});
```

## 🚀 Next Steps

Ready to master these advanced patterns?

- **[Circular Dependencies](/docs/advanced/circular-dependencies)** - Deep dive into breaking cycles
- **[Performance Tuning](/docs/advanced/performance-tuning)** - Optimize your container
- **[Debugging Utilities](/docs/advanced/debugging-utilities)** - Master debugging techniques
- **[Best Practices](/docs/best-practices)** - Follow proven patterns

---

**Ready to become a dependency injection master?** Let's explore [Circular Dependencies](/docs/advanced/circular-dependencies) to learn how to break the cycle! 🚀
