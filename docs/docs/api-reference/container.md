---
sidebar_position: 2
title: 'Container Methods'
description: 'Complete reference for all NexusDI container methods. Learn how to use init, get, set, resolve, and other container operations.'
tags: ['container', 'methods', 'api', 'reference', 'nexus']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# 🏺 Container Methods

The NexusDI container is your central hub for managing dependencies. Think of it as the control room of a spaceship - everything flows through it, and it knows exactly how to wire your services together. This reference covers every method available on the container.

## 🚀 Initialization

### `init(): Promise<void>`

Initializes the container and processes all registered services.

```text
const container = new Nexus();
await container.init();
```

**Description:**

- Initializes the container and processes all registered services
- Must be called before using the container
- Idempotent - safe to call multiple times
- Processes eager providers during initialization

**Example:**

```text
import { Nexus, Service, Token } from 'nexusdi-core';

@Service()
class UserService {}

const USER_SERVICE_TOKEN = new Token<UserService>('UserService');

const container = new Nexus();
await container.init();

// Register the service
await container.set(USER_SERVICE_TOKEN, UserService);

// Container is now ready to use
const userService = await container.get(USER_SERVICE_TOKEN);
```

**Throws:**

- `ContainerException` - If initialization fails

## 🔍 Service Retrieval

### `get<T>(token: TokenType<T>): Promise<T>`

Retrieves a service from the container.

```text
const service = await container.get(UserService);
```

**Parameters:**

- `token` - The token identifying the service

**Returns:**

- `Promise<T>` - The resolved service instance

**Example:**

```text
// Class token (recommended)
const userService = await container.get(UserService);

// Token class
const USER_SERVICE_TOKEN = new Token<UserService>('UserService');
const userService = await container.get(USER_SERVICE_TOKEN);

// Symbol token
const USER_SERVICE_SYMBOL = Symbol('UserService');
const userService = await container.get(USER_SERVICE_SYMBOL);
```

**Throws:**

- `NoProvider` - If no provider is registered for the token
- `InvalidToken` - If the token is invalid
- `ContainerException` - If the container is disposed

### `has(token: TokenType<unknown>): boolean`

Checks if a service is registered in the container.

```text
if (container.has(UserService)) {
  const userService = await container.get(UserService);
}
```

**Parameters:**

- `token` - The token to check

**Returns:**

- `boolean` - True if the service is registered

**Example:**

```tsx
// Check if service exists
if (container.has('userService')) {
  console.log('UserService is registered');
} else {
  console.log('UserService is not registered');
}
```

## 📝 Service Registration

### `set<T>(token: TokenType<T>, provider: Provider<T>): void`

Registers a service with the container.

```tsx
container.set('userService', () => new UserService());
```

**Parameters:**

- `token` - The token identifying the service
- `provider` - The provider function or value

**Example:**

```text
// Class provider (uninstantiated)
await container.set(UserService);

// Value provider with Token
const API_KEY_TOKEN = new Token<string>('ApiKey');
await container.set(API_KEY_TOKEN, { useValue: 'your-api-key-here' });

// Factory provider
const USER_SERVICE_TOKEN = new Token<UserService>('UserService');
await container.set(USER_SERVICE_TOKEN, {
  useFactory: async (container) => {
    const db = await container.get(DatabaseService);
    return new UserService(db);
  },
  deps: [DatabaseService]
});

// Provider configuration object
await container.set(USER_SERVICE_TOKEN, {
  useClass: UserService,
  deps: [DatabaseService]
});
```

### `setMany(providers: Record<string, Provider<any>>): void`

Registers multiple services at once.

```text
await container.setMany(
  UserService,
  OrderService,
  { token: API_KEY_TOKEN, useValue: 'your-api-key-here' }
);
```

**Parameters:**

- `providers` - Object mapping tokens to providers

**Example:**

```text
const CONFIG_TOKEN = new Token<Config>('Config');
await container.setMany(
  UserService,
  OrderService,
  EmailService,
  { token: CONFIG_TOKEN, useValue: { apiUrl: 'https://api.example.com', timeout: 5000 } }
);
```

## 🔧 Direct Resolution

### `resolve<T>(ctor: Constructor<T>): Promise<T>`

Resolves a class directly without registration.

```text
const userService = await container.resolve(UserService);
```

**Parameters:**

- `ctor` - The constructor function to resolve

**Returns:**

- `Promise<T>` - The resolved instance

**Example:**

```text
// Resolve a class directly
const userService = await container.resolve(UserService);

// This is equivalent to:
// await container.set(UserService);
// const userService = await container.get(UserService);
```

**Throws:**

- `InvalidToken` - If the constructor is invalid
- `ContainerException` - If resolution fails

## 🌳 Child Containers

### `child(): IContainer`

Creates a child container that inherits from the parent.

```text
const childContainer = container.child();
```

**Returns:**

- `IContainer` - A new child container

**Example:**

```text
// Create child container
const childContainer = container.child();

// Child inherits parent's services
const userService = await childContainer.get(UserService);

// Child can override parent services
await childContainer.set(MockUserService);

// Child's override takes precedence
const mockUserService = await childContainer.get(MockUserService);
```

