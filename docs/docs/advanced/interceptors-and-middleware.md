---
sidebar_position: 10
---

# Interceptors & Middleware 🔧

> **Note:** Interceptors and middleware support is planned for future releases. This article provides a basic workaround until official support is added.

Interceptors allow you to add cross-cutting concerns to your dependency injection system. They let you transform and enhance your services as they're being resolved - perfect for when you need to add some middleware magic to your DI setup.

## Basic Workaround

Until official interceptor support is added, you can achieve similar functionality using factory functions:

```typescript
// Simple logging wrapper
function withLogging<T>(token: TokenType<T>, factory: () => T): T {
  console.log(`Creating ${token.toString()}`);
  const instance = factory();
  console.log(`Created ${token.toString()}`);
  return instance;
}

// Usage
container.set(USER_SERVICE, {
  useFactory: () => withLogging(USER_SERVICE, () => new UserService())
});
```

## Advanced Workarounds

### Caching Pattern

```typescript
const cache = new Map<string, any>();

function withCaching<T>(token: TokenType<T>, factory: () => T): T {
  const key = token.toString();
  
  if (cache.has(key)) {
    return cache.get(key);
  }
  
  const instance = factory();
  cache.set(key, instance);
  return instance;
}

// Usage
container.set(DATABASE, {
  useFactory: () => withCaching(DATABASE, () => new ExpensiveDatabase())
});
```

### Validation Pattern

```typescript
function withValidation<T>(token: TokenType<T>, factory: () => T): T {
  const instance = factory();
  
  if (!instance) {
    throw new Error(`Service ${token.toString()} resolved to null/undefined`);
  }
  
  return instance;
}

// Usage
container.set(USER_SERVICE, {
  useFactory: () => withValidation(USER_SERVICE, () => new UserService())
});
```

## Roadmap

Official interceptor and middleware support is planned to include:

- Decorator-based interceptors
- Middleware chains
- Performance monitoring
- Error handling

See the [Roadmap](../roadmap.md) for more details on upcoming features.

## Next Steps

- **[Advanced Providers](advanced-providers-and-factories.md)** - Learn about advanced provider patterns
- **[Performance Tuning](performance-tuning.md)** - Optimize your DI container
- **[Roadmap](../roadmap.md)** - See what's coming next

These workarounds will keep you productive until the full interceptor system arrives! 🔧✨ 