**Use Cases:**

- Testing with mock services
- Request-scoped services
- Feature-specific overrides

## 🧹 Cleanup

### `dispose(): Promise<void>`

Disposes of the container and all its services.

```text
await container.dispose();
```

**Description:**

- Disposes of all registered services
- Calls `[Symbol.asyncDispose]()` on services that implement it
- Marks the container as disposed
- Idempotent - safe to call multiple times

**Example:**

```text
const container = new Nexus();
await container.init();

try {
  // Use container...
  const userService = await container.get(UserService);
  // ...
} finally {
  // Always dispose when done
  await container.dispose();
}
```

### `[Symbol.asyncDispose](): Promise<void>`

Async disposal method for use with `using` statements.

```tsx
await using container = new Nexus();
await container.init();
// Container will be automatically disposed
```

**Example:**

```tsx
// Using with async disposal
await using container = new Nexus();
await container.init();

// Use container...
const userService = await container.get('userService');

// Container is automatically disposed when leaving scope
```

### `clear(): Promise<void>`

Clears all registrations from the container.

```tsx
await container.clear();
```

**Description:**

- Removes all registered services
- Does not dispose of existing instances
- Container remains usable after clearing

**Example:**

```tsx
// Register some services
container.set('userService', () => new UserService());
container.set('orderService', () => new OrderService());

// Clear all registrations
await container.clear();

// Container is now empty but still usable
console.log(container.has('userService')); // false
```

## 🔍 Advanced Operations

### Service Metadata

The container provides access to service metadata for debugging and introspection.

```tsx
// Get all registered services
const services = container.getRegisteredServices();

// Get service metadata
const metadata = container.getServiceMetadata('userService');

// Check if container is disposed
const isDisposed = container.isDisposed;
```

### Dependency Graph

For debugging circular dependencies and understanding service relationships.

```tsx
// Get dependency graph
const graph = container.getDependencyGraph();

// Find circular dependencies
const cycles = container.findCircularDependencies();
```

## 🎯 Best Practices

### 1. Always Initialize

```tsx
// ✅ Good - Always initialize
const container = new Nexus();
await container.init();

// ❌ Bad - Using without initialization
const container = new Nexus();
const service = await container.get('userService'); // Will throw
```

### 2. Proper Disposal

```tsx
// ✅ Good - Proper disposal
const container = new Nexus();
await container.init();

try {
  // Use container...
} finally {
  await container.dispose();
}

// ✅ Good - Using async disposal
await using container = new Nexus();
await container.init();
// Automatic disposal
```

### 3. Error Handling

```tsx
// ✅ Good - Proper error handling
try {
  const userService = await container.get('userService');
} catch (error) {
  if (error instanceof NoProvider) {
    console.error('Service not registered');
  } else if (error instanceof InvalidToken) {
    console.error('Invalid token');
  } else {
    console.error('Unknown error:', error);
  }
}
```

### 4. Service Registration

```tsx
// ✅ Good - Register services before use
container.set('userService', () => new UserService());
const userService = await container.get('userService');

// ❌ Bad - Getting unregistered service
const userService = await container.get('userService'); // Will throw
```

## 🚀 Performance Tips

### 1. Batch Registration

```tsx
// ✅ Good - Batch registration
container.setMany({
  userService: () => new UserService(),
  orderService: () => new OrderService(),
  emailService: () => new EmailService(),
});

// ❌ Bad - Individual registration
container.set('userService', () => new UserService());
container.set('orderService', () => new OrderService());
container.set('emailService', () => new EmailService());
```

### 2. Lazy Loading

```tsx
// ✅ Good - Lazy loading for expensive services
container.set('expensiveService', () => {
  // Only created when first accessed
  return new ExpensiveService();
});

// ❌ Bad - Eager creation
const expensiveService = new ExpensiveService();
container.set('expensiveService', expensiveService);
```

### 3. Service Caching

```tsx
// ✅ Good - Services are cached by default
const service1 = await container.get('userService');
const service2 = await container.get('userService');
// service1 === service2 (same instance)
```

## 🔍 Troubleshooting

### Common Issues

**Service not found:**

```tsx
// Check if service is registered
if (container.has('userService')) {
  const userService = await container.get('userService');
} else {
  console.error('UserService not registered');
}
```

**Circular dependencies:**

```tsx
// Check for circular dependencies
const cycles = container.findCircularDependencies();
if (cycles.length > 0) {
  console.error('Circular dependencies found:', cycles);
}
```

**Container disposed:**

```tsx
// Check if container is disposed
if (container.isDisposed) {
  console.error('Container has been disposed');
}
```

## 🎯 Next Steps

Ready to explore more container features?

- **[Decorators](/docs/api-reference/decorators)** - Learn about service decorators
- **[Dynamic Modules](/docs/api-reference/dynamic-module)** - Master dynamic module creation
- **[Guards](/docs/api-reference/guards)** - Use type checking utilities
- **[Best Practices](/docs/best-practices)** - Follow proven patterns

---

**Need help with a specific method?** Check out the [Decorators](/docs/api-reference/decorators) reference for how to use service decorators! 🚀
